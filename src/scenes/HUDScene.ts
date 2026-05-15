import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';
import type { RaidScene } from './RaidScene';

// HUDScene runs as an overlay above RaidScene. Through Milestone 5 it shows:
//   - FPS (top-left, dev affordance)
//   - Raid timer (top-center)
//   - Combo multiplier (top-center, only when > 1.0)
// HP bar / loot counter / greed widget land in Milestone 7 alongside the proper HUD design.

function formatTime(secs: number): string {
  const total = Math.max(0, Math.ceil(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class HUDScene extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private lastFpsUpdate = 0;

  constructor() {
    super({ key: 'HUDScene', active: false });
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.fpsText = this.add
      .text(12, 10, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#22f6ff',
      })
      .setScrollFactor(0)
      .setDepth(2000);

    this.timerText = this.add
      .text(cx, 18, '', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);

    this.comboText = this.add
      .text(cx, 52, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffd75a',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);
  }

  override update(time: number): void {
    if (time - this.lastFpsUpdate > Balance.ui.fpsUpdateMs) {
      this.lastFpsUpdate = time;
      const fps = Math.round(this.game.loop.actualFps);
      this.fpsText.setText(`${Strings.fps}: ${fps}`);
    }

    const raid = this.scene.get('RaidScene') as RaidScene | undefined;
    if (!raid || !raid.scene.isActive()) {
      this.timerText.setText('');
      this.comboText.setText('');
      return;
    }
    this.timerText.setText(`${Strings.timerLabel}  ${formatTime(raid.getTimeRemaining())}`);
    const combo = raid.getCombo();
    if (combo > 1.01) {
      this.comboText.setText(`${Strings.comboLabel} x${combo.toFixed(2)}`);
    } else {
      this.comboText.setText('');
    }
  }
}
