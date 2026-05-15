import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { Enemy } from '../entities/Enemy';

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

  update(dt: number): WeaponHit | null {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.fireTimer > 0) return null;

    const target = this.findNearestInRange();
    if (!target) return null;

    const damage = (Balance.weapon.baseDamage + this.damageLevel * Balance.weapon.damagePerLevel) * this.damageMult;
    this.fireTracer(target.x, target.y);
    this.fireTimer = Balance.weapon.baseFireCooldown;
    return { target, damage };
  }

  private findNearestInRange(): Enemy | null {
    const range = Balance.weapon.baseRange + this.damageLevel * Balance.weapon.rangePerDamage;
    const range2 = range * range;
    const p = this.getPlayer();
    let best: Enemy | null = null;
    let bestD2 = range2;
    const list = this.getEnemies();
    for (const obj of list) {
      const e = obj as Enemy;
      if (!e.active) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
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
