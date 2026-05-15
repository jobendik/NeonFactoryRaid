// Run-scoped modifier surface. Drafting cards (§12) and operator passives (§11)
// both compose onto this struct - cards by mutating fields in their `apply`
// hooks, operators by being seeded at raid start before drafting can run.
//
// Design rule: every field is a pure additive (or multiplicative) modifier.
// No conditional branches inside the modifier. Systems read these fields each
// frame and combine them with their own base values.

export interface RunMods {
  // -------- Combat --------
  damageMult: number;        // 1.0 base, +0.15 per Sharper Shots
  fireRateMult: number;      // 1.0 base, +0.10 per Burst Fire
  pierce: number;            // 0 base, +1 per Pierce - extra targets along fire path
  splitShot: number;         // 0 base, +1 per Split Shot - extra forks per shot
  chainBonus: number;        // 0 base, +N from Chain Lightning - chain hops on top of Drone Swarm
  critChance: number;        // 0 base, +0.15 per Crit Shot
  critMult: number;          // 3.0 default, used when crit roll succeeds

  // -------- Movement --------
  speedMult: number;         // 1.0 base, +0.10 per Quick Feet
  dashCooldownMult: number;  // 1.0 base, ×0.7 per Dash Master (multiplicative)

  // -------- Survival --------
  bonusHP: number;           // 0 base, +20 per Hardy
  healOnPickup: number;      // 0 base, +1 HP per stack on each scrap pickup
  vampiricChance: number;    // 0 base, +0.10 per Vampiric
  vampiricHeal: number;      // 5 default
  orbitalShieldEnabled: boolean;
  orbitalShieldRegenSec: number;  // 12 default
  phoenixCharges: number;    // 0 base, max 1 (revive at 50% HP)

  // -------- Loot / Magnet --------
  coreChanceBonus: number;   // 0 base, +0.05 per Lucky
  magnetMult: number;        // 1.0 base, +0.20 per Wide Magnet
  magnetStormDurAdd: number; // 0 base, +8 per Magnet Storm — auto-fires Magnet Burst-equivalent
  greedSurgeMult: number;    // 1.0 base, ×1.5 per Greed Surge — multiplicative with greed step

  // -------- Drones --------
  // Multiplier on the operator-applied drone count (M16). Drone Multiplier card
  // doubles, so default 1, ×2 on pick. Composes with Vanta's +2 by being
  // applied AFTER operator base sets the count.
  droneMultiplier: number;
}

export function createDefaultRunMods(): RunMods {
  return {
    damageMult: 1.0,
    fireRateMult: 1.0,
    pierce: 0,
    splitShot: 0,
    chainBonus: 0,
    critChance: 0,
    critMult: 3.0,

    speedMult: 1.0,
    dashCooldownMult: 1.0,

    bonusHP: 0,
    healOnPickup: 0,
    vampiricChance: 0,
    vampiricHeal: 5,
    orbitalShieldEnabled: false,
    orbitalShieldRegenSec: 12,
    phoenixCharges: 0,

    coreChanceBonus: 0,
    magnetMult: 1.0,
    magnetStormDurAdd: 0,
    greedSurgeMult: 1.0,

    droneMultiplier: 1,
  };
}
