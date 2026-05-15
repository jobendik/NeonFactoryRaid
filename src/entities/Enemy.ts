import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { EnemyDefs, ENEMY_TEXTURE_DIM, type EnemyKind, type EnemyDef } from '../config/EnemyDefs';

export interface EnemyFireRequest {
  fromX: number;
  fromY: number;
  dirX: number;
  dirY: number;
}

export interface EnemyTickResult {
  fired: EnemyFireRequest | null;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  hp = 0;
  maxHp = 0;
  kind: EnemyKind = 'grunt';
  private speed = 0;
  private body_!: Phaser.Physics.Arcade.Body;

  // Shooter state. Unused for chasers but kept on every Enemy because the pool
  // recycles instances - a pooled grunt may be re-spawned as a shooter later.
  private fireCooldown = 0;
  private telegraphLeft = 0;
  private telegraphTargetX = 0;
  private telegraphTargetY = 0;
  private telegraphGfx: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Enemy.ensureTextures(scene);
    super(scene, x, y, EnemyDefs.grunt.textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body_ = this.body as Phaser.Physics.Arcade.Body;
    this.setActive(false).setVisible(false);
    this.body_.enable = false;
  }

  spawn(x: number, y: number, kind: EnemyKind, hpMult: number = 1): void {
    this.kind = kind;
    const spec = EnemyDefs[kind];
    const hp = Math.max(1, Math.round(spec.hp * hpMult));
    this.hp = hp;
    this.maxHp = hp;
    this.speed = spec.speed;
    this.setTexture(spec.textureKey);
    this.setPosition(x, y);
    const radius = spec.size / 2;
    const offset = (ENEMY_TEXTURE_DIM - spec.size) / 2;
    this.body_.setCircle(radius, offset, offset);
    this.body_.enable = true;
    this.setActive(true).setVisible(true);
    this.setAlpha(1);
    this.setRotation(0);

    this.fireCooldown = Phaser.Math.FloatBetween(
      Balance.shooter.fireIntervalMinSec * 0.5,
      Balance.shooter.fireIntervalMaxSec,
    );
    this.telegraphLeft = 0;
    if (this.telegraphGfx) this.telegraphGfx.clear();
  }

  kill(): void {
    this.body_.setVelocity(0, 0);
    this.body_.enable = false;
    this.setActive(false).setVisible(false);
    this.telegraphLeft = 0;
    if (this.telegraphGfx) this.telegraphGfx.clear();
  }

  hit(amount: number): boolean {
    this.hp -= amount;
    this.setAlpha(0.55);
    this.scene.time.delayedCall(60, () => {
      if (this.active) this.setAlpha(1);
    });
    return this.hp <= 0;
  }

  tick(dt: number, playerX: number, playerY: number, frozen: boolean = false): EnemyTickResult {
    if (!this.active) return { fired: null };
    if (frozen) {
      // Freeze Pulse (§13): enemies fully halt - no movement, no fire, no
      // telegraph charge-up. Visual tint is applied by RaidScene.
      this.body_.setVelocity(0, 0);
      return { fired: null };
    }
    const spec = EnemyDefs[this.kind];
    if (spec.behavior === 'shooter') {
      return this.tickShooter(dt, playerX, playerY);
    }
    this.tickChaser(playerX, playerY);
    return { fired: null };
  }

  private tickChaser(playerX: number, playerY: number): void {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) {
      this.body_.setVelocity(0, 0);
      return;
    }
    this.body_.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
    this.setRotation(Math.atan2(dy, dx));
  }

  private tickShooter(dt: number, playerX: number, playerY: number): EnemyTickResult {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);

    // Maintain a kiting distance from the player.
    let mvx = 0;
    let mvy = 0;
    if (dist > 0.5) {
      if (dist < Balance.shooter.minDistance) {
        mvx = -dx / dist;
        mvy = -dy / dist;
      } else if (dist > Balance.shooter.maxDistance) {
        mvx = dx / dist;
        mvy = dy / dist;
      }
    }
    this.body_.setVelocity(mvx * this.speed, mvy * this.speed);
    if (dist > 0.5) this.setRotation(Math.atan2(dy, dx));

    if (this.telegraphLeft > 0) {
      this.telegraphLeft -= dt;
      this.drawTelegraph();
      if (this.telegraphLeft <= 0) {
        this.clearTelegraph();
        const tdx = this.telegraphTargetX - this.x;
        const tdy = this.telegraphTargetY - this.y;
        const tdist = Math.hypot(tdx, tdy) || 1;
        this.fireCooldown = Phaser.Math.FloatBetween(
          Balance.shooter.fireIntervalMinSec,
          Balance.shooter.fireIntervalMaxSec,
        );
        return {
          fired: {
            fromX: this.x,
            fromY: this.y,
            dirX: tdx / tdist,
            dirY: tdy / tdist,
          },
        };
      }
      return { fired: null };
    }

    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0 && dist <= Balance.shooter.fireRangeMax) {
      this.telegraphLeft = Balance.shooter.telegraphSec;
      this.telegraphTargetX = playerX;
      this.telegraphTargetY = playerY;
    }
    return { fired: null };
  }

  private drawTelegraph(): void {
    if (!this.telegraphGfx) {
      this.telegraphGfx = this.scene.add.graphics();
      this.telegraphGfx.setDepth(20);
    }
    this.telegraphGfx.clear();
    this.telegraphGfx.lineStyle(
      Balance.shooter.telegraphWidth,
      Balance.colors.enemyTelegraph,
      Balance.shooter.telegraphAlpha,
    );
    this.telegraphGfx.lineBetween(this.x, this.y, this.telegraphTargetX, this.telegraphTargetY);
  }

  private clearTelegraph(): void {
    if (this.telegraphGfx) this.telegraphGfx.clear();
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
      const r = spec.size / 2;
      g.beginPath();
      g.moveTo(dim / 2 + r, dim / 2);
      g.lineTo(dim / 2 - r * 0.55, dim / 2 - r * 0.85);
      g.lineTo(dim / 2 - r * 0.55, dim / 2 + r * 0.85);
      g.closePath();
      g.fillPath();
      g.strokePath();
    } else if (spec.shape === 'square') {
      const r = spec.size / 2;
      g.fillRect(dim / 2 - r, dim / 2 - r, r * 2, r * 2);
      g.strokeRect(dim / 2 - r, dim / 2 - r, r * 2, r * 2);
    } else {
      const r = spec.size / 2;
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
