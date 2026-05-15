import Phaser from 'phaser';
import { EnemyDefs, type EnemyKind } from '../config/EnemyDefs';
import { Balance } from '../config/Balance';

export const PARTICLE_TEXTURE_KEY = 'particle-dot';

// Centralizes Phaser.ParticleEmitter instances per effect. Emitters are persistent and idle
// (emitting:false); call .explode() to fire a one-shot burst at a given position.
// Per architecture rules, particles never own physics bodies.

export class ParticleEffects {
  private deathEmitters: Map<EnemyKind, Phaser.GameObjects.Particles.ParticleEmitter> = new Map();

  constructor(scene: Phaser.Scene) {
    ParticleEffects.ensureTexture(scene);
    for (const kind of Object.keys(EnemyDefs) as EnemyKind[]) {
      const def = EnemyDefs[kind];
      const emitter = scene.add.particles(0, 0, PARTICLE_TEXTURE_KEY, {
        speed: { min: 80, max: 240 },
        scale: { start: 1.2, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 420,
        tint: def.color,
        emitting: false,
      });
      emitter.setDepth(40);
      this.deathEmitters.set(kind, emitter);
    }
  }

  enemyDeath(kind: EnemyKind, x: number, y: number, quantity = Balance.particles.enemyDeathCount): void {
    const e = this.deathEmitters.get(kind);
    if (!e) return;
    e.explode(quantity, x, y);
  }

  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PARTICLE_TEXTURE_KEY)) return;
    const dim = 6;
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(dim / 2, dim / 2, dim / 2 - 1);
    g.generateTexture(PARTICLE_TEXTURE_KEY, dim, dim);
    g.destroy();
  }

  destroy(): void {
    for (const e of this.deathEmitters.values()) e.destroy();
    this.deathEmitters.clear();
  }
}
