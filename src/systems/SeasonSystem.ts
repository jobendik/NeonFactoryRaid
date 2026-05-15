import { saveSystem } from '../platform/SaveSystem';
import { bus, Events } from '../core/EventBus';

// SeasonSystem — §16.5 season pass scaffolding. M23 ships:
//   - 40 tiers per season, 1 XP per raid (free) or 2 XP per raid (premium)
//   - "Season 0: Preseason" with placeholder rewards (no real content yet)
//   - SaveData state already exists (seasonPass: { tier, xp, premium })
//
// Real season content (themed rewards, cosmetic unlocks, premium track)
// is post-launch. The system + UI panel are scaffolded so adding a
// season is a content-only change.

export const SEASON_TIERS = 40;
const XP_FREE = 1;
const XP_PREMIUM = 2;

// A single tier reward. M23 uses a uniform placeholder reward across
// every tier so the UI shows progress without spurious unlocks.
export interface SeasonReward {
  kind: 'scrap' | 'cores' | 'cosmeticShard' | 'cosmetic';
  amount: number;
  cosmeticId?: string;
}

export interface SeasonDef {
  id: string;
  name: string;
  tiers: SeasonReward[];
}

// Season 0: 40 identical placeholder rewards. Real seasons will fill in
// themed reward arrays.
const PRESEASON: SeasonDef = {
  id: 'season-0',
  name: 'PRESEASON',
  tiers: Array.from({ length: SEASON_TIERS }, () => ({
    kind: 'cosmeticShard' as const,
    amount: 1,
  })),
};

export const CURRENT_SEASON: SeasonDef = PRESEASON;

export const SeasonSystem = {
  // Called from RaidScene.finishRaid (any state). Awards XP, advances tier
  // when the threshold is crossed. Free track: 1 XP/raid. Premium: 2 XP/raid.
  awardRaidXp(): void {
    const save = saveSystem.get();
    if (save.seasonPass.tier >= SEASON_TIERS) return;
    const xpStep = save.seasonPass.premium ? XP_PREMIUM : XP_FREE;
    save.seasonPass.xp += xpStep;
    // 10 XP per tier — tunable later when real content lands.
    const xpPerTier = 10;
    while (save.seasonPass.xp >= xpPerTier && save.seasonPass.tier < SEASON_TIERS) {
      save.seasonPass.xp -= xpPerTier;
      save.seasonPass.tier += 1;
      bus.emit(Events.SEASON_TIER_REACHED, save.seasonPass.tier);
    }
  },

  // Read by the season panel UI for current tier progress.
  getProgress(): { tier: number; xp: number; xpPerTier: number; max: number; premium: boolean } {
    const save = saveSystem.get();
    return {
      tier: save.seasonPass.tier,
      xp: save.seasonPass.xp,
      xpPerTier: 10,
      max: SEASON_TIERS,
      premium: save.seasonPass.premium,
    };
  },

  getCurrentSeasonName(): string {
    return CURRENT_SEASON.name;
  },
};
