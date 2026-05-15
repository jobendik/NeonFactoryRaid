// Enemy definitions from blueprint.md §14.1.
// Milestone 2 ships Grunt only; the remaining roster (Swarmer/Tank/Shooter)
// is added in Milestone 5 when the full combat loop comes online.

import { Balance } from './Balance';

export type EnemyKind = 'grunt';

export interface EnemyDef {
  hp: number;
  speed: number;
  size: number;
  color: number;
  textureKey: string;
  shape: 'triangle' | 'square' | 'pentagon';
  scrapDrop: number;
  coreChance: number;
  contactDamage: number;
}

// Drop counts and core chances from blueprint §14.3.
export const EnemyDefs: Record<EnemyKind, EnemyDef> = {
  grunt: {
    hp: 22,
    speed: 90,
    size: 28,
    color: Balance.colors.enemyGrunt,
    textureKey: 'enemy-grunt',
    shape: 'triangle',
    scrapDrop: 4,
    coreChance: 0.11,
    contactDamage: 10,
  },
};

export const ENEMY_TEXTURE_DIM = 32;
