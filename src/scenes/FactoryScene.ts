import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Pickup, type PickupType } from '../entities/Pickup';
import { Generator } from '../entities/Machine';
import { Drone } from '../entities/Drone';
import { InputSystem } from '../systems/InputSystem';
import { Economy } from '../systems/EconomySystem';
import { UpgradeEffects } from '../systems/UpgradeSystem';
import { saveSystem } from '../platform/SaveSystem';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';
import { bus, Events } from '../core/EventBus';
import { UpgradeCard } from '../ui/UpgradeCard';
import { UPGRADE_KEYS } from '../config/UpgradeDefs';

// FactoryScene per blueprint §8. The factory is a "living place": the player
// physically walks around to pick up the scrap dropping out of generators, and
// stands on a deploy pad to launch a new raid.
//
// M8 implements:
//   - Player + InputSystem (same as raid)
//   - Generators that pulse and drop scrap on a cadence set by SPM (§8.7)
//   - Pickup pool + magnet (reused from raid)
//   - Deploy pad as a physical object - hold for `holdSec` to start a raid
//   - Walking on collected scrap banks it directly to saveSystem.get().scrap
//
// Future milestones layer on: M9 adds the upgrade panel and additional machine
// types, M10 adds offline production + persistence.

type DeployState = 'idle' | 'holding' | 'launching';

export class FactoryScene extends Phaser.Scene {
  private player!: Player;
  private inputSystem!: InputSystem;
  private pickups!: Phaser.GameObjects.Group;
  private generators: Generator[] = [];

  private padX = Balance.factory.deployPad.x;
  private padY = Balance.factory.deployPad.y;
  private padRadius = Balance.factory.deployPad.radius;
  private padBase!: Phaser.GameObjects.Graphics;
  private padFill!: Phaser.GameObjects.Graphics;
  private deployHold = 0;
  private deployState: DeployState = 'idle';
  private drones: Drone[] = [];
  private upgradeCards: UpgradeCard[] = [];
  private milestoneVisuals: Phaser.GameObjects.GameObject[] = [];
  private onUpgradePurchased = (..._args: unknown[]): void => this.handleUpgradePurchased();

  constructor() {
    super({ key: 'FactoryScene' });
  }

  create(): void {
    const wb = Balance.player.worldBounds;
    const width = wb.maxX - wb.minX;
    const height = wb.maxY - wb.minY;
    this.physics.world.setBounds(wb.minX, wb.minY, width, height);
    this.cameras.main.setBounds(wb.minX, wb.minY, width, height);
    this.cameras.main.setBackgroundColor(Balance.factory.backgroundColor);

    this.drawBackground();
    this.drawPad();

    this.player = new Player(this, 0, 0);
    this.cameras.main.startFollow(
      this.player,
      true,
      Balance.ui.cameraFollowLerp,
      Balance.ui.cameraFollowLerp,
    );

    this.inputSystem = new InputSystem(this);

    this.pickups = this.add.group({
      classType: Pickup,
      maxSize: Balance.performance.maxPickups,
      runChildUpdate: false,
    });
    this.physics.add.overlap(this.player, this.pickups, this.onPickupOverlap, undefined, this);

    this.spawnGenerators();
    this.spawnMilestoneVisuals();
    this.spawnDrones();
    this.buildUpgradePanel();

    this.deployState = 'idle';
    this.deployHold = 0;

    bus.on(Events.UPGRADE_PURCHASED, this.onUpgradePurchased);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(Balance.performance.dtClamp, deltaMs / 1000);

    const frame = this.inputSystem.getInput();
    this.player.update(dt, frame);

    // Generators tick on the SPM cadence; output divides across active gens so
    // total factory throughput tracks SPM exactly.
    for (const gen of this.generators) {
      if (gen.tick(dt)) this.spawnScrapAt(gen);
    }

    for (const drone of this.drones) drone.update(dt, this.player.x, this.player.y);

    const baseRadius = UpgradeEffects.magnetRadius();
    for (const child of this.pickups.getChildren()) {
      const p = child as Pickup;
      if (!p.active) continue;
      // Drones extend the effective magnet by acting as secondary pull sources.
      // Whichever of (player, drone) is closest within its radius wins.
      let pullX = this.player.x;
      let pullY = this.player.y;
      let radius = baseRadius;
      const dxP = p.x - this.player.x;
      const dyP = p.y - this.player.y;
      let bestD = Math.hypot(dxP, dyP);
      for (const drone of this.drones) {
        const pos = drone.getPosition();
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        const d = Math.hypot(dx, dy);
        if (d < bestD && d <= drone.getPickupRadius()) {
          bestD = d;
          pullX = pos.x;
          pullY = pos.y;
          radius = drone.getPickupRadius();
        }
      }
      p.updateMagnet(dt, pullX, pullY, radius);
    }

    this.tickDeployPad(dt);
  }

