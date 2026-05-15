// Save data shape and persistence. See blueprint.md §22.6.
// Wraps SDKBridge.saveData/loadData so the save layer doesn't care whether the underlying
// store is localStorage or the CrazyGames Data SDK.

import { SDKBridge } from './SDKBridge';
import { Balance } from '../config/Balance';
import type { UpgradeLevels, RefineryLevels, FtueUnlocks } from '../core/types';

export const SAVE_VERSION = 3;
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
  // M16 — selectedOperator replaces v2's `operator`. The currently equipped
  // operator id; defaults to 'pulse'.
  selectedOperator: string;
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
    selectedOperator: 'pulse',
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

// Loose intermediate shape used during migration. Migrations operate on this
// object then we cast to SaveData once the chain is done.
type MigratingSave = Record<string, unknown> & { version?: number };

// v1 → v2: M11 adds raidsCompleted / successfulExtracts / firstCoreCollected /
// ftueUnlocks. Carry over everything else, fill new fields with safe defaults.
// Heuristic: a v1 save that already passed the tutorial (tutorialDone === true)
// is most likely past the FTUE gates too, so we unlock the full panel for them
// rather than re-hiding rows behind the new flags.
function migrateV1toV2(v1: MigratingSave): MigratingSave {
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
  const stats = (v1.stats ?? {}) as { runs?: number; extracts?: number };
  return {
    ...v1,
    version: 2,
    raidsCompleted: stats.runs ?? 0,
    successfulExtracts: stats.extracts ?? 0,
    firstCoreCollected: ((v1.cores as number) ?? 0) > 0,
    ftueUnlocks,
  };
}

// v2 → v3: M16 renames `operator` → `selectedOperator`. Carry over
// unlockedOperators (already present on v2) and default selectedOperator
// to the old `operator` value if any, falling back to 'pulse'.
function migrateV2toV3(v2: MigratingSave): MigratingSave {
  const selected = (typeof v2.operator === 'string' && v2.operator.length > 0
    ? v2.operator
    : 'pulse');
  const unlocked = Array.isArray(v2.unlockedOperators) && (v2.unlockedOperators as unknown[]).length > 0
    ? (v2.unlockedOperators as string[])
    : ['pulse'];
  const { operator: _unused, ...rest } = v2 as MigratingSave & { operator?: string };
  void _unused;
  return {
    ...rest,
    version: 3,
    selectedOperator: selected,
    unlockedOperators: unlocked,
  };
}

// Migration path - new versions add their case here. Old saves walk forward step
// by step. Per the M10 gate: a v0 save (no `version` field, written before
// versioning existed) is treated as a fresh save - we don't try to merge
// arbitrary partial shapes from a pre-history era.
function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') return createDefaultSave();
  let save = raw as MigratingSave;

  if (!save.version) {
    // v0 (pre-versioning) → discard, start fresh.
    return createDefaultSave();
  }

  if (save.version === 1) save = migrateV1toV2(save);
  if (save.version === 2) save = migrateV2toV3(save);

  if (save.version === SAVE_VERSION) {
    return save as unknown as SaveData;
  }

  // Future migration steps register here:
  //   if (save.version === 3) save = migrateV3toV4(save);
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
