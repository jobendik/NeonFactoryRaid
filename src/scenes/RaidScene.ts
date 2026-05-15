import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Pickup, type PickupType } from '../entities/Pickup';
import { Bullet } from '../entities/Bullet';
import { InputSystem } from '../systems/InputSystem';
import { WaveDirector } from '../systems/WaveDirector';
import { WeaponSystem } from '../systems/WeaponSystem';
import { ParticleEffects } from '../systems/ParticleEffects';
import { ExtractionSystem } from '../systems/ExtractionSystem';
import { GreedSystem } from '../systems/GreedSystem';
import { Balance } from '../config/Balance';
import { EnemyDefs } from '../config/EnemyDefs';
import { bus, Events } from '../core/EventBus';
import { playRisingChord } from '../platform/Audio';
import type { RaidEndState, RaidEndPayload } from '../core/types';

type RaidPhase = 'active' | 'extracting' | 'ended';

// RaidScene drives the raid lifecycle. Through M6 it owns:
//   - the player, enemies, pickups, bullets pools
//   - WaveDirector / WeaponSystem / ParticleEffects / ExtractionSystem
//   - the combo + run-loot accumulator
//   - the active->extracting->ended state machine and transition to SummaryScene
//
// Combo scales the VALUE of each drop (not the count) per the M5 gate decision:
// count-scaling explodes pickup population at high combo and hits the maxPickups cap.
// Greed multiplier (M7) will further scale banked loot on successful extract.

export class RaidScene extends Phaser.Scene {
  private player!: Player;
  private inputSystem!: InputSystem;
  private enemies!: Phaser.GameObjects.Group;
  private pickups!: Phaser.GameObjects.Group;
  private bullets!: Phaser.GameObjects.Group;
  private waveDirector!: WaveDirector;
  private weapons!: WeaponSystem;
  private particles!: ParticleEffects;
  private extraction!: ExtractionSystem;
  private greed!: GreedSystem;
  private runLoot = { scrap: 0, cores: 0 };
  private combo = 1.0;
  private comboGrace = 0;
  private timeRemaining: number = Balance.raid.normalDuration;
  private activePopups = 0;
  private phase: RaidPhase = 'active';
  private extractTimer = 0;
  private onPlayerDied = (): void => this.requestEnd('failed');
  private onExtractionComplete = (): void => this.beginExtractionMoment();
  private onExtractionOpened = (): void => this.greed.start();

  constructor() {
    super({ key: 'RaidScene' });
  }

