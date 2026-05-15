# HANDOFF — Milestones 1–19 (Run C added M15–M19)

## What runs end-to-end

First boot → FTUE tutorial → SummaryScene → FactoryScene with progressive
reveal → buy GENERATOR → real raid (drafting at 20s/45s, operator passive
at start, infestation wave if any machines infested) → extract or fail →
Summary with infestation line if applicable → Factory with daily quest +
operator picker + DAILY SEED + TODAY'S BOARD. Save migrates v0–v6.

## Built across M1–M19

| M | Delivered |
|---|---|
| M0–M14 | (see prior HANDOFF for full table — Run A + B) |
| M15 | In-run drafting (24-card pool, 18 drawable + 6 deferred) |
| M16 | Operator roster — Pulse + Vanta (Surge/Lodestone metadata only) |
| M17 | Infestation system (the differentiator) |
| M18 | Daily quest + streak with 1-day forgiveness |
| M19 | RNG audit + daily seed leaderboard (GATE 3) |

## Current state

- `npm install && npm run typecheck && npm run build` — all green.
- SaveData at v6. Migrations v0→v1 (discard) → v2 → v3 → v4 → v5 → v6.

## Run C decisions

- **Drafting time-slow**: full `scene.pause` + DraftScene overlay
  instead of multi-axis time-scale. Cleaner, mirrors SummaryScene
  pattern, no physics-time bugs. Player is safe while choosing.
- **bonusWeaponTargets** on RunMods replaces M15-original
  `droneMultiplier`. Operator (Vanta) seeds +2; Drone Multiplier card
  multiplies. WeaponSystem folds into effective targets.
- **Drone visual**: tiny purple orbs orbit at radius 36 (cosmetic).
- **Magnet Storm card**: 8s of Magnet-Burst-strength radius (3x), not
  literal orbit physics. Reads identical to the field power-up — flag.
- **Quest panel**: bottom-LEFT (not "right side beneath upgrades" as
  the spec said — six upgrade rows reach near-bottom; right has no room).
- **Daily Seed UI**: gated on tutorialDone.

## Open TODOs (carried forward)

1. **§8.5 milestone visuals** still pending (deferred to Run D polish).
2. **6 deferred drafting cards** in CardDefs.ts: Ricochet, Slow Field,
   Frenzy Mode, Nova Dash, Time Dilation, Pyrokinetic.
3. **Deferred power-ups**: Golden Fever, Turret Drop.
4. **Deferred enemies**: Bomber, Loot Goblin, Shield Carrier, Splitter,
   Extract Jammer, Signal Hydra.
5. **Operators 3 & 4** (Surge, Lodestone): metadata-only, locked.
6. **[M20] stubs**: Clear Infestation ad, Double Loot ad.
7. **Real CrazyGames SDK**: SDKBridge stub stays.

## Status notes — answers to the four questions

### 1. How infestation feels

Visual stack on infested generators: red tint + red glitch border
overlay + horizontal jitter tween (±2 px / 110ms) + red smoke particle
emitter. Generator stops dropping scrap; SPM display drops accordingly
(Economy.computeSpm reads InfestationSystem ratio).

Communication chain:
1. **SummaryScene**: prominent red "FACTORY INFESTED — N machines
   disabled" line above loot card.
2. **FactoryScene first ever**: full modal with 3-sentence body +
   GOT IT button. One-time, gated by `infestationTutorialSeen`.
3. **Subsequent visits**: red toast top-of-screen.
4. **In raid**: HUD top-right "Cleansing: 12 / 30 — 1 machine" counter.

I cannot test in browser from this environment. Code path is correct
and visual layers are real, but feel verification needs hands on the
build.

### 2. Drafting cards — fun vs. weak

Strong by design:
- Sharper Shots, Burst Fire, Quick Feet, Hardy — clean stacking buffs.
- Pierce + Split Shot + Drone Multiplier (with Vanta) — explosive.
  Vanta + Drone Multiplier + Pierce = 6 simultaneous targets per shot.
- Greed Surge — multiplicative with greed step (x4.5 at greed x3).
- Phoenix — defensive panic button; unlocks reckless play.

Likely weak:
- Lucky — +5% core chance is invisible per drop.
- Heal on Pickup — 1 HP per scrap is a lot of pickups for one HP.
- Magnet Storm — reads identical to Magnet Burst power-up; could need
  stronger differentiator (true orbit physics is the obvious answer).
