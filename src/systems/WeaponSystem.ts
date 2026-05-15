import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { Enemy } from '../entities/Enemy';
import { sfxShoot } from '../audio/sfx';

// Auto-aim weapon per blueprint §6.3: targets the nearest active enemy within
// (baseRange + rangePerDamage * damageLevel) px, fires at Balance.weapon.baseFireCooldown.
//
// Visual model is a hitscan tracer (Graphics, fades via tween) - never a physics object.
// Per architecture rule "Player bullets are visual hitscan + manual overlap check":
// the nearest-in-range scan IS the manual overlap; no Phaser physics overlap is used.

export interface WeaponHit {
  target: Enemy;
  damage: number;
}

export interface PlayerPositionProvider {
  (): { x: number; y: number };
}

export interface EnemyListProvider {
  (): Phaser.GameObjects.GameObject[];
}

export class WeaponSystem {
  private scene: Phaser.Scene;
  private getPlayer: PlayerPositionProvider;
  private getEnemies: EnemyListProvider;
  private fireTimer = 0;
  private damageLevel = 0;
  private damageMult = 1;
  private fireRateMult = 1;
  private targetsPerShot = 1;

  constructor(scene: Phaser.Scene, getPlayer: PlayerPositionProvider, getEnemies: EnemyListProvider) {
    this.scene = scene;
    this.getPlayer = getPlayer;
    this.getEnemies = getEnemies;
  }

  setDamageLevel(level: number): void {
    this.damageLevel = level;
  }

  // Multiplier on top of the leveled damage. Tutorial sets 2.0 per §5.4.
  setDamageMult(mult: number): void {
    this.damageMult = Math.max(0.1, mult);
  }

  // Laser Overdrive bumps fire rate; default 1.0 = baseFireCooldown.
  setFireRateMult(mult: number): void {
    this.fireRateMult = Math.max(0.1, mult);
  }

  // Laser Overdrive ups targets/shot from 1 to laserTargets (2).
  setTargetsPerShot(n: number): void {
    this.targetsPerShot = Math.max(1, Math.floor(n));
  }

  // Returns an array of hits (0 to targetsPerShot). Multi-target firing returns
  // each chosen target once; chain effects (Drone Swarm) are layered on top
  // by RaidScene after the primary hits are processed.
  update(dt: number): WeaponHit[] {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.fireTimer > 0) return [];

    const targets = this.findNearestInRange(this.targetsPerShot);
    if (targets.length === 0) return [];

    const damage = (Balance.weapon.baseDamage + this.damageLevel * Balance.weapon.damagePerLevel) * this.damageMult;
    const hits: WeaponHit[] = [];
    for (const t of targets) {
      this.fireTracer(t.x, t.y);
      hits.push({ target: t, damage });
    }
    sfxShoot();
    this.fireTimer = Balance.weapon.baseFireCooldown / this.fireRateMult;
    return hits;
  }

  // Returns the `n` nearest enemies within range. Used both for normal firing
  // (n=1) and Laser Overdrive (n=2). Chain shots use a different chainRadius
  // and are processed by RaidScene, not here.
  private findNearestInRange(n: number): Enemy[] {
    const range = Balance.weapon.baseRange + this.damageLevel * Balance.weapon.rangePerDamage;
    const range2 = range * range;
    const p = this.getPlayer();
    const candidates: Array<{ e: Enemy; d2: number }> = [];
    const list = this.getEnemies();
    for (const obj of list) {
      const e = obj as Enemy;
      if (!e.active) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < range2) candidates.push({ e, d2 });
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    return candidates.slice(0, n).map(c => c.e);
  }

  // Public so RaidScene can render a tracer for each chained enemy hit by
  // Drone Swarm. Source is the previous hit position rather than the player.
  drawTracer(fromX: number, fromY: number, toX: number, toY: number, color?: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(2, color ?? Balance.colors.bulletTracer, 1);
    g.lineBetween(fromX, fromY, toX, toY);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: Balance.ui.tracerFadeMs,
      onComplete: () => g.destroy(),
    });
  }

  private fireTracer(tx: number, ty: number): void {
    const p = this.getPlayer();
    const g = this.scene.add.graphics();
    g.lineStyle(2, Balance.colors.bulletTracer, 1);
    g.lineBetween(p.x, p.y, tx, ty);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: Balance.ui.tracerFadeMs,
      onComplete: () => g.destroy(),
    });
  }
}
