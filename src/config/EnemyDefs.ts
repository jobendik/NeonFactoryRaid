// Enemy definitions from blueprint.md §14.1 and §14.3.
// Milestone 5 ships the four base kinds: Grunt, Swarmer, Tank, Shooter.
// Elite/boss variants land in later milestones.

import { Balance } from './Balance';

export type EnemyKind = 'grunt' | 'swarmer' | 'tank' | 'shooter';

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
};

export const ENEMY_TEXTURE_DIM = 44;
