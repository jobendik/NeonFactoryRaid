import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Pickup, type PickupType } from '../entities/Pickup';
import { Generator } from '../entities/Machine';
import { InputSystem } from '../systems/InputSystem';
import { Economy } from '../systems/EconomySystem';
import { saveSystem } from '../platform/SaveSystem';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';
import { bus, Events } from '../core/EventBus';

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

    this.deployState = 'idle';
    this.deployHold = 0;
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

    const magnetRadius = Balance.magnet.baseRadius;
    for (const child of this.pickups.getChildren()) {
      const p = child as Pickup;
      if (p.active) p.updateMagnet(dt, this.player.x, this.player.y, magnetRadius);
    }

    this.tickDeployPad(dt);
  }

  shutdown(): void {
    this.inputSystem.destroy();
    for (const gen of this.generators) gen.destroy();
    this.generators = [];
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
