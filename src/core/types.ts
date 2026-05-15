// Shared type definitions used across systems.
// Concrete domain shapes (Player, RaidState, etc.) are added as those systems are built.

export type GameMode = 'factory' | 'raid';

export type RaidEndState = 'extracted' | 'failed' | 'collapsed';

export interface RaidEndPayload {
  endState: RaidEndState;
  loot: { scrap: number; cores: number };
}

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
