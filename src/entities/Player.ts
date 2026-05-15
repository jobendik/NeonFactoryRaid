import Phaser from 'phaser';
import { Balance } from '../config/Balance';

export const PLAYER_TEXTURE_KEY = 'player-ship';

export interface PlayerInput {
  x: number;
  y: number;
  dash: boolean;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  private vx = 0;
  private vy = 0;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private invulnTimer = 0;
  private facing = 0;
  private fireTimer = 0;
  private body_!: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Player.ensureTexture(scene);
    super(scene, x, y, PLAYER_TEXTURE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5);
    this.body_ = this.body as Phaser.Physics.Arcade.Body;
    this.body_.setCollideWorldBounds(true);
    // Circular hit body slightly smaller than the visible triangle for forgiving collision.
    this.body_.setCircle(18, 6, 6);
  }

  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PLAYER_TEXTURE_KEY)) return;
    const size = 48;
    const g = scene.add.graphics();
    g.lineStyle(2, Balance.colors.playerOutline, 1);
    g.fillStyle(Balance.colors.player, 1);
    g.beginPath();
    g.moveTo(size * 0.92, size * 0.5);
    g.lineTo(size * 0.12, size * 0.12);
    g.lineTo(size * 0.28, size * 0.5);
    g.lineTo(size * 0.12, size * 0.88);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.generateTexture(PLAYER_TEXTURE_KEY, size, size);
    g.destroy();
  }

  update(dt: number, input: PlayerInput): void {
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    if (input.dash && this.dashCooldownTimer <= 0 && this.dashTimer <= 0) {
      this.startDash(input);
    }

    if (this.dashTimer > 0) {
      // Light damping during dash so momentum carries but doesn't fly forever.
      const damp = Math.max(0, 1 - 5 * dt);
      this.vx *= damp;
      this.vy *= damp;
    } else {
      const speed = Balance.player.baseSpeed;
      const targetVx = input.x * speed;
      const targetVy = input.y * speed;
      const a = Math.min(1, Balance.player.accel * dt);
      this.vx += (targetVx - this.vx) * a;
      this.vy += (targetVy - this.vy) * a;
    }

    this.body_.setVelocity(this.vx, this.vy);

    if (Math.abs(this.vx) > 6 || Math.abs(this.vy) > 6) {
      this.facing = Math.atan2(this.vy, this.vx);
    }
    this.setRotation(this.facing);

    // M1 stub: fire visible tracers toward a fixed offset so weapon cadence is observable.
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.fireTimer <= 0) {
      const tx = this.x + Balance.fireStub.targetOffsetX;
      const ty = this.y + Balance.fireStub.targetOffsetY;
      this.fireTracer(tx, ty);
      this.fireTimer = Balance.weapon.baseFireCooldown;
    }
  }

  private startDash(input: PlayerInput): void {
    const inLen = Math.hypot(input.x, input.y);
    const dx = inLen > 0 ? input.x / inLen : Math.cos(this.facing);
    const dy = inLen > 0 ? input.y / inLen : Math.sin(this.facing);
    this.vx = dx * Balance.player.dashForce;
    this.vy = dy * Balance.player.dashForce;
    this.dashTimer = Balance.player.dashDuration;
    this.invulnTimer = Balance.player.dashInvuln;
    this.dashCooldownTimer = Balance.player.dashCooldown;
    this.setTint(Balance.colors.playerDashAccent);
    this.scene.time.delayedCall(Balance.player.dashDuration * 1000, () => this.clearTint());
    this.scene.cameras.main.shake(Balance.ui.dashShakeDuration, Balance.ui.dashShakeIntensity);
  }

  private fireTracer(tx: number, ty: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(2, Balance.colors.bulletTracer, 1);
    g.lineBetween(this.x, this.y, tx, ty);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: Balance.ui.tracerFadeMs,
      onComplete: () => g.destroy(),
    });
  }

  isDashing(): boolean {
    return this.dashTimer > 0;
  }

  isInvulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  dashCooldownRemaining(): number {
    return this.dashCooldownTimer;
  }

  getFacing(): number {
    return this.facing;
  }
}
