import { Balance } from '../config/Balance';
import { saveSystem } from '../platform/SaveSystem';

// EconomySystem centralizes the few rules that touch the player wallet:
//   - SPM formula per blueprint §8.7
//   - Banking raid loot to the persistent save
//   - Spending Scrap (used by upgrade purchases starting in M9)
//
// It's a thin module-scoped object rather than a class because there's no
// per-instance state - the wallet lives in saveSystem, the formula reads
// upgrades the same way.

function clampInfestation(ratio: number): number {
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

export const Economy = {
  // SPM = 14 × gen_level × (1 + drone_level × 0.22) × boostMult × (1 - infestation_ratio)
  computeSpm(opts?: { boostActive?: boolean; infestationRatio?: number }): number {
    const save = saveSystem.get();
    const genLevel = Math.max(1, save.upgrades.gen);
    const droneLevel = Math.max(0, save.upgrades.drone);
    const boost = opts?.boostActive ? Balance.economy.factoryBoostMult : 1;
    const infest = clampInfestation(opts?.infestationRatio ?? 0);
    return Balance.economy.spm.base * genLevel * (1 + droneLevel * Balance.economy.spm.drone) * boost * (1 - infest);
  },

  // Seconds between successive scrap drops at the current SPM.
  generatorDropIntervalSec(opts?: { boostActive?: boolean; infestationRatio?: number }): number {
    const spm = Economy.computeSpm(opts);
    if (spm <= 0) return Number.POSITIVE_INFINITY;
    return 60 / spm;
  },

  bankLoot(scrap: number, cores: number): void {
    const save = saveSystem.get();
    save.scrap += Math.max(0, Math.floor(scrap));
    save.cores += Math.max(0, Math.floor(cores));
  },

  // Returns true if the spend succeeded.
  spendScrap(amount: number): boolean {
    const save = saveSystem.get();
    if (save.scrap < amount) return false;
    save.scrap -= amount;
    return true;
  },

  getWallet(): { scrap: number; cores: number } {
    const save = saveSystem.get();
    return { scrap: save.scrap, cores: save.cores };
  },
};
