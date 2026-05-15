// Save data shape and persistence. See blueprint.md §22.6.
// Wraps SDKBridge.saveData/loadData so the save layer doesn't care whether the underlying
// store is localStorage or the CrazyGames Data SDK.

import { SDKBridge } from './SDKBridge';
import { Balance } from '../config/Balance';
import type { UpgradeLevels, RefineryLevels, FtueUnlocks } from '../core/types';

export const SAVE_VERSION = 2;
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
  // M11 FTUE tracking. raidsCompleted increments on any raid-end (including
  // tutorial); successfulExtracts only on extract. ftueUnlocks is the
  // progressive-reveal state for the upgrade panel (§5.3).
  raidsCompleted: number;
  successfulExtracts: number;
  firstCoreCollected: boolean;
  ftueUnlocks: FtueUnlocks;
  lastSave: number;
}

function defaultFtueUnlocks(): FtueUnlocks {
  return {
    dailyClaim: false,
    droneUpgrade: false,
    magnetUpgrade: false,
    damageUpgrade: false,
    luckUpgrade: false,
    factoryBoost: false,
    missionBoard: false,
  };
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
    raidsCompleted: 0,
    successfulExtracts: 0,
    firstCoreCollected: false,
    ftueUnlocks: defaultFtueUnlocks(),
    lastSave: Date.now(),
  };
}

// v1 → v2: M11 adds raidsCompleted / successfulExtracts / firstCoreCollected /
// ftueUnlocks. Carry over everything else, fill new fields with safe defaults.
// Heuristic: a v1 save that already passed the tutorial (tutorialDone === true)
// is most likely past the FTUE gates too, so we unlock the full panel for them
// rather than re-hiding rows behind the new flags.
function migrateV1toV2(v1: SaveData): SaveData {
  const alreadyPlayed = v1.tutorialDone === true;
  const ftueUnlocks: FtueUnlocks = alreadyPlayed
    ? {
        dailyClaim: true,
        droneUpgrade: true,
        magnetUpgrade: true,
        damageUpgrade: true,
        luckUpgrade: true,
        factoryBoost: true,
        missionBoard: false,
      }
    : defaultFtueUnlocks();
  return {
    ...v1,
    version: 2,
    raidsCompleted: v1.stats?.runs ?? 0,
    successfulExtracts: v1.stats?.extracts ?? 0,
    firstCoreCollected: (v1.cores ?? 0) > 0,
    ftueUnlocks,
  };
}

// Migration path - new versions add their case here. Old saves walk forward step
// by step. Per the M10 gate: a v0 save (no `version` field, written before
// versioning existed) is treated as a fresh save - we don't try to merge
// arbitrary partial shapes from a pre-history era.
function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') return createDefaultSave();
  let save = raw as Partial<SaveData> & { version?: number };

  if (!save.version) {
    // v0 (pre-versioning) → discard, start fresh.
    return createDefaultSave();
  }

  if (save.version === 1) {
    save = migrateV1toV2(save as SaveData);
  }

  if (save.version === SAVE_VERSION) {
    return save as SaveData;
  }

  // Future migration steps register here:
  //   if (save.version === 2) save = migrateV2toV3(save as SaveData);
  // Unknown / future versions fall through to a fresh save - safer than
  // running mismatched logic against a shape we don't understand.
  return createDefaultSave();
}

export class SaveSystem {
  private data: SaveData = createDefaultSave();
  // Transient: offline scrap computed at boot, displayed once as a toast.
  private pendingOfflineScrap = 0;

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

  setPendingOfflineScrap(amount: number): void {
    this.pendingOfflineScrap = Math.max(0, amount);
  }

  consumePendingOfflineScrap(): number {
    const v = this.pendingOfflineScrap;
    this.pendingOfflineScrap = 0;
    return v;
  }
}

export const saveSystem = new SaveSystem();