  shutdown(): void {
    bus.off(Events.UPGRADE_PURCHASED, this.onUpgradePurchased);
    this.inputSystem.destroy();
    for (const gen of this.generators) gen.destroy();
    this.generators = [];
    for (const drone of this.drones) drone.destroy();
    this.drones = [];
    for (const card of this.upgradeCards) card.destroy();
    this.upgradeCards = [];
    for (const v of this.milestoneVisuals) v.destroy();
    this.milestoneVisuals = [];
  }

  // ---- accessors used by HUDScene ----

  getSpm(): number {
    return Economy.computeSpm();
  }

  getDeployHoldRatio(): number {
    if (this.deployState === 'idle') return 0;
    return Math.min(1, this.deployHold / Balance.factory.deployPad.holdSec);
  }

  // ---- internals ----

  private spawnGenerators(): void {
    // M8 ships gen_level=1 → one generator visible. Once Gen Lv. 2 unlocks in M9
    // the second slot from generatorPositions slides in (per §8.5).
    const genLevel = Math.max(1, saveSystem.get().upgrades.gen);
    const slots = Balance.factory.generatorPositions.slice(0, Math.min(genLevel, Balance.factory.generatorPositions.length));
    const totalIntervalSec = Economy.generatorDropIntervalSec();
    // Each generator runs at the slowest cadence such that aggregate output = SPM.
    // With N generators sharing the SPM, each generator's interval is N × baseInterval.
    const perGenInterval = totalIntervalSec * Math.max(1, slots.length);
    for (const slot of slots) {
      this.generators.push(new Generator(this, slot.x, slot.y, perGenInterval));
    }
  }

  private spawnScrapAt(gen: Generator): void {
    const pos = gen.randomDropPosition();
    const p = this.pickups.get(pos.x, pos.y) as Pickup | null;
    if (!p) return;
    p.spawn(pos.x, pos.y, 'scrap', 1);
  }

  private spawnDrones(): void {
    const count = UpgradeEffects.droneCount();
    const withTrail = count >= 3; // §8.5 "Drone Lv. 3: drones gain trails"
    const orbitRadius = 56;
    const orbitSpeed = 2.4;
    for (let i = 0; i < count; i++) {
      const baseAngle = (i / Math.max(1, count)) * Math.PI * 2;
      this.drones.push(
        new Drone(this, {
          orbitRadius,
          orbitSpeed,
          baseAngle,
          pickupRadius: 110,
          withTrail,
        }),
      );
    }
  }

  private buildUpgradePanel(): void {
    const panelW = 300;
    const x = this.scale.width - panelW;
    const startY = 100;
    const rowGap = 96;

    // Panel header
    const header = this.add
      .text(x + 10, startY - 30, 'FACTORY UPGRADES', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#22f6ff',
      })
      .setScrollFactor(0)
      .setDepth(2000);
    this.milestoneVisuals.push(header);

