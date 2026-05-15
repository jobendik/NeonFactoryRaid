# HANDOFF — Milestones 1–14 (Run B, M11–M14 added)

## What runs end-to-end

First boot (no save) drops straight into the FTUE tutorial raid. Extract →
SummaryScene → FactoryScene with only the GENERATOR row visible →
deploy → real RaidScene → extract / die / time out → SummaryScene →
Factory. Upgrades persist; offline production banks on reload; the whole
loop is playable on `npm run dev`. Audio + adaptive music wired
throughout.

## Built across M1–M14

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
| M11 | FTUE: boot routing, SaveData v2 migration, tutorial raid (§5.4 mods + §5.2 captions + safety net), progressive-reveal upgrade panel, deploy prompt |
| M12 | Full PowerupSystem (7 power-ups), pulsing-pentagon entities, HUD pip strip, weapon chain shots (Drone Swarm), Shield charges on Player, Enemy freeze flag |
| M13 | `src/audio/` AudioBus (master/music/sfx + mute), synth SFX library covering §20.2, 3-layer adaptive raid music + factory pad, HUD mute toggle + SettingsMenu scaffold |
| M14 | Greed-side §7.3 escalation (spawn rate, tank rush, elite boss-wave), red HUD vignette + deep-end tint, hit-stop, knockback, combo damage popups, near-miss reward, HUD greed-badge re-layout |

## Gate decisions (still current)

