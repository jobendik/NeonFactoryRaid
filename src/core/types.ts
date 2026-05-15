// Shared type definitions used across systems.
// Concrete domain shapes (Player, RaidState, etc.) are added as those systems are built.

export type GameMode = 'factory' | 'raid';

export interface UpgradeLevels {
  gen: number;
  drone: number;
  speed: number;
  magnet: number;
  damage: number;
  luck: number;
}

export interface RefineryLevels {
  [key: string]: number;
}

export interface Vec2 {
  x: number;
  y: number;
}
