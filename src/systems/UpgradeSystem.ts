import { Economy } from './EconomySystem';
import { saveSystem } from '../platform/SaveSystem';
import { nextCost, type UpgradeKey } from '../config/UpgradeDefs';
import { bus, Events } from '../core/EventBus';
import { Balance } from '../config/Balance';

// Thin wrapper around the saveSystem.upgrades record. All purchase logic goes
// through here so M11's progressive-reveal panel and M10's auto-save can hang
// off Events.UPGRADE_PURCHASED without re-deriving levels independently.

export const UpgradeSystem = {
  getLevel(key: UpgradeKey): number {
    return saveSystem.get().upgrades[key];
  },

  getNextCost(key: UpgradeKey): number {
    return nextCost(key, UpgradeSystem.getLevel(key));
  },

  canAfford(key: UpgradeKey): boolean {
    return Economy.getWallet().scrap >= UpgradeSystem.getNextCost(key);
  },

  purchase(key: UpgradeKey): boolean {
    const cost = UpgradeSystem.getNextCost(key);
    if (!Economy.spendScrap(cost)) return false;
    saveSystem.get().upgrades[key] += 1;
    bus.emit(Events.UPGRADE_PURCHASED, key, saveSystem.get().upgrades[key]);
    return true;
  },
};

// Read-side helpers that the rest of the codebase uses to project upgrade
// levels onto concrete numbers. Putting them here means tuning the formula
// only requires touching one file.

export const UpgradeEffects = {
  playerMaxHp(): number {
    const lvl = saveSystem.get().upgrades.gen;
    return Balance.player.baseHP + Math.max(0, lvl - 1) * Balance.player.hpPerGenLevel;
  },
  playerSpeed(): number {
    const lvl = saveSystem.get().upgrades.speed;
    return Balance.player.baseSpeed + lvl * Balance.player.speedPerLevel;
  },
  magnetRadius(): number {
    const lvl = saveSystem.get().upgrades.magnet;
    return Balance.magnet.baseRadius + lvl * Balance.magnet.radiusPerLevel;
  },
  weaponDamageLevel(): number {
    return saveSystem.get().upgrades.damage;
  },
  coreDropChance(base: number): number {
    const lvl = saveSystem.get().upgrades.luck;
    return Math.min(1, base + lvl * Balance.economy.coreChancePerLuck);
  },
  droneCount(): number {
    return saveSystem.get().upgrades.drone;
  },
};
