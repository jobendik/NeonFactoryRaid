import Phaser from 'phaser';
import { EnemyDefs, ENEMY_TEXTURE_DIM, type EnemyKind, type EnemyDef } from '../config/EnemyDefs';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  hp = 0;
  maxHp = 0;
  kind: EnemyKind = 'grunt';
  private speed = 0;
  private body_!: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Enemy.ensureTextures(scene);
    super(scene, x, y, EnemyDefs.grunt.textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body_ = this.body as Phaser.Physics.Arcade.Body;
    this.setActive(false).setVisible(false);
    this.body_.enable = false;
  }

  spawn(x: number, y: number, kind: EnemyKind): void {
    this.kind = kind;
    const spec = EnemyDefs[kind];
    this.hp = spec.hp;
    this.maxHp = spec.hp;
    this.speed = spec.speed;
    this.setTexture(spec.textureKey);
    this.setPosition(x, y);
    // Tight circular body, centered in the 32x32 texture frame.
    const radius = spec.size / 2;
    const offset = (ENEMY_TEXTURE_DIM - spec.size) / 2;
    this.body_.setCircle(radius, offset, offset);
    this.body_.enable = true;
    this.setActive(true).setVisible(true);
    this.setAlpha(1);
    this.setRotation(0);
  }

  kill(): void {
    this.body_.setVelocity(0, 0);
    this.body_.enable = false;
    this.setActive(false).setVisible(false);
  }

  chase(playerX: number, playerY: number): void {
    if (!this.active) return;
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) {
      this.body_.setVelocity(0, 0);
      return;
    }
    const vx = (dx / dist) * this.speed;
    const vy = (dy / dist) * this.speed;
    this.body_.setVelocity(vx, vy);
    this.setRotation(Math.atan2(dy, dx));
  }

  static ensureTextures(scene: Phaser.Scene): void {
    for (const key of Object.keys(EnemyDefs) as EnemyKind[]) {
      const spec = EnemyDefs[key];
      if (scene.textures.exists(spec.textureKey)) continue;
      Enemy.makeTexture(scene, spec);
    }
  }

  private static makeTexture(scene: Phaser.Scene, spec: EnemyDef): void {
    const dim = ENEMY_TEXTURE_DIM;
    const g = scene.add.graphics();
    g.fillStyle(spec.color, 1);
    g.lineStyle(2, 0xffffff, 0.85);

    if (spec.shape === 'triangle') {
      const r = dim / 2 - 2;
      g.beginPath();
      g.moveTo(dim / 2 + r, dim / 2);
      g.lineTo(dim / 2 - r * 0.55, dim / 2 - r * 0.85);
      g.lineTo(dim / 2 - r * 0.55, dim / 2 + r * 0.85);
      g.closePath();
      g.fillPath();
      g.strokePath();
    } else if (spec.shape === 'square') {
      const r = dim / 2 - 4;
      g.fillRect(dim / 2 - r, dim / 2 - r, r * 2, r * 2);
      g.strokeRect(dim / 2 - r, dim / 2 - r, r * 2, r * 2);
    } else {
      const r = dim / 2 - 4;
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        const x = dim / 2 + Math.cos(a) * r;
        const y = dim / 2 + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();
      g.strokePath();
    }

    g.generateTexture(spec.textureKey, dim, dim);
    g.destroy();
  }
}