    for (let i = 0; i < UPGRADE_KEYS.length; i++) {
      const key = UPGRADE_KEYS[i];
      const card = new UpgradeCard(this, key, x + 10, startY + i * rowGap);
      card.refresh();
      this.upgradeCards.push(card);
    }
  }

  private handleUpgradePurchased(): void {
    // Refresh affordability + level text on every card after any purchase.
    for (const card of this.upgradeCards) card.refresh();
    // Player numeric stats (HP, speed) refresh immediately for the in-factory feel.
    this.player.refreshFromUpgrades();
    // Some upgrades require live changes to the factory floor (more generators,
    // a new drone, new placeholder visuals).
    this.rebuildFactoryFloor();
  }

  private rebuildFactoryFloor(): void {
    for (const gen of this.generators) gen.destroy();
    this.generators = [];
    for (const drone of this.drones) drone.destroy();
    this.drones = [];
    for (const v of this.milestoneVisuals.filter(v => v.getData('milestone') === true)) v.destroy();
    this.milestoneVisuals = this.milestoneVisuals.filter(v => v.getData('milestone') !== true);

    this.spawnGenerators();
    this.spawnMilestoneVisuals();
    this.spawnDrones();
  }

  private spawnMilestoneVisuals(): void {
    const save = saveSystem.get();
    const gen = save.upgrades.gen;
    const magnet = save.upgrades.magnet;

    // Gen Lv. 3: conveyor belts connect generators (placeholder line strip).
    if (gen >= 3 && this.generators.length >= 2) {
      const a = this.generators[0];
      const b = this.generators[1];
      const belt = this.add.graphics();
      belt.setDepth(1);
      belt.lineStyle(8, 0x202a3a, 1);
      belt.lineBetween(a.x, a.y, b.x, b.y);
      belt.lineStyle(2, 0x22f6ff, 0.5);
      belt.lineBetween(a.x, a.y, b.x, b.y);
      belt.setData('milestone', true);
      this.milestoneVisuals.push(belt);
    }

    // Gen Lv. 5: factory expands - zoom camera out slightly.
    this.cameras.main.setZoom(gen >= 5 ? 0.88 : 1);

    // Gen Lv. 10: reactor core in center (labeled placeholder).
    if (gen >= 10) {
      const reactor = this.add.rectangle(0, 0, 80, 80, 0xffd75a, 0.35);
      reactor.setStrokeStyle(2, 0xffd75a, 0.85);
      reactor.setDepth(1);
      reactor.setData('milestone', true);
      this.milestoneVisuals.push(reactor);
      const label = this.add
        .text(0, 0, 'REACTOR', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffd75a',
        })
        .setOrigin(0.5)
        .setDepth(2);
      label.setData('milestone', true);
      this.milestoneVisuals.push(label);
    }

    // Magnet Lv. 3+: visible coil pillar (placeholder).
    if (magnet >= 3) {
      const coil = this.add.rectangle(-200, 220, 40, 60, 0x22f6ff, 0.55);
      coil.setStrokeStyle(2, 0x22f6ff, 0.9);
      coil.setDepth(1);
      coil.setData('milestone', true);
      this.milestoneVisuals.push(coil);
      const label = this.add
        .text(-200, 260, 'COIL', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#22f6ff',
        })
        .setOrigin(0.5)
        .setDepth(2);
      label.setData('milestone', true);
      this.milestoneVisuals.push(label);
    }
  }

  private onPickupOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, pickupObj) => {
    const p = pickupObj as Pickup;
    if (!p.active) return;
    const type: PickupType = p.type;
    const value = p.value;
    if (type === 'scrap') Economy.bankLoot(value, 0);
    else Economy.bankLoot(0, value);
    p.kill();
    bus.emit(Events.PICKUP_COLLECTED, type, value);
  };

  private tickDeployPad(dt: number): void {
    if (this.deployState === 'launching') return;
    const dx = this.player.x - this.padX;
    const dy = this.player.y - this.padY;
    const onPad = Math.hypot(dx, dy) <= this.padRadius;
    if (onPad) {
      this.deployHold = Math.min(Balance.factory.deployPad.holdSec, this.deployHold + dt);
      this.deployState = 'holding';
      if (this.deployHold >= Balance.factory.deployPad.holdSec) {
        this.deployState = 'launching';
        this.scene.start('RaidScene');
        return;
      }
    } else {
      this.deployHold = Math.max(0, this.deployHold - dt * 2);
      if (this.deployHold <= 0) this.deployState = 'idle';
    }
    this.drawPadFill();
  }

  private drawBackground(): void {
    const wb = Balance.player.worldBounds;
    const grid = this.add.graphics();
    grid.lineStyle(1, Balance.colors.background, Balance.ui.gridAlpha);
    const step = Balance.ui.gridStep;
    for (let x = wb.minX; x <= wb.maxX; x += step) {
      grid.moveTo(x, wb.minY);
      grid.lineTo(x, wb.maxY);
    }
    for (let y = wb.minY; y <= wb.maxY; y += step) {
      grid.moveTo(wb.minX, y);
      grid.lineTo(wb.maxX, y);
    }
    grid.strokePath();
  }

  private drawPad(): void {
    this.padBase = this.add.graphics();
    this.padBase.setDepth(2);
    this.padBase.fillStyle(Balance.colors.extraction, 0.14);
    this.padBase.fillCircle(this.padX, this.padY, this.padRadius);
    this.padBase.lineStyle(3, Balance.colors.extraction, 0.85);
    this.padBase.strokeCircle(this.padX, this.padY, this.padRadius);
    this.padBase.lineStyle(1, Balance.colors.extraction, 0.4);
    this.padBase.strokeCircle(this.padX, this.padY, this.padRadius * 0.55);

    this.padFill = this.add.graphics();
    this.padFill.setDepth(3);

    this.add
      .text(this.padX, this.padY + this.padRadius + 18, Strings.factoryDeployHint, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#72ff9f',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
  }

  private drawPadFill(): void {
    this.padFill.clear();
    if (this.deployHold <= 0) return;
    const ratio = this.deployHold / Balance.factory.deployPad.holdSec;
    this.padFill.lineStyle(6, Balance.colors.extraction, 1);
    const start = -Math.PI / 2;
    const end = start + ratio * Math.PI * 2;
    this.padFill.beginPath();
    this.padFill.arc(this.padX, this.padY, this.padRadius * 0.82, start, end, false);
    this.padFill.strokePath();
  }
}
