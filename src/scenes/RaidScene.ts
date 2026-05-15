import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Pickup, type PickupType } from '../entities/Pickup';
import { Bullet } from '../entities/Bullet';
import { InputSystem } from '../systems/InputSystem';
import { WaveDirector } from '../systems/WaveDirector';
import { WeaponSystem } from '../systems/WeaponSystem';
import { ParticleEffects } from '../systems/ParticleEffects';
import { Balance } from '../config/Balance';
import { EnemyDefs } from '../config/EnemyDefs';
import { bus, Events } from '../core/EventBus';

// RaidScene is the testbed for Milestones 1-5. Factory hub comes later.

export class RaidScene extends Phaser.Scene {
  private player!: Player;
  private inputSystem!: InputSystem;
  private enemies!: Phaser.GameObjects.Group;
  private pickups!: Phaser.GameObjects.Group;
  private bullets!: Phaser.GameObjects.Group;
  private waveDirector!: WaveDirector;
  private weapons!: WeaponSystem;
  private particles!: ParticleEffects;
  private runLoot = { scrap: 0, cores: 0 };
  private combo = 1.0;
  private comboGrace = 0;
  private timeRemaining: number = Balance.raid.normalDuration;
  private activePopups = 0;

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

    this.runLoot.scrap = 0;
    this.runLoot.cores = 0;
    this.combo = 1.0;
    this.comboGrace = 0;
    this.timeRemaining = Balance.raid.normalDuration;

    bus.emit(Events.RAID_STARTED);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(Balance.performance.dtClamp, deltaMs / 1000);

    this.timeRemaining = Math.max(0, this.timeRemaining - dt);

    const frame = this.inputSystem.getInput();
    this.player.update(dt, frame);
    this.waveDirector.update(dt);

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
  }

  shutdown(): void {
    this.waveDirector.stop();
    this.inputSystem.destroy();
    this.particles.destroy();
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

  // ---- overlap callbacks ----

  private onPickupOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, pickupObj) => {
    const p = pickupObj as Pickup;
    if (!p.active) return;
    if (p.type === 'scrap') this.runLoot.scrap += p.value;
    else this.runLoot.cores += p.value;
    const type: PickupType = p.type;
    const value = p.value;
    p.kill();
    bus.emit(Events.PICKUP_COLLECTED, type, value);
  };

  private onPlayerEnemyOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, enemyObj) => {
    const e = enemyObj as Enemy;
    if (!e.active) return;
    const def = EnemyDefs[e.kind];
    const applied = this.player.takeDamage(def.contactDamage);
    if (applied > 0) {
      this.showPopup(this.player.x, this.player.y - 22, `-${applied}`, '#ff416b');
    }
  };

  private onPlayerBulletOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, bulletObj) => {
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
    // Combo scales scrap count per blueprint §7.4 ("combo multiplies loot drops per enemy").
    const dropCount = Math.max(1, Math.round(def.scrapDrop * this.combo));
    for (let i = 0; i < dropCount; i++) {
      const p = this.pickups.get(ex, ey) as Pickup | null;
      if (!p) break;
      p.spawn(ex, ey, 'scrap');
    }
    if (Math.random() < def.coreChance) {
      const p = this.pickups.get(ex, ey) as Pickup | null;
      if (p) p.spawn(ex, ey, 'core');
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
}
