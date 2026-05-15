# HANDOFF — Milestones 1–20 (Run D started; M20 done)

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
| M20 | All 7 rewarded ad placements wired through SDKBridge stub |

## Current state

- `npm install && npm run typecheck && npm run build` — all green.
- SaveData at v7. Migrations v0→v1 (discard) → v2 → v3 → v4 → v5 → v6 → v7.
- M20 ships 7 rewarded ad placements; SDKBridge stub still returns
  `{ success: true }` so reward flows are testable in dev. Real SDK swap
  is a single-file change at launch.

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

1. **§8.5 milestone visuals** still pending (M22 target).
2. **6 deferred drafting cards** in CardDefs.ts: Ricochet, Slow Field,
   Frenzy Mode, Nova Dash, Time Dilation, Pyrokinetic.
3. **Deferred power-ups**: Golden Fever, Turret Drop.
4. **Deferred enemies**: Bomber, Loot Goblin, Shield Carrier, Splitter,
   Extract Jammer, Signal Hydra.
5. **Operators 3 & 4** (Surge, Lodestone): metadata-only, locked.
6. **Real CrazyGames SDK**: SDKBridge stub stays (post-launch swap).

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

## SaveData v7 (additions over v2)

```ts
{
  version: 7,
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
  adState: {                                     // M20
    factoryBoostLastMs, factoryBoostActiveUntilMs,
    lastDailyCrate,
  },
  tryOutOperator,                                // M20 — one-raid override
  lastRaidDate,                                  // M20 — daily-crate gating
}
```

## M20 — seven rewarded ad placements (blueprint §17.2)

All seven route through `SDKBridge.requestRewarded()` via `AdManager.offer()`,
which launches `ModalScene` for the player's accept/decline. Stub returns
`{ success: true }` so reward flows are exercised end-to-end in dev.

| # | Placement | Trigger | Reward | File |
|---:|---|---|---|---|
| 1 | **REVIVE** | `PLAYER_DIED` after `raidsCompleted >= 3`, 75% probability per death (not tutorial) | HP → 60%, 2.2s invuln, resume run | `RaidScene.handlePlayerDied` |
| 2 | **DOUBLE LOOT** | Successful extraction summary (suppressed if REVIVE was shown) | Doubles run loot, composes with greed | `SummaryScene.handleDoubleLoot` |
| 3 | **EXTEND RUN** | Timer hits 0 in active raid, single use per run (not tutorial) | +30s on raid timer | `RaidScene.handleTimerExpired` |
| 4 | **FACTORY BOOST** | Factory hub, gated `ftueUnlocks.factoryBoost` (5+ raids), 10 min real-time cooldown | 2x SPM for 2 minutes; auto-read by `Economy.computeSpm` | `FactoryScene.handleFactoryBoost` |
| 5 | **CLEAR INFESTATION** | Factory hub when any machines infested | `InfestationSystem.clearAllInfestation()` | `FactoryScene.handleClearInfestation` |
| 6 | **DAILY CRATE** | Factory hub when `lastRaidDate == today && lastDailyCrate != today` | 60% Scrap 100–500, 40% 1 Core | `FactoryScene.handleDailyCrate` |
| 7 | **OPERATOR TRY-OUT** | Operator picker on implemented-but-unowned operator tiles (Vanta today; Surge/Lodestone post-launch) | `selectedOperator` becomes target for one raid; cleared at raid end | `FactoryScene.handleOperatorTryOut` |

### §17.3 frequency rules (enforced)

- Never during active raid gameplay — REVIVE & EXTEND RUN pause the raid
  scene via `this.scene.pause()` before showing the modal.
- Never in tutorial raid — REVIVE bails to immediate fail; EXTEND RUN
  bails to immediate collapse.
- Max 1 rewarded ad prompt per raid (REVIVE OR DOUBLE LOOT, not both) —
  `AdManager.canOfferRaidPrompt()` flag, set on REVIVE, read by
  SummaryScene via `payload.allowDoubleLoot`.
- REVIVE 75% probability gate — `Math.random() < Balance.ads.reviveProbability`.
- FACTORY BOOST 10-minute real-time cooldown — `adState.factoryBoostLastMs`
  in SaveData; auto-displayed as `MM:SS` countdown in the panel.

### §18.3 SDK lifecycle (verified wired)

- `loadingStart()` — BootScene.create (was M0).
- `loadingStop()` — BootScene.create (was M0).
- `gameplayStart()` — RaidScene.create on every raid (including tutorial).
- `gameplayStop()` — RaidScene.finishRaid on any end state.
- `happytime()` — RaidScene.finishRaid on `state === 'extracted'` (before
  gameplayStop).
- `requestRewarded()` — `AdManager.offer` on every accepted modal.
- `requestMidgame()` — not yet placed (deferred; blueprint §17.6 allows
  every 3rd raid return-to-factory; can be added without surface change).

### Files touched in M20

- `src/platform/SaveSystem.ts` — v6 → v7 migration, new save fields.
- `src/platform/AdManager.ts` — NEW. Per-raid mutex, modal launcher,
  FactoryBoost cooldown / DailyCrate eligibility helpers.
- `src/scenes/ModalScene.ts` — NEW (was stub). Reusable ad-confirmation modal.
- `src/main.ts` — register ModalScene.
- `src/config/Balance.ts` — `ads` section (cooldowns, probabilities,
  reward rolls).
- `src/config/Strings.ts` — ad copy + replace `[M20]` placeholders.
- `src/scenes/RaidScene.ts` — REVIVE on death, EXTEND RUN on timer expiry,
  SDK lifecycle calls, tryOutOperator + lastRaidDate stamping on raid end.
- `src/scenes/SummaryScene.ts` — DOUBLE LOOT button, in-place wallet
  refresh on grant.
- `src/scenes/FactoryScene.ts` — left-edge ad panel (FACTORY BOOST, CLEAR
  INFESTATION, DAILY CRATE) and per-operator-tile TRY-OUT pill.
- `src/systems/EconomySystem.ts` — `computeSpm` auto-reads
  `adState.factoryBoostActiveUntilMs`.
- `src/systems/OperatorSystem.ts` — `getEffectiveForRaid` honors
  `tryOutOperator`.
- `src/entities/Player.ts` — `reviveToRatio(ratio, invulnSec)`.
- `src/core/types.ts` — `RaidEndPayload.allowDoubleLoot`.

## What M21 should tackle first

Run D continues with the performance pass per §24:

1. **Pooling audit** — verify killAndHide / setActive(false).setVisible(false)
   on every Phaser Group (enemies, bullets, pickups, power-ups, particles).
2. **Spatial grid** in WeaponSystem nearest-enemy queries (currently O(n) per
   fire). Same grid usable for pickup-magnet queries.
3. **QualityManager** in `/src/systems/` — three presets (Low/Medium/High),
   auto-detect with 5s rolling FPS average.
4. **Performance overlay** — backtick toggle, FPS / frame ms / entity counts.
5. **Quality settings** in SettingsMenu, wire to Balance.quality.
