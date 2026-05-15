// Enemy definitions from blueprint.md §14.1 and §14.3.
// M5 ships the four base kinds (Grunt, Swarmer, Tank, Shooter).
// M14 adds the 'elite' boss-wave variant that spawns at Greed x3 per §7.3.
// Bomber, Loot Goblin, Shield Carrier, Splitter, Extract Jammer and the
// Signal Hydra boss from §14.1 are deferred to a later content pass.
// TODO(content): Bomber telegraphed explosion at greed x2 per §7.3.

import { Balance } from './Balance';

export type EnemyKind = 'grunt' | 'swarmer' | 'tank' | 'shooter' | 'elite' | 'infested';

export type EnemyBehavior = 'chaser' | 'shooter';

export interface EnemyDef {
  hp: number;
  speed: number;
  size: number;
  color: number;
  textureKey: string;
  shape: 'triangle' | 'square' | 'pentagon';
  behavior: EnemyBehavior;
  scrapDrop: number;
  coreChance: number;
  contactDamage: number;
}

export const EnemyDefs: Record<EnemyKind, EnemyDef> = {
  grunt: {
    hp: 22,
    speed: 90,
    size: 28,
    color: Balance.colors.enemyGrunt,
    textureKey: 'enemy-grunt',
    shape: 'triangle',
    behavior: 'chaser',
    scrapDrop: 4,
    coreChance: 0.11,
    contactDamage: 10,
  },
  swarmer: {
    hp: 12,
    speed: 145,
    size: 22,
    color: Balance.colors.enemySwarmer,
    textureKey: 'enemy-swarmer',
    shape: 'triangle',
    behavior: 'chaser',
    scrapDrop: 3,
    coreChance: 0,
    contactDamage: 6,
  },
  tank: {
    hp: 60,
    speed: 58,
    size: 38,
    color: Balance.colors.enemyTank,
    textureKey: 'enemy-tank',
    shape: 'square',
    behavior: 'chaser',
    scrapDrop: 8,
    coreChance: 0.26,
    contactDamage: 18,
  },
  shooter: {
    hp: 28,
    speed: 72,
    size: 30,
    color: Balance.colors.enemyShooter,
    textureKey: 'enemy-shooter',
    shape: 'pentagon',
    behavior: 'shooter',
    scrapDrop: 5,
    coreChance: 0.14,
    contactDamage: 8,
  },
  // §7.3 boss-wave elite. Stats are 4× Tank per the M14 spec (HP and contact
  // damage); size scaled up so the visual reads as a boss. Distinctive color
  // separates it from the Tank's orange.
  elite: {
    hp: 240,
    speed: 64,
    size: 56,
    color: Balance.colors.elite,
    textureKey: 'enemy-elite',
    shape: 'square',
    behavior: 'chaser',
    scrapDrop: 24,
    coreChance: 0.55,
    contactDamage: 28,
  },
  // §4 infestation wave - red-tinted swarmer variant. Spawns only when the
  // player has any infested machines, in addition to the normal wave roll.
  // Each kill registers cleanse progress against
  // Balance.infestation.killsToRestoreMachine.
  infested: {
    hp: 18,
    speed: 130,
    size: 24,
    color: 0xff1644,
    textureKey: 'enemy-infested',
    shape: 'triangle',
    behavior: 'chaser',
    scrapDrop: 2,
    coreChance: 0,
    contactDamage: 6,
  },
};

export const ENEMY_TEXTURE_DIM = 44;
