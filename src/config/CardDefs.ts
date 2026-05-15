// Drafting card definitions per blueprint §12.2 (24-card pool, 3 rarities).
//
// Each card defines the run-state mutation it performs (`apply`) plus display
// metadata. Cards are drawn at random with rarity weights from §12.3; once a
// card is shown it's removed from the offer pool for the rest of the run
// ("no duplicate offers", §12.3).
//
// Deferred cards remain listed here so the pool reflects the blueprint, but
// `deferred: true` excludes them from the draw set. Each cites its reason for
// deferral.

import { Balance } from './Balance';
import { Strings } from './Strings';
import type { RunMods } from '../systems/RunMods';

export type CardRarity = 'common' | 'rare' | 'epic';

export interface CardDef {
  id: string;
  name: string;
  effect: string;
  tier: CardRarity;
  // When true the card is excluded from the draw pool. We still include it
  // here so the inventory matches §12.2; future content milestones flip the
  // flag and ship the matching `apply`.
  deferred?: boolean;
  apply: (mods: RunMods) => void;
}

export const CardDefs: Record<string, CardDef> = {
  // ---------------- COMMON (white) ----------------
  sharperShots: {
    id: 'sharperShots',
    name: Strings.cardSharperShotsName,
    effect: Strings.cardSharperShotsEffect,
    tier: 'common',
    apply: m => { m.damageMult += Balance.cards.sharperShotsAdd; },
  },
  quickFeet: {
    id: 'quickFeet',
    name: Strings.cardQuickFeetName,
    effect: Strings.cardQuickFeetEffect,
    tier: 'common',
    apply: m => { m.speedMult += Balance.cards.quickFeetAdd; },
  },
  wideMagnet: {
    id: 'wideMagnet',
    name: Strings.cardWideMagnetName,
    effect: Strings.cardWideMagnetEffect,
    tier: 'common',
    apply: m => { m.magnetMult += Balance.cards.wideMagnetAdd; },
  },
  hardy: {
    id: 'hardy',
    name: Strings.cardHardyName,
    effect: Strings.cardHardyEffect,
    tier: 'common',
    apply: m => { m.bonusHP += Balance.cards.hardyHpAdd; },
  },
  burstFire: {
    id: 'burstFire',
    name: Strings.cardBurstFireName,
    effect: Strings.cardBurstFireEffect,
    tier: 'common',
    apply: m => { m.fireRateMult += Balance.cards.burstFireAdd; },
  },
  lucky: {
    id: 'lucky',
    name: Strings.cardLuckyName,
    effect: Strings.cardLuckyEffect,
    tier: 'common',
    apply: m => { m.coreChanceBonus += Balance.cards.luckyAdd; },
  },

  // ---------------- RARE (cyan) ----------------
  pierce: {
    id: 'pierce',
    name: Strings.cardPierceName,
    effect: Strings.cardPierceEffect,
    tier: 'rare',
    apply: m => { m.pierce += 1; },
  },
  chainLightning: {
    id: 'chainLightning',
    name: Strings.cardChainLightningName,
    effect: Strings.cardChainLightningEffect,
    tier: 'rare',
    apply: m => { m.chainBonus += 1; },
  },
  // DEFERRED — wall geometry isn't in the arena yet (§15 cover blocks are
  // visual-only). Bouncing requires an actual collision surface.
  ricochet: {
    id: 'ricochet',
    name: Strings.cardRicochetName,
    effect: Strings.cardRicochetEffect,
    tier: 'rare',
    deferred: true,
    apply: () => { /* TODO(M-future): wall-bounce projectile path */ },
  },
  magnetStorm: {
    id: 'magnetStorm',
    name: Strings.cardMagnetStormName,
    effect: Strings.cardMagnetStormEffect,
    tier: 'rare',
    apply: m => { m.magnetStormDurAdd += Balance.cards.magnetStormDurSec; },
  },
  dashMaster: {
    id: 'dashMaster',
    name: Strings.cardDashMasterName,
    effect: Strings.cardDashMasterEffect,
    tier: 'rare',
    apply: m => { m.dashCooldownMult *= Balance.cards.dashMasterMult; },
  },
  healOnPickup: {
    id: 'healOnPickup',
    name: Strings.cardHealOnPickupName,
    effect: Strings.cardHealOnPickupEffect,
    tier: 'rare',
    apply: m => { m.healOnPickup += Balance.cards.healOnPickupAdd; },
  },
  // DEFERRED — area-effect costs unclear vs. the M14 perf budget; revisit
  // once we have benchmarks under combo-heavy load.
  slowField: {
    id: 'slowField',
    name: Strings.cardSlowFieldName,
    effect: Strings.cardSlowFieldEffect,
    tier: 'rare',
    deferred: true,
    apply: () => { /* TODO(M-future): per-frame distance check on every enemy */ },
  },
  orbitalShield: {
    id: 'orbitalShield',
    name: Strings.cardOrbitalShieldName,
    effect: Strings.cardOrbitalShieldEffect,
    tier: 'rare',
    apply: m => {
      m.orbitalShieldEnabled = true;
      m.orbitalShieldRegenSec = Balance.cards.orbitalShieldRegenSec;
    },
  },
  critShot: {
    id: 'critShot',
    name: Strings.cardCritShotName,
    effect: Strings.cardCritShotEffect,
    tier: 'rare',
    apply: m => {
      m.critChance = Math.min(1, m.critChance + Balance.cards.critChanceAdd);
      m.critMult = Balance.cards.critMult;
    },
  },

  // ---------------- EPIC (purple) ----------------
  splitShot: {
    id: 'splitShot',
    name: Strings.cardSplitShotName,
    effect: Strings.cardSplitShotEffect,
    tier: 'epic',
    apply: m => { m.splitShot += 1; },
  },
  // DEFERRED — HP-state-conditional fire rate. Adds branching to the weapon
  // hot path and would interact with adaptive music thresholds.
  frenzyMode: {
    id: 'frenzyMode',
    name: Strings.cardFrenzyModeName,
    effect: Strings.cardFrenzyModeEffect,
    tier: 'epic',
    deferred: true,
    apply: () => { /* TODO(M-future): conditional fire-rate when HP < 30% */ },
  },
  droneMultiplier: {
    id: 'droneMultiplier',
    name: Strings.cardDroneMultiplierName,
    effect: Strings.cardDroneMultiplierEffect,
    tier: 'epic',
    apply: m => { m.droneMultiplier *= 2; },
  },
  vampiric: {
    id: 'vampiric',
    name: Strings.cardVampiricName,
    effect: Strings.cardVampiricEffect,
    tier: 'epic',
    apply: m => {
      m.vampiricChance += Balance.cards.vampiricChanceAdd;
      m.vampiricHeal = Balance.cards.vampiricHeal;
    },
  },
  // DEFERRED — dash-trigger ring damage. Needs new event hookup + AoE pass.
  novaDash: {
    id: 'novaDash',
    name: Strings.cardNovaDashName,
    effect: Strings.cardNovaDashEffect,
    tier: 'epic',
    deferred: true,
    apply: () => { /* TODO(M-future): emit a damaging ring on dash start */ },
  },
  // DEFERRED — global enemy-speed scalar. Straightforward but skipped for scope.
  timeDilation: {
    id: 'timeDilation',
    name: Strings.cardTimeDilationName,
    effect: Strings.cardTimeDilationEffect,
    tier: 'epic',
    deferred: true,
    apply: () => { /* TODO(M-future): global enemy speed multiplier */ },
  },
  greedSurge: {
    id: 'greedSurge',
    name: Strings.cardGreedSurgeName,
    effect: Strings.cardGreedSurgeEffect,
    tier: 'epic',
    apply: m => { m.greedSurgeMult *= Balance.cards.greedSurgeMult; },
  },
  phoenix: {
    id: 'phoenix',
    name: Strings.cardPhoenixName,
    effect: Strings.cardPhoenixEffect,
    tier: 'epic',
    apply: m => { m.phoenixCharges = Math.min(1, m.phoenixCharges + 1); },
  },
  // DEFERRED — death-triggered AoE. Skipped for scope.
  pyrokinetic: {
    id: 'pyrokinetic',
    name: Strings.cardPyrokineticName,
    effect: Strings.cardPyrokineticEffect,
    tier: 'epic',
    deferred: true,
    apply: () => { /* TODO(M-future): on-death AoE damage */ },
  },
};

export const CARD_POOL: CardDef[] = Object.values(CardDefs);

// Pool filtered to drawable cards only. Used by DraftSystem.
export const DRAWABLE_CARDS: CardDef[] = CARD_POOL.filter(c => !c.deferred);
