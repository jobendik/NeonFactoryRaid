// Operator selection + raid-time kit application. See blueprint.md §11.
//
// Reads / writes saveSystem.get().selectedOperator and unlockedOperators.
// At raid start, RaidScene calls applyOperatorMods(runMods) which seeds the
// shared RunMods with the active operator's kit before drafting layers on top.

import { saveSystem } from '../platform/SaveSystem';
import { OperatorDefs, type OperatorId } from '../config/OperatorDefs';
import { Economy } from './EconomySystem';
import { bus, Events } from '../core/EventBus';
import type { RunMods } from './RunMods';

export const OperatorSystem = {
  getSelected(): OperatorId {
    const id = saveSystem.get().selectedOperator;
    if (id in OperatorDefs) return id as OperatorId;
    return 'pulse';
  },

  isUnlocked(id: OperatorId): boolean {
    return saveSystem.get().unlockedOperators.includes(id);
  },

  // Selects an unlocked operator. Returns true on success. Does NOT unlock;
  // call unlock() first.
  select(id: OperatorId): boolean {
    if (OperatorDefs[id].locked) return false;
    if (!OperatorSystem.isUnlocked(id)) return false;
    const save = saveSystem.get();
    if (save.selectedOperator === id) return true;
    save.selectedOperator = id;
    bus.emit(Events.OPERATOR_SELECTED, id);
    return true;
  },

  // Spends Cores and unlocks the operator. Returns true on success. Locked
  // (not-yet-implemented) operators always return false.
  unlock(id: OperatorId): boolean {
    const def = OperatorDefs[id];
    if (def.locked) return false;
    if (OperatorSystem.isUnlocked(id)) return true;
    const cost = def.unlockCost;
    const wallet = Economy.getWallet();
    if (wallet.cores < cost) return false;
    if (!Economy.spendCores(cost)) return false;
    const save = saveSystem.get();
    save.unlockedOperators = [...save.unlockedOperators, id];
    bus.emit(Events.OPERATOR_UNLOCKED, id);
    return true;
  },

  // Called by RaidScene at raid start, after Player + WeaponSystem caches are
  // seeded with upgrade values. Mutates RunMods so card picks compose on top.
  applyOperatorMods(mods: RunMods): void {
    const id = OperatorSystem.getSelected();
    const def = OperatorDefs[id];
    def.apply(mods);
  },
};
