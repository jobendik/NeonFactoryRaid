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
}

export const EnemyDefs: Record<EnemyKind, EnemyDef> = {
  grunt: {
    hp: 22,
    speed: 90,
    size: 28,
    color: Balance.colors.enemyGrunt,
    textureKey: 'enemy-grunt',
    shape: 'triangle',
  },
};

export const ENEMY_TEXTURE_DIM = 32;
