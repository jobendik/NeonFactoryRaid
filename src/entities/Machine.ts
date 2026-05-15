import Phaser from 'phaser';
import { Balance } from '../config/Balance';

export const GENERATOR_TEXTURE_KEY = 'machine-generator';

// Generator is the only functional machine in M8 — pulses visually and yields a
// scrap pickup on a fixed cadence. The cadence is driven by EconomySystem.SPM
// (gen_level × 14 base, divided across the active generator count) so leveling
// up Gen in M9 increases output uniformly.

export class Generator {
  readonly x: number;
  readonly y: number;
  private sprite: Phaser.GameObjects.Sprite;
  private intervalSec: number;
  private timer: number;
  private pulse = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, intervalSec: number) {
    Generator.ensureTexture(scene);
    this.x = x;
    this.y = y;
    this.sprite = scene.add.sprite(x, y, GENERATOR_TEXTURE_KEY);
    this.sprite.setDepth(2);
    this.intervalSec = intervalSec;
    // Stagger so two generators don't drop on the same frame.
    this.timer = Math.random() * intervalSec;
  }

  setIntervalSec(sec: number): void {
    this.intervalSec = sec;
  }

  // Returns true on the frames where a drop should be spawned. The caller
  // pulls a Pickup out of the scene's pool and calls .spawn(...) accordingly.
  tick(dt: number): boolean {
    this.pulse += dt;
    const scale = 1 + Math.sin(this.pulse * Balance.factory.generatorPulseHz * Math.PI * 2) * 0.05;
    this.sprite.setScale(scale);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer += this.intervalSec;
      return true;
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
    this.sprite.destroy();
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