  create(): void {
    const wb = Balance.player.worldBounds;
    const width = wb.maxX - wb.minX;
    const height = wb.maxY - wb.minY;
    this.physics.world.setBounds(wb.minX, wb.minY, width, height);
    this.cameras.main.setBounds(wb.minX, wb.minY, width, height);
    this.cameras.main.setBackgroundColor(Balance.rendering.backgroundColor);

    this.drawBackground();

    this.player = new Player(this, 0, 0);
    this.cameras.main.startFollow(
      this.player,
      true,
      Balance.ui.cameraFollowLerp,
      Balance.ui.cameraFollowLerp,
    );

    this.inputSystem = new InputSystem(this);

    this.enemies = this.add.group({
      classType: Enemy,
      maxSize: Balance.enemies.maxOnScreen,
      runChildUpdate: false,
    });
    this.pickups = this.add.group({
      classType: Pickup,
      maxSize: Balance.performance.maxPickups,
      runChildUpdate: false,
    });
    this.bullets = this.add.group({
      classType: Bullet,
      maxSize: Balance.shooter.bulletMaxOnField,
      runChildUpdate: false,
    });
    this.physics.add.overlap(this.player, this.pickups, this.onPickupOverlap, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerEnemyOverlap, undefined, this);
    this.physics.add.overlap(this.player, this.bullets, this.onPlayerBulletOverlap, undefined, this);

    this.waveDirector = new WaveDirector(this.enemies, () => ({
      x: this.player.x,
      y: this.player.y,
    }));
    this.waveDirector.start();

    this.particles = new ParticleEffects(this);
    this.weapons = new WeaponSystem(
      this,
      () => ({ x: this.player.x, y: this.player.y }),
      () => this.enemies.getChildren(),
    );

    this.extraction = new ExtractionSystem(
      this,
      Balance.extraction.padX,
      Balance.extraction.padY,
      Balance.extraction.padRadius,
      Balance.raid.extractionOpenTime,
    );

    this.greed = new GreedSystem();

    this.runLoot.scrap = 0;
    this.runLoot.cores = 0;
    this.combo = 1.0;
    this.comboGrace = 0;
    this.timeRemaining = Balance.raid.normalDuration;
    this.phase = 'active';
    this.extractTimer = 0;

    bus.on(Events.PLAYER_DIED, this.onPlayerDied);
    bus.on(Events.EXTRACTION_COMPLETE, this.onExtractionComplete);
    bus.on(Events.EXTRACTION_OPENED, this.onExtractionOpened);

    bus.emit(Events.RAID_STARTED);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(Balance.performance.dtClamp, deltaMs / 1000);

    if (this.phase === 'ended') return;

    if (this.phase === 'extracting') {
      this.updateExtractionMoment(dt);
      return;
    }

    this.timeRemaining = Math.max(0, this.timeRemaining - dt);

    const frame = this.inputSystem.getInput();
    this.player.update(dt, frame);
    this.waveDirector.update(dt);
    this.extraction.update(dt, this.player.x, this.player.y);
    this.greed.update(dt);

    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (!e.active) continue;
      const r = e.tick(dt, this.player.x, this.player.y);
      if (r.fired) this.spawnEnemyBullet(r.fired.fromX, r.fired.fromY, r.fired.dirX, r.fired.dirY);
    }

    const hit = this.weapons.update(dt);
    if (hit) {
      const targetX = hit.target.x;
      const targetY = hit.target.y;
      const killed = hit.target.hit(hit.damage);
      this.showPopup(targetX, targetY - 16, `-${Math.round(hit.damage)}`, '#ffffff');
      if (killed) {
        const dead = hit.target;
        this.particles.enemyDeath(dead.kind, dead.x, dead.y);
        this.spawnDrops(dead);
        dead.kill();
        this.onEnemyKilled();
      }
    }

    const magnetRadius = Balance.magnet.baseRadius;
    for (const child of this.pickups.getChildren()) {
      const p = child as Pickup;
      if (p.active) p.updateMagnet(dt, this.player.x, this.player.y, magnetRadius);
    }

    this.tickBullets(dt);
    this.tickCombo(dt);

