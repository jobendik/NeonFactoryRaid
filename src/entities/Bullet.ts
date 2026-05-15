import Phaser from 'phaser';
import { Balance } from '../config/Balance';

export const ENEMY_BULLET_TEXTURE_KEY = 'enemy-bullet';

// Bullet entity used for shooter projectiles (and future ability bullets).
// Physics sprite so it travels through the world and the player can dodge it,
// matching the architecture rule "Shooter projectiles are physics sprites (travel, dodgeable)."

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  damage = 0;
  private body_!: Phaser.Physics.Arcade.Body;
  private age = 0;
  private lifespan = Balance.shooter.bulletLifespanSec;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Bullet.ensureTexture(scene);
    super(scene, x, y, ENEMY_BULLET_TEXTURE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body_ = this.body as Phaser.Physics.Arcade.Body;
    this.body_.setCircle(5, 0, 0);
    this.setActive(false).setVisible(false);
    this.body_.enable = false;
  }

  fire(fromX: number, fromY: number, dirX: number, dirY: number, speed: number, damage: number): void {
    this.damage = damage;
    this.age = 0;
    this.setPosition(fromX, fromY);
    this.body_.enable = true;
    this.body_.setVelocity(dirX * speed, dirY * speed);
    this.setActive(true).setVisible(true);
    this.setRotation(Math.atan2(dirY, dirX));
  }

  kill(): void {
    this.body_.setVelocity(0, 0);
    this.body_.enable = false;
    this.setActive(false).setVisible(false);
  }

  tick(dt: number): void {
    if (!this.active) return;
    this.age += dt;
    if (this.age >= this.lifespan) this.kill();
  }

  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(ENEMY_BULLET_TEXTURE_KEY)) return;
    const dim = 12;
    const g = scene.add.graphics();
    g.fillStyle(Balance.colors.enemyShooter, 1);
    g.lineStyle(2, 0xffffff, 0.85);
    g.fillCircle(dim / 2, dim / 2, dim / 2 - 1);
    g.strokeCircle(dim / 2, dim / 2, dim / 2 - 1);
    g.generateTexture(ENEMY_BULLET_TEXTURE_KEY, dim, dim);
    g.destroy();
  }
}
