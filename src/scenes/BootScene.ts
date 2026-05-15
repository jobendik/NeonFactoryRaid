import Phaser from 'phaser';
import { SDKBridge } from '../platform/SDKBridge';
import { saveSystem } from '../platform/SaveSystem';
import { startAutoSave } from '../platform/AutoSave';
import { Economy } from '../systems/EconomySystem';
import { Strings } from '../config/Strings';
import { DailyQuestSystem } from '../systems/DailyQuestSystem';
import { AchievementSystem } from '../systems/AchievementSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#000000');
    // M22 — drive the HTML preloader from BootScene. The init + load steps
    // are quick enough that a single update on each gate is plenty.
    BootScene.setHtmlPreloadProgress(0.1);

    SDKBridge.loadingStart();
    await SDKBridge.init();
    BootScene.setHtmlPreloadProgress(0.4);
    await saveSystem.load();
    BootScene.setHtmlPreloadProgress(0.75);

    // Offline production per §8.6 - compute against the just-loaded save, bank
    // the result into the wallet immediately so FactoryScene's HUD shows the
    // boosted total. The "+N Scrap from offline factory" toast pulls from the
    // saveSystem's transient slot.
    const offlineScrap = Economy.computeOfflineScrap();
    if (offlineScrap > 0) {
      Economy.bankLoot(offlineScrap, 0);
      saveSystem.setPendingOfflineScrap(offlineScrap);
    }

    // M18 — DailyQuestSystem subscribes to gameplay events. Init once at
    // boot so quest progress accrues even on the first tutorial raid (the
    // claim panel itself is gated on tutorialDone + first real raid).
    DailyQuestSystem.init();
    // M23 — AchievementSystem subscribes to PLAYER_DAMAGED + PICKUP_COLLECTED
    // for transient per-raid flags; the per-end audit is driven explicitly
    // from RaidScene.finishRaid.
    AchievementSystem.init();

    startAutoSave();
    SDKBridge.loadingStop();
    BootScene.setHtmlPreloadProgress(1);
    BootScene.hideHtmlPreload();

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

  // M22 — HTML preloader bridge. The preload screen in index.html owns its
  // own DOM and is faded out + removed once boot completes.
  static setHtmlPreloadProgress(ratio: number): void {
    if (typeof document === 'undefined') return;
    const bar = document.getElementById('nfr-preload-bar-fill');
    if (bar) bar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  static hideHtmlPreload(): void {
    if (typeof document === 'undefined') return;
    const node = document.getElementById('nfr-preload');
    if (!node) return;
    node.classList.add('fading');
    // Match the CSS transition (0.4s) plus a small margin to be safe.
    setTimeout(() => {
      node.remove();
    }, 500);
  }
}
