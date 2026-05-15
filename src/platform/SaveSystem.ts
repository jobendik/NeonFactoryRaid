// Save data shape and persistence. See blueprint.md §22.6.
// Wraps SDKBridge.saveData/loadData so the save layer doesn't care whether the underlying
// store is localStorage or the CrazyGames Data SDK.

import { SDKBridge } from './SDKBridge';
import { Balance } from '../config/Balance';
import type { UpgradeLevels, RefineryLevels } from '../core/types';

export const SAVE_VERSION = 1;
const SAVE_KEY = 'save';

export interface SaveStats {
  runs: number;
  extracts: number;
  totalScrap: number;
  bestRaid: number;
  killCount: number;
}

export interface SaveDaily {
  lastClaim: string;
  streak: number;
  questId: string;
  questProgress: number;
}

export interface SaveSeason {
  tier: number;
  xp: number;
  premium: boolean;
}

export interface SaveCosmetics {
  equipped: { trail: string; skin: string; theme: string };
  owned: string[];
}

export interface SaveData {
  version: number;
  scrap: number;
  cores: number;
  tokens: number;
  upgrades: UpgradeLevels;
  refinery: RefineryLevels;
  operator: string;
  unlockedOperators: string[];
  achievements: string[];
  prestige: { count: number; cyberCores: number };
  daily: SaveDaily;
  seasonPass: SaveSeason;
  cosmetics: SaveCosmetics;
  infestation: { machineIds: number[] };
  stats: SaveStats;
  tutorialDone: boolean;
  lastSave: number;
}

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    scrap: Balance.economy.startingScrap,
    cores: 0,
    tokens: 0,
    upgrades: { gen: 1, drone: 0, speed: 0, magnet: 0, damage: 0, luck: 0 },
    refinery: {},
    operator: 'pulse',
    unlockedOperators: ['pulse'],
    achievements: [],
    prestige: { count: 0, cyberCores: 0 },
    daily: { lastClaim: '', streak: 0, questId: '', questProgress: 0 },
    seasonPass: { tier: 0, xp: 0, premium: false },
    cosmetics: { equipped: { trail: '', skin: '', theme: '' }, owned: [] },
    infestation: { machineIds: [] },
    stats: { runs: 0, extracts: 0, totalScrap: 0, bestRaid: 0, killCount: 0 },
    tutorialDone: false,
    lastSave: Date.now(),
  };
}

// Migration path - new versions add their case here. Old saves walk forward step by step.
function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') return createDefaultSave();
  const save = raw as Partial<SaveData> & { version?: number };
  if (!save.version || save.version < SAVE_VERSION) {
    // No prior versions yet. When v2 ships, add: if (save.version === 1) save = migrateV1toV2(save);
    return { ...createDefaultSave(), ...save, version: SAVE_VERSION };
  }
  return save as SaveData;
}

export class SaveSystem {
  private data: SaveData = createDefaultSave();

  async load(): Promise<SaveData> {
    const raw = await SDKBridge.loadData<SaveData>(SAVE_KEY);
    this.data = raw ? migrate(raw) : createDefaultSave();
    return this.data;
  }

  async persist(): Promise<void> {
    this.data.lastSave = Date.now();
    await SDKBridge.saveData(SAVE_KEY, this.data);
  }

  get(): SaveData {
    return this.data;
  }

  set(data: SaveData): void {
    this.data = data;
  }
}

export const saveSystem = new SaveSystem();
