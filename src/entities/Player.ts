import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { bus, Events } from '../core/EventBus';
import { UpgradeEffects } from '../systems/UpgradeSystem';
import { sfxDash, sfxPlayerHurt, sfxPlayerDeath, sfxShieldGrant } from '../audio/sfx';
import { PARTICLE_TEXTURE_KEY } from '../systems/ParticleEffects';
import { CosmeticSystem } from '../systems/CosmeticSystem';
import type { RunMods } from '../systems/RunMods';

export const PLAYER_TEXTURE_KEY = 'player-ship';

export interface PlayerInput {
  x: number;
  y: number;
  dash: boolean;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  maxHp: number;
  private speed: number;
  private vx = 0;
  private vy = 0;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private invulnTimer = 0;
  private hitInvulnTimer = 0;
  private facing = 0;
  private body_!: Phaser.Physics.Arcade.Body;
  // FTUE safety net per §5.1: tutorial raid clamps HP so the player can't die.
  // Default 0 means takeDamage behaves normally; tutorial sets it to 1.
  private hpFloor = 0;
  // Shield Bubble (§13). Each pickup grants +1 charge. takeDamage decrements
  // first - if a charge absorbed the hit, the player takes no HP damage.
  shieldCharges = 0;
  private shieldAura: Phaser.GameObjects.Graphics | null = null;
  // M15 RunMods inputs. Cards mutate RunMods on RaidScene; the player calls
  // applyRunMods to refresh derived values (max HP / speed / dash cooldown)
  // and to seed Orbital Shield + Phoenix flags.
  private speedMult = 1;
  private dashCooldownMult = 1;
  private bonusHP = 0;
  private orbitalShieldEnabled = false;
  private orbitalShieldRegenSec = 12;
  private orbitalShieldTimer = 0;
  phoenixCharges = 0;
  // M22 — small thruster particle emitter behind the player. Follows the
  // sprite each frame; cyan tint that brightens during dash.
  private thruster: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Player.ensureTexture(scene);
    super(scene, x, y, PLAYER_TEXTURE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5);
    this.body_ = this.body as Phaser.Physics.Arcade.Body;
    this.body_.setCollideWorldBounds(true);
    // Circular hit body slightly tighter than the new 64px sprite (was 48).
    // Offsets match the texture's center.
    this.body_.setCircle(18, 14, 14);
    // Texture is 64 — center the body offset accordingly. setCircle's offset
    // is from the top-left of the body box, which Phaser sizes from the
    // sprite's render size.

