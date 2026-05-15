import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { PowerupDefs, type PowerupKind } from '../config/PowerupDefs';

// Field-spawned power-up per blueprint §13. Pentagon ring shape, color per
// def, magnetizes toward the player when in range (same pull profile as
// Pickup but with a wider radius). Pooled via a Phaser Group on the scene
// side, like Pickup/Enemy/Bullet.

export const POWERUP_TEXTURE_KEY = 'powerup-ring';

export class Powerup extends Phaser.Physics.Arcade.Sprite {
  kind: PowerupKind = 'magnetBurst';
  private pulse = 0;
  private age = 0;
  private body_!: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Powerup.ensureTexture(scene);
    super(scene, x, y, POWERUP_TEXTURE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body_ = this.body as Phaser.Physics.Arcade.Body;
    this.body_.setCircle(12, 4, 4);
    this.setActive(false).setVisible(false);
    this.body_.enable = false;
  }

  spawn(x: number, y: number, kind: PowerupKind): void {
    this.kind = kind;
    const def = PowerupDefs[kind];
    this.setPosition(x, y);
    this.setTint(def.color);
    this.body_.enable = true;
    this.setActive(true).setVisible(true);
    this.setAlpha(1);
    this.setScale(1);
    this.pulse = 0;
    this.age = 0;
    this.body_.setVelocity(0, 0);
    this.body_.setDrag(0, 0);
  }

  kill(): void {
    this.body_.setVelocity(0, 0);
    this.body_.enable = false;
    this.setActive(false).setVisible(false);
  }

  // Magnet behavior modeled after Pickup. Power-ups have a larger pull radius
  // so the player doesn't have to walk directly onto them.
  updateMagnet(dt: number, playerX: number, playerY: number, magnetRadius: number): void {
    if (!this.active) return;
    this.age += dt;
    this.pulse += dt;
    const scale = 1 + Math.sin(this.pulse * 5.0) * 0.08;
    this.setScale(scale);

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.5 || dist > magnetRadius) return;

    const closeness = 1 - dist / magnetRadius;
    const speed = Phaser.Math.Linear(180, 520, closeness);
    this.body_.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  // Generates the shared pentagon-ring texture once per scene. Drawn white +
  // outlined so setTint() can recolor it cleanly per power-up kind.
  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(POWERUP_TEXTURE_KEY)) return;
    const dim = 32;
    const r = 12;
    const g = scene.add.graphics();
    g.lineStyle(3, 0xffffff, 1);
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      const x = dim / 2 + Math.cos(a) * r;
      const y = dim / 2 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokePath();
    g.lineStyle(1, 0xffffff, 0.4);
    g.strokeCircle(dim / 2, dim / 2, r + 4);
    g.generateTexture(POWERUP_TEXTURE_KEY, dim, dim);
    g.destroy();
  }
}

// Read by PowerupSystem so it doesn't accidentally over-shoot the §13 cap.
export const POWERUP_MAX_ON_FIELD = Balance.powerups.maxOnField;
