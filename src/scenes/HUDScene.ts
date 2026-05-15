import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';

// HUDScene runs as an overlay above RaidScene/FactoryScene. Holds only the FPS
// counter through Milestone 5; HP/loot/timer widgets land in Milestone 7.

export class HUDScene extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;
  private lastFpsUpdate = 0;

  constructor() {
    super({ key: 'HUDScene', active: false });
  }

  create(): void {
    this.fpsText = this.add
      .text(12, 10, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#22f6ff',
      })
      .setScrollFactor(0)
      .setDepth(2000);
  }

  override update(time: number): void {
    if (time - this.lastFpsUpdate > Balance.ui.fpsUpdateMs) {
      this.lastFpsUpdate = time;
      const fps = Math.round(this.game.loop.actualFps);
      this.fpsText.setText(`${Strings.fps}: ${fps}`);
    }
  }
}