    // Derive max HP and speed from current upgrade levels at construction time.
    // A new Player is created on each scene re-entry, so this re-reads after
    // every upgrade purchase between raids.
    this.maxHp = UpgradeEffects.playerMaxHp();
    this.hp = this.maxHp;
    this.speed = UpgradeEffects.playerSpeed();
    this.initThruster(scene);
    // M23 — apply equipped ship-skin tint. 'skin-default' uses 0xffffff
    // (a no-op tint) so unmodified ships render with their texture color.
    this.setTint(CosmeticSystem.getEquippedSkinColor());
  }

  // Create the thruster emitter once per Player. Idle by default; tickThruster
  // toggles emission based on movement so the trail doesn't sit on a stopped
  // ship. Depth lives one below the sprite so it reads as "behind".
  private initThruster(scene: Phaser.Scene): void {
    if (!scene.textures.exists(PARTICLE_TEXTURE_KEY)) {
      // ParticleEffects normally seeds the texture but Player is constructed
      // before that. Safe to re-create — Phaser ignores duplicate keys.
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(3, 3, 2);
      g.generateTexture(PARTICLE_TEXTURE_KEY, 6, 6);
      g.destroy();
    }
    this.thruster = scene.add.particles(0, 0, PARTICLE_TEXTURE_KEY, {
      speed: { min: 30, max: 80 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.65, end: 0 },
      lifespan: 320,
      tint: Balance.colors.player,
      frequency: 35,
      emitting: false,
    });
    this.thruster.setDepth(this.depth - 1);
  }

  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PLAYER_TEXTURE_KEY)) return;
    const size = 64;
    const g = scene.add.graphics();
    // M22 wedge-ship silhouette per §19.3. Larger texture for legibility at
    // mobile size; bright cyan body with white outline, a cooler-cyan inner
    // body line for depth, and a small yellow nose accent that catches the
    // dash-tint without dominating the resting silhouette.
    g.lineStyle(3, Balance.colors.playerOutline, 1);
    g.fillStyle(Balance.colors.player, 1);
    const cy = size * 0.5;
    const noseX = size * 0.94;
    const tailY = size * 0.85;
    const tailY2 = size * 0.15;
    // Outer hull
    g.beginPath();
    g.moveTo(noseX, cy);
    g.lineTo(size * 0.12, tailY2);
    g.lineTo(size * 0.30, cy);
    g.lineTo(size * 0.12, tailY);
    g.closePath();
    g.fillPath();
    g.strokePath();
    // Inner cockpit line (subtle, slightly darker cyan)
    g.lineStyle(2, 0x14a8c2, 0.85);
    g.beginPath();
    g.moveTo(noseX - 4, cy);
    g.lineTo(size * 0.36, cy - 6);
    g.lineTo(size * 0.36, cy + 6);
    g.closePath();
    g.strokePath();
    // Yellow nose tip — small triangle inset from the prow.
    g.fillStyle(Balance.colors.playerDashAccent, 1);
    g.beginPath();
    g.moveTo(noseX - 1, cy);
    g.lineTo(noseX - 9, cy - 4);
    g.lineTo(noseX - 9, cy + 4);
    g.closePath();
    g.fillPath();
    g.generateTexture(PLAYER_TEXTURE_KEY, size, size);
    g.destroy();
  }

  update(dt: number, input: PlayerInput): void {
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.hitInvulnTimer = Math.max(0, this.hitInvulnTimer - dt);

    // Orbital Shield (drafted card): a passive regenerator that grants one
    // shield charge every N seconds, capped at 1 outstanding from this source
    // (chained Shield Bubble pickups can stack on top).
    if (this.orbitalShieldEnabled) {
      this.orbitalShieldTimer += dt;
      if (this.orbitalShieldTimer >= this.orbitalShieldRegenSec && this.shieldCharges < 1) {
        this.orbitalShieldTimer = 0;
        this.shieldCharges += 1;
        this.refreshShieldAura();
      }
    }

    if (input.dash && this.dashCooldownTimer <= 0 && this.dashTimer <= 0) {
      this.startDash(input);
    }

    if (this.dashTimer > 0) {
      // Light damping during dash so momentum carries but doesn't fly forever.
      const damp = Math.max(0, 1 - 5 * dt);
      this.vx *= damp;
      this.vy *= damp;
    } else {
      const targetVx = input.x * this.speed;
      const targetVy = input.y * this.speed;
      const a = Math.min(1, Balance.player.accel * dt);
      this.vx += (targetVx - this.vx) * a;
      this.vy += (targetVy - this.vy) * a;
    }

    this.body_.setVelocity(this.vx, this.vy);

    if (Math.abs(this.vx) > 6 || Math.abs(this.vy) > 6) {
      this.facing = Math.atan2(this.vy, this.vx);
    }
    this.setRotation(this.facing);
    this.tickThruster();
  }

  private tickThruster(): void {
    if (!this.thruster) return;
    // Position the emitter just behind the ship's tail along the facing axis.
    const tailX = this.x - Math.cos(this.facing) * 18;
    const tailY = this.y - Math.sin(this.facing) * 18;
    this.thruster.setPosition(tailX, tailY);
    // Bright yellow during dash, equipped-trail color otherwise. Only emit
    // when actually moving — a stopped ship reads cleaner without trail churn.
    const moving = Math.hypot(this.vx, this.vy) > 24;
    if (moving && !this.thruster.emitting) this.thruster.start();
    else if (!moving && this.thruster.emitting) this.thruster.stop();
    const trailColor = this.isDashing()
      ? Balance.colors.playerDashAccent
      : CosmeticSystem.getEquippedTrailColor();
    this.thruster.setParticleTint(trailColor);
  }

  private startDash(input: PlayerInput): void {
    const inLen = Math.hypot(input.x, input.y);
    const dx = inLen > 0 ? input.x / inLen : Math.cos(this.facing);
    const dy = inLen > 0 ? input.y / inLen : Math.sin(this.facing);
    this.vx = dx * Balance.player.dashForce;
    this.vy = dy * Balance.player.dashForce;
    this.dashTimer = Balance.player.dashDuration;
    this.invulnTimer = Balance.player.dashInvuln;
    // Dash Master card multiplies cooldown (×0.7 per stack).
    this.dashCooldownTimer = Balance.player.dashCooldown * this.dashCooldownMult;
    this.setTint(Balance.colors.playerDashAccent);
    this.scene.time.delayedCall(Balance.player.dashDuration * 1000, () => this.clearTint());
    this.scene.cameras.main.shake(Balance.ui.dashShakeDuration, Balance.ui.dashShakeIntensity);
    sfxDash();
  }

  isDashing(): boolean {
    return this.dashTimer > 0;
  }

  isInvulnerable(): boolean {
    return this.invulnTimer > 0 || this.hitInvulnTimer > 0;
  }

  dashCooldownRemaining(): number {
    return this.dashCooldownTimer;
  }

  getFacing(): number {
    return this.facing;
  }

  // Re-reads max HP and speed from current upgrade levels. Used by FactoryScene
  // when an upgrade is purchased mid-session so the player feels the change
  // without having to redeploy. Also re-applies the current RunMods so a
  // mid-raid card pick keeps the bonusHP / speedMult intact.
  refreshFromUpgrades(): void {
    const newMax = UpgradeEffects.playerMaxHp() + this.bonusHP;
    if (newMax > this.maxHp) this.hp += newMax - this.maxHp;
    this.maxHp = newMax;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    this.speed = UpgradeEffects.playerSpeed() * this.speedMult;
  }

  // Applies RunMods derived from drafted cards (and, in M16, operator passives).
  // Should be called after construction with the run's current mods, then again
  // any time mods change (e.g. after a draft pick during a raid).
  applyRunMods(mods: RunMods): void {
    this.speedMult = mods.speedMult;
    this.dashCooldownMult = mods.dashCooldownMult;
    const oldBonus = this.bonusHP;
    this.bonusHP = mods.bonusHP;
    // Bonus HP additively raises max; pick-up grants top up current HP by the
    // delta so a Hardy mid-raid feels generous.
    const delta = this.bonusHP - oldBonus;
    if (delta > 0) {
      this.maxHp += delta;
      this.hp = Math.min(this.maxHp, this.hp + delta);
    } else if (delta < 0) {
      this.maxHp = Math.max(1, this.maxHp + delta);
      if (this.hp > this.maxHp) this.hp = this.maxHp;
    }
    this.speed = UpgradeEffects.playerSpeed() * this.speedMult;
    this.orbitalShieldEnabled = mods.orbitalShieldEnabled;
    this.orbitalShieldRegenSec = mods.orbitalShieldRegenSec;
    if (mods.orbitalShieldEnabled && this.shieldCharges < 1) {
      // Grant one immediately on pick so the player sees the bubble appear.
      this.shieldCharges += 1;
      this.refreshShieldAura();
      this.orbitalShieldTimer = 0;
    }
    this.phoenixCharges = mods.phoenixCharges;
  }

  // Restores up to maxHp. Used by Heal-on-Pickup and Vampiric.
  heal(amount: number): number {
    if (amount <= 0 || this.hp <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  // FTUE safety net: clamp the minimum HP. Tutorial sets 1 so the death path
  // never fires. Pass 0 to disable.
  setHpFloor(floor: number): void {
    this.hpFloor = Math.max(0, floor);
    if (this.hp < this.hpFloor) this.hp = this.hpFloor;
  }

  // Scales current and max HP by `mult`. Used for the tutorial's 2× HP buff -
  // applied after construction so we don't have to thread the multiplier through
  // every constructor.
  applyHpMult(mult: number): void {
    if (mult <= 0) return;
    this.maxHp = Math.round(this.maxHp * mult);
    this.hp = this.maxHp;
  }

  // Returns the amount actually applied; 0 if invulnerable, already at 0 HP,
  // or fully absorbed by a Shield Bubble charge.
  takeDamage(amount: number): number {
    if (this.isInvulnerable() || this.hp <= 0) return 0;
    if (this.shieldCharges > 0) {
      this.shieldCharges -= 1;
      this.hitInvulnTimer = Balance.player.invulnAfterHit;
      this.flashShieldBreak();
      this.refreshShieldAura();
      bus.emit(Events.PLAYER_DAMAGED, 0, this.hp);
      return 0;
    }
    const room = this.hp - this.hpFloor;
    if (room <= 0) return 0;
    const applied = Math.min(room, amount);
    this.hp -= applied;
    this.hitInvulnTimer = Balance.player.invulnAfterHit;
    this.scene.cameras.main.shake(Balance.ui.hitShakeDuration, Balance.ui.hitShakeIntensity);
    this.setAlpha(0.45);
    this.scene.time.delayedCall(110, () => {
      if (this.active) this.setAlpha(1);
    });
    sfxPlayerHurt();
    bus.emit(Events.PLAYER_DAMAGED, applied, this.hp);
    if (this.hp <= 0) {
      // Phoenix: spend a charge, revive at 50% max HP, brief invuln. Per spec
      // "max 1 stack" so charges stays at most 1.
      if (this.phoenixCharges > 0) {
        this.phoenixCharges -= 1;
        this.hp = Math.max(1, Math.round(this.maxHp * 0.5));
        this.hitInvulnTimer = Math.max(this.hitInvulnTimer, 1.5);
        this.flashShieldBreak();
        bus.emit(Events.PLAYER_DAMAGED, 0, this.hp);
      } else {
        sfxPlayerDeath();
        bus.emit(Events.PLAYER_DIED);
      }
    }
    return applied;
  }

  // M20 REVIVE — restore HP to a fraction of max with a brief invuln window.
  // Used by the rewarded-ad revive path so the player resumes immediately
  // after the modal closes without a death animation re-fire.
  reviveToRatio(ratio: number, invulnSec: number): void {
    if (ratio <= 0) return;
    this.hp = Math.max(1, Math.round(this.maxHp * ratio));
    this.hitInvulnTimer = Math.max(this.hitInvulnTimer, invulnSec);
    this.setAlpha(1);
    this.flashShieldBreak();
    bus.emit(Events.PLAYER_DAMAGED, 0, this.hp);
  }

  // Adds a shield charge from a Shield Bubble pickup. Multiple charges stack.
  addShieldCharge(): void {
    this.shieldCharges += 1;
    this.refreshShieldAura();
    sfxShieldGrant();
  }

  // Re-draws the white ring that visualizes an active shield. The aura sits
  // on the scene rather than as a child so it survives the parent's tint changes.
  private refreshShieldAura(): void {
    if (this.shieldCharges <= 0) {
      this.shieldAura?.destroy();
      this.shieldAura = null;
      return;
    }
    if (!this.shieldAura) {
      this.shieldAura = this.scene.add.graphics().setDepth(this.depth + 1);
    }
    const g = this.shieldAura;
    g.clear();
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeCircle(0, 0, 22);
  }

  // Per-frame: keep the shield aura attached to the player.
  syncShieldAura(): void {
    if (this.shieldAura) this.shieldAura.setPosition(this.x, this.y);
  }

  private flashShieldBreak(): void {
    const g = this.scene.add.graphics();
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(0, 0, 26);
    g.setPosition(this.x, this.y).setDepth(this.depth + 2);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.8,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}
