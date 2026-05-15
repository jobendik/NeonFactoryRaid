import Phaser from 'phaser';
import { SDKBridge } from './SDKBridge';
import { Balance } from '../config/Balance';
import { saveSystem } from './SaveSystem';
import { todayUtcDate } from '../config/QuestDefs';
import { Strings } from '../config/Strings';

// AdManager — central state + helpers for the §17.2 rewarded ad placements.
// Stays thin: per-placement logic (gating, reward application) lives in the
// callers (RaidScene / SummaryScene / FactoryScene). This module owns:
//
//   - the "max 1 rewarded ad prompt per raid (REVIVE or DOUBLE LOOT)" flag
//     per §17.3.
//   - the ModalScene launch + SDKBridge.requestRewarded() bridge so every
//     placement uses the same path.
//   - FACTORY BOOST cooldown / active queries against the persistent
//     adState in SaveData.
//   - DAILY CRATE eligibility + reward roll.
//
// Frequency rules from §17.3 the callers must honor (NOT enforced here):
//   - Never during active raid gameplay (paused-state offers only).
//   - Never in tutorial raid.
//   - REVIVE only with `reviveProbability` per death.

export interface AdOffer {
  title: string;
  description: string;
  acceptLabel?: string;
  declineLabel?: string;
  borderColor?: number;
}

export type DailyCrateReward = { kind: 'scrap'; amount: number } | { kind: 'core'; amount: number };

// Per-raid mutex for the "1 prompt per raid" rule. Lives in module state
// rather than save data because it's transient across raid boundaries.
let promptShownThisRaid = false;

export const AdManager = {
  // Called by RaidScene.create() to reset the per-raid prompt mutex.
  resetForRaid(): void {
    promptShownThisRaid = false;
  },

  // True if REVIVE / DOUBLE LOOT have not yet been offered this raid.
  canOfferRaidPrompt(): boolean {
    return !promptShownThisRaid;
  },

  // Flips the per-raid mutex. RaidScene calls this before launching the
  // REVIVE modal so a subsequent DOUBLE LOOT on the summary is suppressed.
  markRaidPromptShown(): void {
    promptShownThisRaid = true;
  },

  // Show the ad-confirmation modal, then on accept request the rewarded ad
  // via SDKBridge. Returns true only on accept + reward-granted. Always
  // launches ModalScene over the calling scene; the launcher should pause
  // itself before calling this and resume in the result handler.
  async offer(scene: Phaser.Scene, opts: AdOffer): Promise<boolean> {
    SDKBridge.gameplayStop();
    const accepted = await new Promise<boolean>(resolve => {
      scene.scene.launch('ModalScene', {
        title: opts.title,
        description: opts.description,
        acceptLabel: opts.acceptLabel,
        declineLabel: opts.declineLabel,
        borderColor: opts.borderColor,
        onResult: (a: boolean) => resolve(a),
      });
    });
    if (!accepted) {
      // No ad requested on decline; caller resumes their scene.
      return false;
    }
    const result = await SDKBridge.requestRewarded();
    return result.success;
  },

  // ---- FACTORY BOOST cooldown / active queries ----

  isFactoryBoostActive(now: number = Date.now()): boolean {
    return saveSystem.get().adState.factoryBoostActiveUntilMs > now;
  },

  // True if the boost is currently running OR the 10-minute cooldown has
  // not yet elapsed.
  isFactoryBoostOnCooldown(now: number = Date.now()): boolean {
    if (AdManager.isFactoryBoostActive(now)) return true;
    const last = saveSystem.get().adState.factoryBoostLastMs;
    if (last <= 0) return false;
    return now - last < Balance.ads.factoryBoostCooldownMs;
  },

  // Seconds until the boost becomes available again (0 if available now).
  factoryBoostCooldownRemainingSec(now: number = Date.now()): number {
    const save = saveSystem.get();
    if (AdManager.isFactoryBoostActive(now)) {
      return Math.ceil((save.adState.factoryBoostActiveUntilMs - now) / 1000);
    }
    if (save.adState.factoryBoostLastMs <= 0) return 0;
    const since = now - save.adState.factoryBoostLastMs;
    const remaining = Balance.ads.factoryBoostCooldownMs - since;
    return Math.max(0, Math.ceil(remaining / 1000));
  },

  activateFactoryBoost(now: number = Date.now()): void {
    const save = saveSystem.get();
    save.adState.factoryBoostLastMs = now;
    save.adState.factoryBoostActiveUntilMs = now + Balance.ads.factoryBoostDurationMs;
  },

  // ---- DAILY CRATE eligibility ----

  // True when (a) the player has raided today (any outcome), and (b) they
  // haven't already claimed today's crate.
  isDailyCrateEligible(): boolean {
    const save = saveSystem.get();
    const today = todayUtcDate();
    if (save.adState.lastDailyCrate === today) return false;
    if (save.lastRaidDate !== today) return false;
    return true;
  },

  isDailyCrateClaimedToday(): boolean {
    return saveSystem.get().adState.lastDailyCrate === todayUtcDate();
  },

  // Rolls + writes the daily crate reward. Caller is responsible for banking
  // the loot in the wallet (so Economy + Analytics see one consistent path).
  claimDailyCrate(): DailyCrateReward {
    const save = saveSystem.get();
    save.adState.lastDailyCrate = todayUtcDate();
    if (Math.random() < Balance.ads.dailyCrateScrapProbability) {
      const min = Balance.ads.dailyCrateScrapMin;
      const max = Balance.ads.dailyCrateScrapMax;
      const amount = min + Math.floor(Math.random() * (max - min + 1));
      return { kind: 'scrap', amount };
    }
    return { kind: 'core', amount: Balance.ads.dailyCrateCoreReward };
  },

  // ---- Friendly reward-toast text (callers compose) ----

  formatDailyCrateRewardText(reward: DailyCrateReward): string {
    if (reward.kind === 'scrap') {
      return `${Strings.adRewardScrapPrefix}${reward.amount}${Strings.adRewardScrapSuffix}`;
    }
    return Strings.adRewardCore;
  },
};
