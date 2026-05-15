import Phaser from 'phaser';
import { SDKBridge } from '../platform/SDKBridge';
import { saveSystem } from '../platform/SaveSystem';
import { startAutoSave } from '../platform/AutoSave';
import { Economy } from '../systems/EconomySystem';
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

    // Offline production per §8.6 - compute against the just-loaded save, bank
    // the result into the wallet immediately so FactoryScene's HUD shows the
    // boosted total. The "+N Scrap from offline factory" toast pulls from the
    // saveSystem's transient slot.
    const offlineScrap = Economy.computeOfflineScrap();
    if (offlineScrap > 0) {
      Economy.bankLoot(offlineScrap, 0);
      saveSystem.setPendingOfflineScrap(offlineScrap);
    }

    startAutoSave();
    SDKBridge.loadingStop();

    console.log(Strings.bootOk);

    // First-time boot lands directly in the FTUE tutorial raid (§5.1: "no
    // tutorial modal at start - the game opens directly inside a playable
    // tutorial raid"). Returning players boot into the Factory hub.
    this.scene.launch('HUDScene');
    if (!saveSystem.get().tutorialDone) {
      this.scene.start('RaidScene', { tutorial: true });
    } else {
      this.scene.start('FactoryScene');
    }
  }
}
