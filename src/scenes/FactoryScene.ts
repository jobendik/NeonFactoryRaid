import Phaser from 'phaser';
import { Strings } from '../config/Strings';

// FactoryScene stub used in Milestone 6 only so the raid->summary->factory->raid
// loop can be walked end-to-end. The real factory floor, machines, SPM display,
// upgrade panel, and deploy pad arrive in Milestone 8. Until then this scene is
// a placeholder with a single Deploy button.

export class FactoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FactoryScene' });
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.cameras.main.setBackgroundColor('#04080c');

    this.add
      .text(w / 2, h * 0.30, Strings.factoryStubTitle, {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#22f6ff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h * 0.40, Strings.factoryStubSub, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#888888',
      })
      .setOrigin(0.5);

    const btnW = 260;
    const btnH = 70;
    const btnX = w / 2;
    const btnY = h * 0.62;
    const btn = this.add.rectangle(btnX, btnY, btnW, btnH, 0x72ff9f, 1);
    btn.setStrokeStyle(3, 0xffffff, 0.85);
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setFillStyle(0x72ff9f, 0.85));
    btn.on('pointerout', () => btn.setFillStyle(0x72ff9f, 1));
    btn.on('pointerdown', () => {
      this.scene.start('RaidScene');
    });
    this.add
      .text(btnX, btnY, Strings.factoryDeploy, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#000000',
      })
      .setOrigin(0.5);
  }
}
