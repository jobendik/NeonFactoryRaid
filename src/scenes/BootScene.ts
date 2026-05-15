import Phaser from 'phaser';
import { SDKBridge } from '../platform/SDKBridge';
import { saveSystem } from '../platform/SaveSystem';
import { Strings } from '../config/Strings';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#000000');

    SDKBridge.loadingStart();
    await SDKBridge.init();
    await saveSystem.load();
    SDKBridge.loadingStop();

    console.log(Strings.bootOk);

    this.scene.start('RaidScene');
    this.scene.launch('HUDScene');
  }
}
