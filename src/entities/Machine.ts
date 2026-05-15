import Phaser from 'phaser';
import { Balance } from '../config/Balance';

export const GENERATOR_TEXTURE_KEY = 'machine-generator';
export const GENERATOR_SMOKE_TEXTURE_KEY = 'machine-generator-smoke';

// Generator is the only functional machine in M8 — pulses visually and yields a
// scrap pickup on a fixed cadence. The cadence is driven by EconomySystem.SPM
// (gen_level × 14 base, divided across the active generator count) so leveling
// up Gen in M9 increases output uniformly.

export class Generator {
  readonly x: number;
  readonly y: number;
  readonly slotIndex: number;
  private sprite: Phaser.GameObjects.Sprite;
  private intervalSec: number;
  private timer: number;
  private pulse = 0;
  // M17 infestation. When true, the generator stops dropping scrap, gets a
  // red overlay + jitter tween, and a smoke emitter renders above it.
  private infested = false;
  private overlay: Phaser.GameObjects.Graphics | null = null;
  private smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private jitterTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, intervalSec: number, slotIndex: number = 0) {
    Generator.ensureTexture(scene);
    Generator.ensureSmokeTexture(scene);
    this.x = x;
    this.y = y;
    this.slotIndex = slotIndex;
    this.sprite = scene.add.sprite(x, y, GENERATOR_TEXTURE_KEY);
    this.sprite.setDepth(2);
    this.intervalSec = intervalSec;
    // Stagger so two generators don't drop on the same frame.
    this.timer = Math.random() * intervalSec;
  }

  setIntervalSec(sec: number): void {
    this.intervalSec = sec;
  }

  setInfested(infested: boolean): void {
    if (this.infested === infested) return;
    this.infested = infested;
    const scene = this.sprite.scene;
    if (infested) {
      this.sprite.setTint(0xff416b);
      this.overlay = scene.add.graphics().setDepth(3);
      this.overlay.fillStyle(0xff1644, 0.28);
      this.overlay.fillRect(
        this.x - Balance.factory.generatorSize / 2,
        this.y - Balance.factory.generatorSize / 2,
        Balance.factory.generatorSize,
        Balance.factory.generatorSize,
      );
      this.overlay.lineStyle(2, 0xff1644, 0.85);
      this.overlay.strokeRect(
        this.x - Balance.factory.generatorSize / 2,
        this.y - Balance.factory.generatorSize / 2,
        Balance.factory.generatorSize,
        Balance.factory.generatorSize,
      );
      // Subtle horizontal jitter on the sprite to read as "glitched".
      this.jitterTween = scene.tweens.add({
        targets: this.sprite,
        x: { from: this.x - 2, to: this.x + 2 },
        duration: 110,
        yoyo: true,
        repeat: -1,
        ease: 'Linear',
      });
      this.smokeEmitter = scene.add.particles(this.x, this.y - 12, GENERATOR_SMOKE_TEXTURE_KEY, {
        speed: { min: 18, max: 38 },
        angle: { min: 250, max: 290 },
        lifespan: 900,
        frequency: 110,
        scale: { start: 0.65, end: 0.05 },
        alpha: { start: 0.85, end: 0 },
        tint: 0xff416b,
      });
      this.smokeEmitter.setDepth(4);
    } else {
      this.sprite.clearTint();
      this.overlay?.destroy();
      this.overlay = null;
      this.jitterTween?.stop();
      this.jitterTween = null;
      this.sprite.setX(this.x);
      this.smokeEmitter?.destroy();
      this.smokeEmitter = null;
    }
  }

  isInfested(): boolean {
    return this.infested;
  }

  // Returns true on the frames where a drop should be spawned. The caller
  // pulls a Pickup out of the scene's pool and calls .spawn(...) accordingly.
  tick(dt: number): boolean {
    this.pulse += dt;
    if (!this.infested) {
      const scale = 1 + Math.sin(this.pulse * Balance.factory.generatorPulseHz * Math.PI * 2) * 0.05;
      this.sprite.setScale(scale);
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer += this.intervalSec;
      return !this.infested; // infested machines never drop
    }
    return false;
  }

  // Random offset around the generator so drops scatter onto the floor instead
  // of stacking at one pixel.
  randomDropPosition(): { x: number; y: number } {
    const minR = Balance.factory.generatorDropOffsetMin;
    const maxR = Balance.factory.generatorDropOffsetMax;
    const r = minR + Math.random() * (maxR - minR);
    const a = Math.random() * Math.PI * 2;
    return { x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r };
  }

  destroy(): void {
    this.overlay?.destroy();
    this.jitterTween?.stop();
    this.smokeEmitter?.destroy();
    this.sprite.destroy();
  }

  static ensureSmokeTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(GENERATOR_SMOKE_TEXTURE_KEY)) return;
    const dim = 12;
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(dim / 2, dim / 2, dim / 2 - 1);
    g.generateTexture(GENERATOR_SMOKE_TEXTURE_KEY, dim, dim);
    g.destroy();
  }

  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(GENERATOR_TEXTURE_KEY)) return;
    const dim = Balance.factory.generatorSize;
    const g = scene.add.graphics();
    // Outer chassis
    g.fillStyle(0x141d2a, 1);
    g.fillRoundedRect(0, 0, dim, dim, 6);
    g.lineStyle(2, Balance.colors.player, 0.85);
    g.strokeRoundedRect(0, 0, dim, dim, 6);
    // Sine-wave indicator inside per §8.3
    g.lineStyle(2, Balance.colors.player, 1);
    const cx = dim / 2;
    const cy = dim / 2;
    const w = dim - 14;
    g.beginPath();
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const px = cx - w / 2 + t * w;
      const py = cy + Math.sin(t * Math.PI * 4) * 8;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.strokePath();
    g.generateTexture(GENERATOR_TEXTURE_KEY, dim, dim);
    g.destroy();
  }
}
