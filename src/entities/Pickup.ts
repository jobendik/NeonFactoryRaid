import Phaser from 'phaser';
import { Balance } from '../config/Balance';

export type PickupType = 'scrap' | 'core';

export const SCRAP_TEXTURE_KEY = 'pickup-scrap';
export const CORE_TEXTURE_KEY = 'pickup-core';

// Pickup entity. Pooled via a Phaser Group on the scene side.
// Magnet behavior is manual (per-frame distance check + direct velocity set)
// so it feels responsive; collection itself goes through Arcade overlap with
// the player body, per architecture rules ("Arcade Physics for pickup collision").

export class Pickup extends Phaser.Physics.Arcade.Sprite {
  type: PickupType = 'scrap';
  value = 1;
  private body_!: Phaser.Physics.Arcade.Body;
  private age = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Pickup.ensureTextures(scene);
    super(scene, x, y, SCRAP_TEXTURE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body_ = this.body as Phaser.Physics.Arcade.Body;
    this.body_.setCircle(7, 1, 1);
    this.setActive(false).setVisible(false);
    this.body_.enable = false;
  }

  spawn(x: number, y: number, type: PickupType): void {
    this.type = type;
    this.value = 1;
    this.setTexture(type === 'scrap' ? SCRAP_TEXTURE_KEY : CORE_TEXTURE_KEY);
    this.setPosition(x, y);
    this.body_.enable = true;
    this.setActive(true).setVisible(true);
    this.setAlpha(1);
    this.age = 0;

    const angle = Math.random() * Math.PI * 2;
    const speed = Phaser.Math.Between(Balance.magnet.popOutSpeedMin, Balance.magnet.popOutSpeedMax);
    this.body_.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.body_.setDrag(Balance.magnet.popOutDrag, Balance.magnet.popOutDrag);
  }

  kill(): void {
    this.body_.setVelocity(0, 0);
    this.body_.enable = false;
    this.setActive(false).setVisible(false);
  }

  // Pulls the pickup toward the player when within magnetRadius.
  // Speed scales linearly: minPullSpeed at the edge of magnetRadius,
  // maxPullSpeed when nearly on top of the player.
  updateMagnet(dt: number, playerX: number, playerY: number, magnetRadius: number): void {
    if (!this.active) return;
    this.age += dt;
    if (this.age >= Balance.magnet.pickupLifespanSec) {
      this.kill();
      return;
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.5 || dist > magnetRadius) return;

    const closeness = 1 - dist / magnetRadius;
    const speed = Phaser.Math.Linear(Balance.magnet.minPullSpeed, Balance.magnet.maxPullSpeed, closeness);
    this.body_.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    this.body_.setDrag(0, 0);
  }

  static ensureTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists(SCRAP_TEXTURE_KEY)) {
      const dim = 16;
      const g = scene.add.graphics();
      g.fillStyle(Balance.colors.scrap, 1);
      g.lineStyle(2, 0xffffff, 0.85);
      const r = 5;
      g.fillRect(dim / 2 - r, dim / 2 - r, r * 2, r * 2);
      g.strokeRect(dim / 2 - r, dim / 2 - r, r * 2, r * 2);
      g.generateTexture(SCRAP_TEXTURE_KEY, dim, dim);
      g.destroy();
    }
    if (!scene.textures.exists(CORE_TEXTURE_KEY)) {
      const dim = 18;
      const g = scene.add.graphics();
      g.fillStyle(Balance.colors.core, 1);
      g.lineStyle(2, 0xffffff, 0.85);
      const cx = dim / 2;
      const cy = dim / 2;
      const r = dim / 2 - 2;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.generateTexture(CORE_TEXTURE_KEY, dim, dim);
      g.destroy();
    }
  }
}