    if (this.timeRemaining <= 0) {
      this.requestEnd('collapsed');
    }
  }

  shutdown(): void {
    bus.off(Events.PLAYER_DIED, this.onPlayerDied);
    bus.off(Events.EXTRACTION_COMPLETE, this.onExtractionComplete);
    bus.off(Events.EXTRACTION_OPENED, this.onExtractionOpened);
    this.waveDirector.stop();
    this.inputSystem.destroy();
    this.particles.destroy();
    this.extraction.destroy();
    this.greed.stop();
    bus.emit(Events.RAID_ENDED);
  }

  // ---- accessors used by HUDScene ----

  getTimeRemaining(): number {
    return this.timeRemaining;
  }

  getCombo(): number {
    return this.combo;
  }

  getRunLoot(): { scrap: number; cores: number } {
    return { scrap: this.runLoot.scrap, cores: this.runLoot.cores };
  }

  getPlayerHP(): { hp: number; max: number } {
    return { hp: this.player.hp, max: this.player.maxHp };
  }

  getExtractionInfo(): { open: boolean; padX: number; padY: number; fill: number } {
    const pos = this.extraction.getPadPosition();
    return {
      open: this.extraction.isOpen(),
      padX: pos.x,
      padY: pos.y,
      fill: this.extraction.getFill(),
    };
  }

  getGreedInfo(): { active: boolean; mult: number; elapsed: number } {
    return {
      active: this.greed.isRunning(),
      mult: this.greed.getMultiplier(),
      elapsed: this.greed.getElapsed(),
    };
  }

  // ---- overlap callbacks ----

  private onPickupOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, pickupObj) => {
    const p = pickupObj as Pickup;
    if (!p.active) return;
    const type: PickupType = p.type;
    const value = p.value;
    if (type === 'scrap') this.runLoot.scrap += value;
    else this.runLoot.cores += value;
    if (value > 1) {
      this.showPopup(
        p.x,
        p.y - 10,
        `+${value}`,
        type === 'scrap' ? '#22f6ff' : '#ffd75a',
      );
    }
    p.kill();
    bus.emit(Events.PICKUP_COLLECTED, type, value);
  };

  private onPlayerEnemyOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, enemyObj) => {
    if (this.phase !== 'active') return;
    const e = enemyObj as Enemy;
    if (!e.active) return;
    const def = EnemyDefs[e.kind];
    const applied = this.player.takeDamage(def.contactDamage);
    if (applied > 0) {
      this.showPopup(this.player.x, this.player.y - 22, `-${applied}`, '#ff416b');
    }
  };

  private onPlayerBulletOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, bulletObj) => {
    if (this.phase !== 'active') return;
    const b = bulletObj as Bullet;
    if (!b.active) return;
    const applied = this.player.takeDamage(b.damage);
    if (applied > 0) {
      this.showPopup(this.player.x, this.player.y - 22, `-${applied}`, '#ff416b');
    }
    b.kill();
  };

  // ---- internals ----

  private onEnemyKilled(): void {
    this.combo = Math.min(Balance.raid.comboMax, this.combo + Balance.raid.comboPerKill);
    this.comboGrace = Balance.raid.comboGraceSec;
    bus.emit(Events.COMBO_CHANGED, this.combo);
    bus.emit(Events.ENEMY_KILLED);
  }

  private tickCombo(dt: number): void {
    if (this.comboGrace > 0) {
      this.comboGrace -= dt;
      return;
    }
    if (this.combo > 1.0) {
      this.combo = Math.max(1.0, this.combo - Balance.raid.comboDecayPerSec * dt);
    }
  }

  private spawnDrops(enemy: Enemy): void {
    const def = EnemyDefs[enemy.kind];
    const ex = enemy.x;
    const ey = enemy.y;
    // Combo scales the VALUE of each pickup (per M5 gate decision); count stays
    // fixed at the §14.3 base so we never blow past Balance.performance.maxPickups.
    const valuePerDrop = Math.max(1, Math.round(this.combo));
    for (let i = 0; i < def.scrapDrop; i++) {
      const p = this.pickups.get(ex, ey) as Pickup | null;
      if (!p) break;
      p.spawn(ex, ey, 'scrap', valuePerDrop);
    }
    if (Math.random() < def.coreChance) {
      const p = this.pickups.get(ex, ey) as Pickup | null;
      if (p) p.spawn(ex, ey, 'core', valuePerDrop);
    }
  }

  private spawnEnemyBullet(fromX: number, fromY: number, dirX: number, dirY: number): void {
    const b = this.bullets.get(fromX, fromY) as Bullet | null;
    if (!b) return;
    b.fire(fromX, fromY, dirX, dirY, Balance.shooter.bulletSpeed, Balance.shooter.bulletDamage);
  }

  private tickBullets(dt: number): void {
    const wb = Balance.player.worldBounds;
    for (const child of this.bullets.getChildren()) {
      const b = child as Bullet;
      if (!b.active) continue;
      b.tick(dt);
      if (b.x < wb.minX || b.x > wb.maxX || b.y < wb.minY || b.y > wb.maxY) b.kill();
    }
  }

  private showPopup(x: number, y: number, text: string, color: string): void {
    if (this.activePopups >= Balance.performance.maxPopups) return;
    this.activePopups++;
    const t = this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    t.setOrigin(0.5).setDepth(100);
    this.tweens.add({
      targets: t,
      y: y - Balance.ui.popupRiseDist,
      alpha: 0,
      duration: Balance.ui.popupDurationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        t.destroy();
        this.activePopups--;
      },
    });
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

    const bounds = this.add.graphics();
    bounds.lineStyle(2, Balance.colors.background, Balance.ui.boundsAlpha);
    bounds.strokeRect(wb.minX, wb.minY, wb.maxX - wb.minX, wb.maxY - wb.minY);
  }

  // ---- end-state machine ----

  private beginExtractionMoment(): void {
    if (this.phase !== 'active') return;
    this.phase = 'extracting';
    this.extractTimer = Balance.extraction.momentDurationSec;

    // Stop incoming threats.
    this.waveDirector.stop();
    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (!e.active) continue;
      this.particles.enemyDeath(e.kind, e.x, e.y);
      e.kill();
    }
    for (const child of this.bullets.getChildren()) {
      const b = child as Bullet;
      if (b.active) b.kill();
    }

    // Brief frame freeze + radial light blast at the player.
    this.spawnRadialFlash();
    playRisingChord();
  }

  private updateExtractionMoment(dt: number): void {
    this.extractTimer -= dt;
    const elapsed = Balance.extraction.momentDurationSec - this.extractTimer;
    const stillFrozen = elapsed < Balance.extraction.momentFreezeSec;

    if (!stillFrozen) {
      // After the freeze: pickups beeline to the player and any newly-magnetized
      // values are banked through the existing overlap callback.
      for (const child of this.pickups.getChildren()) {
        const p = child as Pickup;
        if (p.active) p.flyIn(this.player.x, this.player.y, Balance.extraction.flyInSpeed);
      }
    }

    if (this.extractTimer <= 0) {
      this.finishRaid('extracted');
    }
  }

  private requestEnd(state: RaidEndState): void {
    if (this.phase !== 'active') return;
    this.finishRaid(state);
  }

  private finishRaid(state: RaidEndState): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.extraction.finish();
    this.waveDirector.stop();
    this.greed.stop();

    // Greed multiplies banked loot on successful extract. Death and collapse
    // both forfeit 50% of unbanked loot per the prototype rule. Combo is already
    // baked into pickup values at drop time.
    let scrap = this.runLoot.scrap;
    let cores = this.runLoot.cores;
    let greedMult = 1.0;
    let penaltyApplied = false;
    if (state === 'extracted') {
      greedMult = this.greed.getMultiplier();
      scrap = Math.round(scrap * greedMult);
      cores = Math.round(cores * greedMult);
    } else {
      scrap = Math.floor(scrap * 0.5);
      cores = Math.floor(cores * 0.5);
      penaltyApplied = true;
    }

    const payload: RaidEndPayload = {
      endState: state,
      loot: { scrap, cores },
      greedMult,
      penaltyApplied,
    };

    // Small delay so the moment's tail visuals finish before the summary appears.
    this.time.delayedCall(120, () => {
      this.scene.launch('SummaryScene', payload);
      this.scene.pause();
    });
  }

  private spawnRadialFlash(): void {
    const px = this.player.x;
    const py = this.player.y;

    const flash = this.add.graphics();
    flash.fillStyle(0xffffff, 0.85);
    flash.fillCircle(0, 0, 60);
    flash.setPosition(px, py);
    flash.setDepth(900);
    this.tweens.add({
      targets: flash,
      scaleX: Balance.extraction.momentFlashMaxScale,
      scaleY: Balance.extraction.momentFlashMaxScale,
      alpha: 0,
      duration: Balance.extraction.momentFlashDurationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    const ring = this.add.graphics();
    ring.lineStyle(8, Balance.colors.extraction, 1);
    ring.strokeCircle(0, 0, 90);
    ring.setPosition(px, py);
    ring.setDepth(901);
    this.tweens.add({
      targets: ring,
      scaleX: Balance.extraction.momentRingMaxScale,
      scaleY: Balance.extraction.momentRingMaxScale,
      alpha: 0,
      duration: Balance.extraction.momentRingDurationMs,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
}