- Drone Multiplier on Pulse — null-op (per spec, but a known dead pick).

### 3. RNG audit findings

Threading was clean for the major surfaces — WaveDirector,
PowerupSystem, WeaponSystem, DraftSystem, Pickup.spawn,
Enemy.spawn (cached for shooter cooldowns), in-RaidScene rolls
(vampiric, core drop chance).

Edge cases:
- Audio noise (sfx.ts Math.random) intentionally left.
- Machine.ts factory-side scatter — FactoryScene only.
- DailyQuestSystem.ensureTodaysQuest uses Math.random fallback —
  not per-raid so daily-seed determinism doesn't matter.
- InfestationSystem.handleRaidEnd takes optional rng (passed by
  RaidScene); falls back to Math.random for safety.

Worth hardening in Run D: Phaser physics step uses real time, not the
seeded rng — two players running today's seed get visually identical
spawns but micro-different collision moments due to frame-rate drift.
Leaderboard scores should still match within a couple Scrap.

### 4. How to play one full session

```
npm install && npm run dev   # http://localhost:5173
```

1. Cold boot → FTUE tutorial. Move, dash, collect Drone Swarm (10s),
   Magnet Burst (25s), extract at 18s.
2. UPGRADE → Factory with only GENERATOR row.
3. Buy GENERATOR (25 Scrap) → second generator slides in, DEPLOY prompt.
4. Walk on deploy pad → real raid (75s).
5. **At 20s**: time pauses, three rarity-color-coded cards. Pick one.
6. **At 45s**: second draft window (more rare/epic).
7. Push to Greed x2 (yellow GREED badge).
8. Extract → SummaryScene with greed-multiplied loot.
9. Back to factory: quest panel appears bottom-left (raidsCompleted=2).
10. Note OPERATOR PICKER bottom-center (Pulse selected, Vanta locked
    at 50 Cores). Earn cores to unlock.
11. Deploy second raid. **Play badly — let timer run out.** Fails
    with no infestation (1/3 grace).
12. Deploy third raid. Fail. (2/3.)
13. Deploy fourth raid. Fail. **Infestation triggers.** Summary shows
    "FACTORY INFESTED — 1 machines disabled."
14. Back to factory. **Modal pops** explaining mechanic.
15. Red infested generator with smoke + jitter. SPM drops to ~50%.
16. Deploy fifth raid. Red infestation swarmers spawn ~1.6s starting
    at 5s. HUD: "Cleansing: X / 30 — 1 machine".
17. Kill 30 → counter ticks down. Extract. Generator restored.
18. Tap **DAILY SEED** purple button below deploy pad.
19. Extract → score recorded. Tap **TODAY'S BOARD** → leaderboard
    modal lists your entry with TODAY + YOU markers.

## Where things live

```
src/
  config/  Balance, Strings, EnemyDefs, UpgradeDefs, PowerupDefs,
           CardDefs (M15), OperatorDefs (M16), QuestDefs (M18)
  systems/ existing + RunMods (M15), DraftSystem (M15),
           OperatorSystem (M16), InfestationSystem (M17),
           DailyQuestSystem + StreakSystem (M18),
           LeaderboardSystem (M19)
  scenes/  existing + DraftScene (M15)
```

Stubs left: scenes/PreloadScene + ModalScene; systems/AchievementSystem;
ui/{HUD, Modal, SummaryScreen}; platform/Analytics.

## SaveData v6 (additions over v2)

```ts
{
  version: 6,
  selectedOperator, unlockedOperators,           // M16
  infestation: { machineIds, failsBeforeFirst }, // M17
  infestationTutorialSeen,                       // M17
  daily: {
    lastClaim, questId, questProgress, questCompleted,
    streakDay, lastStreakDate,                   // M18
  },
  cosmeticShards,                                // M18
  dailySeedAttempted,                            // M19
  dailySeedHistory: [{date, score}, ...],        // M19 (cap 30)
}
```

## What M20 should tackle first

Per Run D's billing (ads, polish, perf, submission):

1. **CrazyGames rewarded ads** per §17.2 (Revive, Double Loot, Extend
   Run, Factory Boost, Clear Infestation, Daily Crate, Operator
   Try-Out). SDKBridge already stubs the surface.
2. **PreloadScene** — bake textures once instead of at scene-create.
3. **§8.5 milestone visuals** land here.
4. **Performance pass**: entity caps under load, particle batching.
5. **Submission checklist** (Appendix C of blueprint).