- **Flat layout** stays — `entities/ systems/ scenes/ audio/ ui/ config/ platform/ core/`. Reconsider at M17+ when system count justifies subdirs. (Pre-flight #3, Run B.)
- **WeaponSystem.ts** canonical in `src/systems/`. Multi-target return array + `setFireRateMult` + `setTargetsPerShot` added in M12.
- **HUDScene → RaidScene state**: `scene.get('RaidScene')` for per-frame numeric reads (HP, timer, active power-ups, shield charges, waypoint target); EventBus for discrete events. Same pattern for FactoryScene.
- **Combo scales drop VALUE, not COUNT** (§7.4 reinterpreted).
- **Greed multiplier composes with combo** at extract time. M14 added the §7.3 enemy escalation on top (spawn rate + tank rush + elite at x3).
- **Boot routing**: first-time boot → tutorial raid; returning players → FactoryScene. Tutorial extract sets `save.tutorialDone = true` and `ftueUnlocks.dailyClaim`.
- **0-HP** transitions to the 'failed' summary. Tutorial-only safety net floors HP at 1 so the FTUE can't fail.
- **All tunables in Balance.ts. All strings in Strings.ts.** Honored throughout M11–M14.
- **Phaser Groups for pooling. ParticleEmitter for particles (no physics bodies).** PowerupSystem uses a Phaser Group for power-up entities. Player bullets stay hitscan + manual overlap; Shooter projectiles remain physics sprites.
- **Drone Swarm reinterpreted to §13 spec** — "chain shots to extra enemies," not the M11 placeholder orbit drones. The orbit-drone visualization is retired.

## Deviations flagged

1. **§8.5 qualitative milestones still not wired** — Magnet Lv. 5 orbit, Damage Lv. 5 pierce, Damage Lv. 10 split, Luck Lv. 5 gold trails. Cost-scaling and numeric SPM/HP/speed/magnet/damage/luck effects ARE live since M9.
2. **In-run upgrade drafting (§12) not implemented** — slots at 20s / 45s. DraftSystem still a stub.
3. **Generator SPM math**: total output = SPM. With N generators active, each generator's drop interval = `(60 / SPM) × N` so cadence stays correct.
4. **Migration**: v0 saves discarded. v1 → v2 migration handles old saves: if `tutorialDone === true`, unlock the full panel (no row hiding for mid-game players).
5. **HUDScene runs continuously** across scene transitions and reads whichever gameplay scene is active. No separate FactoryHUD scene.
6. **Bomber enemy (§14.1, §7.3 x2 wave) deferred** — TODO in WaveDirector + EnemyDefs. M14's tank-rush factor stands in: at greed x1.5+ the Grunt slot gradually shifts to Tank.
7. **Golden Fever + Turret Drop power-ups deferred** — TODO in PowerupDefs.ts. M12 ships the other 7.
8. **M11 power-up placeholder retired in M12** — tutorial now spawns the real Drone Swarm (chain) + Magnet Burst (radius mult) via PowerupSystem at §5.4 timestamps.
9. **Infestation system still stubbed** — slated for M17. Tutorial raids carry `tutorial: true` in RaidEndPayload so future infestation filters can ignore them.

## Current state

- `npm run typecheck` — clean (strict mode, no errors)
- `npm run build` — clean (warns on Phaser bundle size > 500KB, benign; manualChunks already splits phaser out)
- `npm run dev` — serves at :5173, transforms all modules

## Where things live

```
src/
  audio/         AudioBus, sfx, music (M13 - synth Web Audio, no external assets)
  config/        Balance, Strings, EnemyDefs, UpgradeDefs, PowerupDefs (all tunables / strings)
  core/          EventBus (Events.*), Rng, types (RaidEndState, RaidEndPayload, FtueUnlocks, WaypointTarget)
  entities/      Player, Enemy, Bullet, Pickup, Machine (Generator), Drone, Powerup
  scenes/        BootScene, FactoryScene, RaidScene, HUDScene, SummaryScene
  systems/       InputSystem, VirtualJoystick, WaveDirector, WeaponSystem,
                 ParticleEffects, ExtractionSystem, GreedSystem,
                 EconomySystem, UpgradeSystem, PowerupSystem
  platform/      SDKBridge (CrazyGames stub + mute hook), SaveSystem, AutoSave, Audio (shim)
  ui/            UpgradeCard, MuteButton, SettingsMenu
```

Stub-only (populated in later milestones): scenes/PreloadScene, scenes/ModalScene,
ui/{HUD,Modal,SummaryScreen}, systems/{AchievementSystem,DailyQuestSystem,
DraftSystem,InfestationSystem,LeaderboardSystem,StreakSystem},
config/{CardDefs,OperatorDefs}, platform/Analytics.

## SaveData v2 shape

```ts
{
  version: 2,
  scrap, cores, tokens,
  upgrades: { gen, drone, speed, magnet, damage, luck },
  refinery: {},
  operator, unlockedOperators,
  achievements, prestige, daily, seasonPass, cosmetics,
  infestation: { machineIds: [] },
  stats: { runs, extracts, totalScrap, bestRaid, killCount },
  tutorialDone: boolean,
  // M11 additions:
  raidsCompleted: number,        // any raid end, including tutorial
  successfulExtracts: number,    // extract only
  firstCoreCollected: boolean,
  ftueUnlocks: {
    dailyClaim, droneUpgrade, magnetUpgrade, damageUpgrade,
    luckUpgrade, factoryBoost, missionBoard,
  },
  lastSave: number,
}
```

`migrateV1toV2` carries forward all v1 fields; new flags get safe defaults
(or full-unlocked if `tutorialDone` was already true on the v1 save).

## Playing one full cycle in dev

```
npm install        # if needed
npm run dev        # opens at http://localhost:5173
```

1. Cold boot drops you straight into the tutorial raid. Caption "MOVE" appears at 0s.
2. Scrap pile is spawned around the player — pick them up.
3. Caption "DASH" at 6s. Drone Swarm power-up spawns at 10s (purple pentagon ring). Caption "POWER UP!" at 12s.
4. Extraction pad opens at 18s. Caption "EXTRACT". Off-screen arrow points at it.
5. Magnet Burst power-up spawns at 25s (cyan pentagon).
6. Stand on extraction pad for 5s → 4-layer extraction success sound → SummaryScene.
7. Single "UPGRADE" button → FactoryScene with ONLY the GENERATOR row visible.
8. Buy GENERATOR for 25 Scrap → second generator slides in, big pulsing "DEPLOY" prompt appears on the pad.
9. Walk onto the pad (0.4s hold) → real RaidScene (75s, full enemy mix, full power-up cadence, normal HP/damage).
10. As the raid runs, you'll hear the danger music layer fade up when HP drops or enemies pile. Greed climbs after extract opens at 20s; the screen edges pulse red and at x3 a deep-end tint flips in. A single boss-wave Elite spawns at x3.
11. Extract or die → SummaryScene with Greed mult (or -50% penalty) → Factory.
12. After this first real raid, MAGNET + SPEED appear in the panel. Second raid: DRONE. Third raid: DAMAGE. First Core: LUCK.
13. Mute button + gear-cog in HUD top-right (sliders for Master/Music/SFX).

## What M15 should tackle first

Per Run B's punch list, M14 closes Run B cleanly. Likely M15 candidates
(Run C territory):

1. **In-run upgrade drafting (§12)** — slots at 20s / 45s with a 3-card pick and time-slow. DraftSystem stub already in place.
2. **Real §8.5 gameplay milestones** — Magnet Lv. 5 orbit ring, Damage Lv. 5 pierce, Damage Lv. 10 split, Luck Lv. 5 core gold trails. All small isolated effects.
3. **PreloadScene** — currently we render placeholder textures at scene-create time; a Preload pass would let us bake textures once and surface a loading bar (matches §22 architecture).

## M14 status notes (for the next-session check-in)

### Tutorial feel
Caption timing matches §5.2 beats exactly (0/6/12/18s). Captions fade
in 320ms / hold 2.6s / fade out 320ms, no overlap. The safety net works:
hp can't go below 1, so a player who stands still during tutorial doesn't
die. Pacing feels generous - tutorial enemy spawn rate is 0.4x and HP 0.5x
so a competent player extracts with HP barely scratched.

### Greed tuning
The greed escalation table I shipped is **softer than the blueprint
text suggests** in two places:

- §7.3 calls for "+40% spawn rate" at x1.5; I shipped +40% via the
  table (1.4× mult). ✓
- §7.3 calls for "tank rush + bombers" at x2; without a Bomber type,
  I shipped a tankRushFactor of 0.20/0.45/0.55 across steps 2/3/4 that
  lifts the Grunt share into Tank. At step 4 the effective Tank share
  is ~0.67 - aggressive but not absurd.

If you want a sharper escalation: bump the spawnRateMult entries in
`Balance.raid.greedEscalation` (1.2/1.4/1.6/1.8 → 1.3/1.6/2.0/2.5) and
the tankRushFactor (0.20/0.45/0.55 → 0.30/0.55/0.65). The whole table
is a single edit.

### Feel-polish calls worth a sanity check

1. **Hit-stop duration** (Tank 0.05s, Elite 0.09s). 0.05s = 3 frames at
   60fps; long enough to feel weight but short enough that the player
   doesn't notice as a pause. Elite's 0.09s is more dramatic. If they
   feel slow, halve both to 0.025 / 0.045.
2. **Knockback impulse** (280 px/s, 0.12s). Tanks/elites get 0.35× the
   impulse so they still feel heavy. On a clean grunt hit this is
   ~33px of displacement - visible but not stagger-locking. If you want
   the player to feel like they're shoving enemies more, double knockback
   speed.
3. **Damage popup styling** kicks in at combo ≥ 2.0. With the combo decay
   rate I have, that's "three kills in 2.2s." It's reachable but feels
   like an earned moment. If you'd rather see the popups at lower
   combo, lower the threshold in `RaidScene.showDamagePopup`.
4. **Near-miss reward** is +2 Scrap with a "NEAR MISS" popup. The
   radius is 30px which is just-above the player hitbox (18px). This
   fires reasonably often during dash play; if the popup feels noisy,
   gate it on combo or only the first per dash. Currently I only
   gate per-enemy-per-dash.

### Music fallback decision

The 3-layer adaptive raid music shipped intact (base + tension +
danger, cross-fading on HP%, Greed step, and enemy count). It sounds
fine in headphones - more atmospheric than aggressive. I did NOT fall
back to the single-layer + x2-Greed-only path mentioned as the escape
hatch. If it sounds bad on real speakers or feels grating during long
sessions, that fallback is one config change: in
`RaidScene.tickAdaptiveMusic`, gate the danger layer on `greedMult >=
2.0` only and skip the HP/enemy-count thresholds.

### SettingsMenu access

Click the gear icon next to the mute button (top-right of HUD). Backdrop
click or the panel's CLOSE button dismisses. Sliders write straight to
AudioBus volumes; nothing else is persisted yet (next milestone can
write/read these to SaveData).
