import { saveSystem } from '../platform/SaveSystem';
import { bus, Events } from '../core/EventBus';
import { Economy } from './EconomySystem';
import { CosmeticSystem } from './CosmeticSystem';

// SeasonSystem — §16.5 season pass. Suggestions audit ships real themed
// rewards for Season 1: "Neon Genesis" — a 40-tier track mixing Scrap, Cores,
// cosmetic shards, and three cosmetic unlocks (free track only). Premium
// track is the same rewards plus a premium-only cosmetic at tier 40.
//
// On tier-reached, AUTOMATICALLY claim the reward into the player's wallet
// or cosmetic inventory — no manual "claim" step. Bus event fires so HUD
// can toast.

export const SEASON_TIERS = 40;
const XP_FREE = 1;
const XP_PREMIUM = 2;
const XP_PER_TIER = 10;

export interface SeasonReward {
  kind: 'scrap' | 'cores' | 'cosmeticShard' | 'cosmetic';
  amount: number;
  cosmeticId?: string;
}

export interface SeasonDef {
  id: string;
  name: string;
  // Indexed by tier (0..SEASON_TIERS-1). Tier 1 reward is tiers[0].
  tiers: SeasonReward[];
  // Premium-only rewards layered on top of the free track. Empty for free
  // players. premiumTiers[i] is granted at tier i+1 if save.seasonPass.premium.
  premiumTiers: Array<SeasonReward | null>;
}

// Authored Season 1 reward table. Mixes currencies and shards on a regular
// cadence with three cosmetic unlocks at notable tier milestones (10, 25, 40).
function buildSeason1(): SeasonDef {
  const tiers: SeasonReward[] = [];
  for (let t = 1; t <= SEASON_TIERS; t++) {
    if (t === 10) {
      tiers.push({ kind: 'cosmetic', amount: 1, cosmeticId: 'trail-neon' });
    } else if (t === 25) {
      tiers.push({ kind: 'cosmetic', amount: 1, cosmeticId: 'skin-amber' });
    } else if (t === 40) {
      tiers.push({ kind: 'cosmetic', amount: 1, cosmeticId: 'theme-violet' });
    } else if (t % 5 === 0) {
      tiers.push({ kind: 'cores', amount: 1 });
    } else if (t % 3 === 0) {
      tiers.push({ kind: 'cosmeticShard', amount: 1 });
    } else {
      tiers.push({ kind: 'scrap', amount: 40 + t * 5 });
    }
  }
  const premiumTiers: Array<SeasonReward | null> = Array.from({ length: SEASON_TIERS }, () => null);
  // Premium-only sprinkles: extra Cores every 5 tiers + exclusive cosmetic at 40.
  for (let t = 5; t <= SEASON_TIERS; t += 5) {
    premiumTiers[t - 1] = { kind: 'cores', amount: 1 };
  }
  premiumTiers[39] = { kind: 'cosmetic', amount: 1, cosmeticId: 'skin-prismatic' };
  return { id: 'season-1', name: 'NEON GENESIS', tiers, premiumTiers };
}

export const CURRENT_SEASON: SeasonDef = buildSeason1();

function grantReward(reward: SeasonReward): void {
  switch (reward.kind) {
    case 'scrap':
      Economy.bankLoot(reward.amount, 0);
      break;
    case 'cores':
      Economy.bankLoot(0, reward.amount);
      break;
    case 'cosmeticShard':
      saveSystem.get().cosmeticShards += reward.amount;
      break;
    case 'cosmetic':
      if (reward.cosmeticId) CosmeticSystem.unlock(reward.cosmeticId);
      break;
  }
}

export const SeasonSystem = {
  // Called from RaidScene.finishRaid (any state). Awards XP, advances tier
  // when the threshold is crossed.
  awardRaidXp(): void {
    const save = saveSystem.get();
    if (save.seasonPass.tier >= SEASON_TIERS) return;
    const xpStep = save.seasonPass.premium ? XP_PREMIUM : XP_FREE;
    save.seasonPass.xp += xpStep;
    while (save.seasonPass.xp >= XP_PER_TIER && save.seasonPass.tier < SEASON_TIERS) {
      save.seasonPass.xp -= XP_PER_TIER;
      save.seasonPass.tier += 1;
      const tier = save.seasonPass.tier;
      const reward = CURRENT_SEASON.tiers[tier - 1];
      if (reward) grantReward(reward);
      if (save.seasonPass.premium) {
        const prem = CURRENT_SEASON.premiumTiers[tier - 1];
        if (prem) grantReward(prem);
      }
      bus.emit(Events.SEASON_TIER_REACHED, tier);
    }
  },

  // Read by the season panel UI for current tier progress.
  getProgress(): { tier: number; xp: number; xpPerTier: number; max: number; premium: boolean } {
    const save = saveSystem.get();
    return {
      tier: save.seasonPass.tier,
      xp: save.seasonPass.xp,
      xpPerTier: XP_PER_TIER,
      max: SEASON_TIERS,
      premium: save.seasonPass.premium,
    };
  },

  getCurrentSeasonName(): string {
    return CURRENT_SEASON.name;
  },

  // For the season-pass UI: the upcoming reward at the *next* tier so players
  // know what they're working toward.
  getNextReward(): SeasonReward | null {
    const save = saveSystem.get();
    const next = save.seasonPass.tier;
    if (next >= SEASON_TIERS) return null;
    return CURRENT_SEASON.tiers[next] ?? null;
  },
};
