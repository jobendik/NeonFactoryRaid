import Phaser from 'phaser';
import { SDKBridge } from '../platform/SDKBridge';
import { saveSystem } from '../platform/SaveSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#000000');

    SDKBridge.loadingStart();
    await SDKBridge.init();
    await saveSystem.load();

    console.log('Boot OK');

    // Subsequent scenes (PreloadScene, FactoryScene, RaidScene, etc.) are added in later milestones.
  }
}
