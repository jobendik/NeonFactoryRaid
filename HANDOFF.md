# HANDOFF — Milestones 1–10 (Gate 2)

## What runs end-to-end

Boot → FactoryScene → walk onto deploy pad → RaidScene → extract (or die / time
out) → SummaryScene → Factory. Upgrades persist; offline production banks on
reload; the whole loop is playable on `npm run dev`.

## Built across M1–M10

| M | Delivered |
|---|---|
| M0 | Vite + Phaser 3 + strict TS scaffold |
| M1 | Renderer / camera / input / Player |
| M2 | Enemy base + WaveDirector (Grunt) |
| M3 | Auto-aim WeaponSystem (hitscan tracer + manual overlap) |
| M4 | Pickups + magnet + collection |
| M5 | Four enemy kinds (Grunt, Swarmer, Tank, Shooter), combo, popups, raid timer |
| M6 | ExtractionSystem (pad, hold, decay, moment), end-states, SummaryScene, FactoryScene stub |
| M7 | GreedSystem + raid HUD pass (HP bar, wallet, greed badge, waypoint) |
| M8 | FactoryScene with generators, deploy pad, SPM, drones-in-factory plumbing |
| M9 | Six upgrades with cost scaling, panel UI, effects wired, §8.5 visual milestone hooks |
| M10 | Auto-save (10s + UPGRADE_PURCHASED + RAID_ENDED + FactoryScene shutdown + raid-end explicit), offline production toast, migration scaffold |

## Gate decisions (carried forward)

- **WeaponSystem** stays at `src/systems/WeaponSystem.ts`. Flat `entities/ systems/ scenes/` layout deviates from blueprint §22.3's subdir tree intentionally — the file count doesn't justify nesting yet.
- **HUDScene → RaidScene state**: `scene.get('RaidScene')` for per-frame numeric reads (HP, timer, etc.); EventBus for discrete events. Same pattern applied to FactoryScene.
- **Combo scales drop VALUE, not COUNT** (§7.4 reinterpreted). Pickup count would otherwise blow past the 220 cap on multi-tank kills at max combo. Collection popup surfaces the multiplied number when value > 1.
- **Greed multiplier composes with combo** at extract time. Combo bakes into pickup value at drop time; greed multiplies the banked total.
- **Boot lands in FactoryScene** so the factory→raid→extract→upgrade loop walks naturally from cold start.
- **0-HP** transitions cleanly to the 'failed' summary. No revive offer until M20.
- **Placeholder visuals throughout** — generator (rectangle with sine wave), reactor (yellow rectangle labeled "REACTOR"), conveyor belt (line strip), magnet coil (cyan rectangle labeled "COIL"). Final art deferred.

## Deviations flagged

1. **§8.5 gameplay-affecting milestones not yet wired** — Magnet Lv. 5 orbit, Damage Lv. 5 pierce, Damage Lv. 10 split, Luck Lv. 5 gold trails. Cost-scaling and SPM/HP/speed/magnet-radius/damage/luck effects ARE live; the qualitative-effect tier is deferred to a future balance pass.
2. **§7.3 Greed enemy-difficulty escalation not wired** — only the loot multiplier was M7's spec. Spawn-rate boosts at the x1.25/x1.5/x2.0/x3.0 thresholds and elite/bomber/boss-wave triggers remain TODO.
3. **Drone upgrade in raids**: M9 spawns drones in the factory (orbit + extend magnet radius). Raid-mode drone behavior — auto-fire per Drone Lv. 5 — deferred.
4. **Generator SPM math**: total output = SPM. With N generators active, each generator's drop interval = `(60 / SPM) × N` so cadence stays correct as the second generator slides in at Gen Lv. 2.
5. **Migration**: v0 saves discarded (per gate). Forward migrate steps stubbed in the comments of `migrate()`.
6. **HUDScene runs continuously** across scene transitions and reads whichever gameplay scene is active. No separate FactoryHUD scene.

## Current state

- `npm run typecheck` — clean (strict mode, no errors)
- `npm run build` — clean (warns on Phaser bundle size > 500KB, benign; manualChunks already splits phaser out)
- `npm run dev` — serves at :5173, transforms all modules

## Where things live

```
src/
  config/        Balance, Strings, EnemyDefs, UpgradeDefs (all tunable consts)
  core/          EventBus (Events.*), Rng, types (RaidEndState, RaidEndPayload, UpgradeLevels)
  entities/      Player, Enemy, Bullet, Pickup, Machine (Generator), Drone
  scenes/        BootScene, FactoryScene, RaidScene, HUDScene, SummaryScene
  systems/       InputSystem, VirtualJoystick, WaveDirector, WeaponSystem,
                 ParticleEffects, ExtractionSystem, GreedSystem,
                 EconomySystem, UpgradeSystem
  platform/      SDKBridge (CrazyGames stub), SaveSystem, AutoSave, Audio
  ui/            UpgradeCard
```

Stub-only (populated in later milestones): scenes/PreloadScene, scenes/ModalScene,
ui/{HUD,Modal,SettingsMenu,SummaryScreen}, systems/{AchievementSystem,DailyQuestSystem,
DraftSystem,InfestationSystem,LeaderboardSystem,PowerupSystem,StreakSystem},
entities/Powerup, config/{CardDefs,OperatorDefs,PowerupDefs}, platform/Analytics.

## Playing one full cycle in dev

```
npm install        # if needed
npm run dev        # opens at http://localhost:5173
```

1. Lands in the FactoryScene with 100 starting Scrap and one pulsing generator on the left.
2. Walk around (WASD or arrows) — scrap drops out of the generator on the §8.7 cadence (~4.3s at gen lv 1).
3. Right-side panel shows six upgrade cards. Buy GENERATOR for 25 Scrap — second generator appears, Player Max HP rises by 3.
4. Walk onto the green pad on the right (hold 0.4s) — RaidScene starts.
5. Survive 75 seconds, building combo by chaining kills. Extraction pad opens at 20s (top-right corner). Off-screen arrow points at it.
6. Stand on the extraction pad for 5 seconds → "moment" plays (flash + chord + loot fly-in) → SummaryScene.
7. Click FACTORY → back to the hub with the banked loot in the wallet.
8. Reload the tab — wallet and upgrades are still there. If you wait some minutes before reloading you'll see "+N Scrap from offline factory" toast.

Dying (HP → 0) or running out of time both route to a SummaryScene with the
correct title and the -50% unbanked-loot penalty applied.

## What M11 should tackle first

Per blueprint §5 (FTUE):

1. **Progressive UI reveal in the upgrade panel** (§5.3) — the M9 panel shows all six rows. M11 should hide locked rows by default and reveal them on script:
   - Gen visible at start (player has 100 Scrap)
   - Magnet appears after first raid
   - Drone appears after second raid
   - Damage after third raid
   - Luck after first Core collected
2. **Tutorial difficulty** (§5.4) — first raid uses tutorial timings (45s duration, 18s extract open, lower spawn rate). Add a `tutorialDone` check (already in SaveData) gating which raid duration is used.
3. **Beat-by-beat FTUE overlays** (§5.2) — minimal text prompts ("Move", "Tap to dash", "Reach the extraction") layered over the first raid only.

Start with (1) since it's pure UI + a small `tutorialDone` flag gate; the panel
changes are entirely in `FactoryScene.buildUpgradePanel()` and don't require
touching gameplay systems.
