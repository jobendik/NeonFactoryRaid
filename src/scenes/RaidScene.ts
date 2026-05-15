import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { InputSystem } from '../systems/InputSystem';
import { WaveDirector } from '../systems/WaveDirector';
import { WeaponSystem } from '../systems/WeaponSystem';
import { ParticleEffects } from '../systems/ParticleEffects';
import { Balance } from '../config/Balance';
import { bus, Events } from '../core/EventBus';

// RaidScene is the testbed for Milestones 1-5. Factory hub comes later.

export class RaidScene extends Phaser.Scene {
  private player!: Player;
  private inputSystem!: InputSystem;
  private enemies!: Phaser.GameObjects.Group;
  private waveDirector!: WaveDirector;
  private weapons!: WeaponSystem;
  private particles!: ParticleEffects;

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

    bus.emit(Events.RAID_STARTED);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(Balance.performance.dtClamp, deltaMs / 1000);
    const frame = this.inputSystem.getInput();
    this.player.update(dt, frame);
    this.waveDirector.update(dt);
    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (e.active) e.chase(this.player.x, this.player.y);
    }

    const hit = this.weapons.update(dt);
    if (hit) {
      const killed = hit.target.hit(hit.damage);
      if (killed) {
        this.particles.enemyDeath(hit.target.kind, hit.target.x, hit.target.y);
        const dead = hit.target;
        dead.kill();
        bus.emit(Events.ENEMY_KILLED, dead);
      }
    }
  }

  shutdown(): void {
    this.waveDirector.stop();
    this.inputSystem.destroy();
    this.particles.destroy();
    bus.emit(Events.RAID_ENDED);
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
