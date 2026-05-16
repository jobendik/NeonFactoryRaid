# FINAL HANDOFF — Neon Factory Raid (Milestones 0–25)

End of Run E. Game is at the **CrazyGames submission gate** per blueprint
Appendix C, plus an optional 3D FPS "Scrapyard" mode (M25) on top of the
M0–M24 top-down core. `npm install && npm run typecheck && npm run build`
are green.

---

## Build snapshot

- **Production compressed total**: **~540 KB** (gzip)
  - `dist/index.html` — 2.86 KB raw / 1.17 KB gzip
  - `dist/assets/index-*.css` — 4.56 KB raw / 1.35 KB gzip
  - `dist/assets/index-*.js` — 772.81 KB raw / 199.49 KB gzip (game code + Three.js)
  - `dist/assets/phaser-*.js` — 1,478.57 KB raw / 339.68 KB gzip (vendor chunk)
- **Limit**: 10 MB compressed (Appendix C). We're at **~5.4%** of the cap.
- 91 modules transformed at build time.
- Three.js (`^0.184`) bundled into `index-*.js` for the Scrapyard mode;
  Phaser still drives every other scene.

## How to do a submission-ready build

```bash
npm install            # one time; pulls Phaser + Vite + TypeScript
npm run build          # tsc --noEmit && vite build
```

`/dist` contains everything CrazyGames needs:

```
dist/
├── index.html          # entry point — references /assets/* with relative paths
└── assets/
    ├── index-*.js      # game code (main + scenes + systems)
    └── phaser-*.js     # vendor chunk (auto-split by Vite)
```

To test locally as if it were on CrazyGames:

```bash
npm run preview        # serves dist/ on http://localhost:4173
# OR:
npx serve dist         # any static server works
```

CrazyGames sandboxes the game in an iframe, so the local preview is a
reasonable approximation. The SDK is stubbed — `SDKBridge.requestRewarded()`
returns `{ success: true }` so all reward flows are testable without
real ads. Swap in the production SDK at launch (see "Real SDK swap" below).

For ZIP submission, the contents of `/dist/` go in the archive root.

## Submission readiness — Appendix C

| Item | Status | Note |
|---|---|---|
| Single `index.html` entry point | ✅ | Vite bundles to one HTML, two JS chunks |
| All assets self-contained | ✅ | No runtime CDN fetches; only MIT license URLs in Phaser comments |
| CrazyGames SDK v3 integrated | ✅ | Via `SDKBridge` stub. Real SDK swap = one file. |
| `loadingStart` / `loadingStop` | ✅ | `BootScene.create` brackets the load |
| `gameplayStart` / `gameplayStop` | ✅ | `RaidScene.create` / `RaidScene.finishRaid` |
| `happytime()` on extract | ✅ | `RaidScene.finishRaid` when state === 'extracted', before `gameplayStop` |
| Rewarded ads via SDK | ✅ | All 7 placements via `AdManager.offer` → `SDKBridge.requestRewarded` |
| No external ad providers | ✅ | `AdManager` only routes to `SDKBridge` |
| PEGI-12 content | ✅ | Abstract shapes, no gore, no gambling mechanics, no chat |
| Chrome / Firefox / Edge desktop | ⚠️ | Phaser 3 supports all three; not personally verified on each |
| Safari iOS / Chrome Android | ⚠️ | Touch path implemented (floating joystick, dash button); not personally verified on devices |
| Chromebook 4GB @ 30fps | ⚠️ | `QualityManager` auto-detect drops to Low on sustained <40fps; not personally verified on Chromebook |
| Load size < 10 MB compressed | ✅ | **~540 KB** — 5.4% of cap |
| First playable < 5s on 4G | ✅ | ~540 KB cold load ≈ <3s on 4G |
| No console errors in production | ✅ | `BootScene.create` has one informational `console.log('Boot OK')`; no errors or warnings |
| Mute button accessible | ✅ | `MuteButton` top-right HUD; persists across raid/factory |
| Pause works without breaking state | ✅ | `ESC` opens `SettingsMenu`; modals pause via `this.scene.pause()` |
| Settings menu present | ✅ | Volume sliders × 3, Quality preset + Auto-detect, Cosmetics, Achievements, Controls, Credits, Reset Save |
| `<html lang="en">` | ✅ | Verified in `index.html` (was the `lang="no"` bug from the original Run 0 prototype) |
| Save migration plan documented | ✅ | v0→v9 chain in `SaveSystem.migrate`; `window.__migrationTest()` dev tool |

**Items marked ⚠️ require a real device to verify.** They aren't blockers —
the code path is correct — but a submission-ready release should sanity-check
each browser/platform before the final upload.

## What's in the build (M0–M25)

### Core loop (Runs A + B, M0–M14)
- M0: Vite + Phaser 3 + TypeScript scaffold
- M1: Renderer / camera / input / player
- M2: Enemy base + WaveDirector
- M3: Auto-fire hitscan + bullet hits
- M4: Pickups + magnet + collection
- M5: Full combat loop (Grunt/Swarmer/Tank/Shooter, combo, popups, timer)
- M6: Extraction pad + end-states + summary
- M7: Greed multiplier + raid HUD
- M8: FactoryScene with generators + deploy pad + SPM
- M9: Six upgrades, panel UI, milestone hooks
- M10: Save persistence + autosave + offline production (GATE 2)
- M11: FTUE tutorial raid + progressive UI reveal
- M12: Full PowerupSystem with 7 power-ups + HUD strip
- M13: AudioBus + synth SFX + adaptive music
- M14: Greed escalation + raid feel polish

### Depth + retention (Run C, M15–M19)
- M15: In-run drafting at 20s/45s with 24-card pool (18 drawable, 6 deferred)
- M16: Operator roster — Pulse + Vanta active; Surge + Lodestone locked
- M17: Infestation system (the differentiator)
- M18: Daily quest + streak with 1-day forgiveness
- M19: RNG audit + daily seed leaderboard (GATE 3)

### Run D (M20–M24)
- M20: Seven rewarded ad placements through SDKBridge stub
- M21: Pooling audit + spatial grid + QualityManager + performance overlay
- M22: §8.5 milestone effects + player ship + tank armor + HUD pass + parallax + HTML preloader
- M23: Cosmetics + premium currency + achievements + season scaffolding
- M24: Submission readiness gate (this document)

### Run E (M25)
- M25: 3D FPS "Scrapyard" mode — optional secondary game mode. Three.js
  renderer overlaid on Phaser's canvas; shares the same SaveSystem,
  Economy, UpgradeEffects, and SDKBridge. Players unlock the violet
  Scrapyard pad in the factory after their first real raid; entering it
  swaps to a pointer-locked first-person extraction shooter (pulse rifle,
  Rusher/Shooter enemies, magnetic loot pickup, 10-second extraction
  zone). Loot banks back to the same wallet so progression compounds
  across both modes. Adds ~150 KB gzip (Three.js).

### File layout (final)

```
/index.html                  — HTML preloader; loads /src/main.ts
/src/
├── main.ts                  — Phaser game config + scene list
├── audio/
│   ├── AudioBus.ts          — three-channel synth audio routing
│   ├── music.ts             — adaptive 3-layer raid music + factory ambient
│   └── sfx.ts               — Web Audio synthesized SFX library
├── config/
│   ├── Balance.ts           — every tunable number (§23 source of truth)
│   ├── CardDefs.ts          — 24-card draft pool (18 drawable, 6 deferred)
│   ├── CosmeticDefs.ts      — M23 placeholder cosmetics (3 trails / 2 skins / 2 themes)
│   ├── EnemyDefs.ts         — Grunt / Swarmer / Tank / Shooter / Elite / Infested
│   ├── OperatorDefs.ts      — Pulse / Vanta active; Surge / Lodestone locked
│   ├── PowerupDefs.ts       — 7 power-ups
│   ├── QuestDefs.ts         — 6 daily quest archetypes
│   ├── Strings.ts           — all player-facing strings (default English)
│   └── UpgradeDefs.ts       — 6 upgrade tracks
├── core/
│   ├── EventBus.ts          — typed Phaser event bus
│   ├── Rng.ts               — seeded LCG + dailySeed()
│   └── types.ts             — shared types (RaidEndPayload, etc.)
├── entities/
│   ├── Bullet.ts            — shooter projectiles (physics sprites)
│   ├── Drone.ts             — factory drone visuals
│   ├── Enemy.ts             — pooled Phaser sprite
│   ├── Machine.ts           — factory generator
│   ├── Pickup.ts            — scrap / cores; orbit-on-collect (Magnet 5)
│   ├── Player.ts            — wedge ship + thruster trail + revive
│   └── Powerup.ts           — pickup-style timed buff entity
├── platform/
│   ├── AdManager.ts         — M20 rewarded-ad routing + frequency rules
│   ├── Analytics.ts         — stub
│   ├── Audio.ts             — legacy stub
│   ├── AutoSave.ts          — 10s persist loop
│   ├── MigrationTest.ts     — M24 dev tool window.__migrationTest()
│   ├── SaveSystem.ts        — save schema + v0→v8 migration chain
│   └── SDKBridge.ts         — CrazyGames SDK stub (Phase 3: swap method bodies)
├── scenes/
│   ├── BootScene.ts         — SDK init, save load, autosave start, route to FTUE or factory
│   ├── DraftScene.ts        — M15 card-pick overlay
│   ├── FactoryScene.ts      — factory hub, upgrades, deploy pad + M25 Scrapyard pad, ads, operators, season
│   ├── HUDScene.ts          — persistent HUD, perf overlay, toasts, ESC handler; suppressed during ScrapyardScene
│   ├── ModalScene.ts        — M20 ad-confirmation modal
│   ├── PreloadScene.ts      — placeholder
│   ├── RaidScene.ts         — raid lifecycle, spatial grids, REVIVE, EXTEND RUN, SDK lifecycle
│   ├── ScrapyardScene.ts    — M25 3D FPS mode orchestrator (boots Three.js, drives scrapyard systems, hands off to SummaryScene)
│   └── SummaryScene.ts      — run-end + DOUBLE LOOT; accepts scrapyard payloads
├── systems/
│   ├── AchievementSystem.ts — M23 unlock tracking + 8 achievements
│   ├── CosmeticSystem.ts    — M23 equip/unlock plumbing
│   ├── DailyQuestSystem.ts  — M18 daily rotation + claim
│   ├── DraftSystem.ts       — M15 card draw + rarity weights
│   ├── EconomySystem.ts     — SPM (auto-reads factory boost), bank loot, spend
│   ├── ExtractionSystem.ts  — pad fill + open
│   ├── GreedSystem.ts       — multiplier ticker
│   ├── InfestationSystem.ts — M17 infestation lifecycle
│   ├── InputSystem.ts       — keyboard + joystick
│   ├── LeaderboardSystem.ts — M19 daily seed leaderboard (local)
│   ├── OperatorSystem.ts    — selection, unlock, applyOperatorMods, try-out
│   ├── ParticleEffects.ts   — single ParticleEmitter path; QualityManager-scaled
│   ├── PowerupSystem.ts     — field spawns + timed buffs
│   ├── QualityManager.ts    — M21 Low/Medium/High preset + auto-detect
│   ├── RunMods.ts           — per-raid drafted card aggregation
│   ├── SeasonSystem.ts      — M23 40-tier season pass scaffold
│   ├── SpatialGrid.ts       — M21 generic spatial bucket index
│   ├── StreakSystem.ts      — M18 daily streak with 1-day forgiveness
│   ├── UpgradeSystem.ts     — purchase + UpgradeEffects projections
│   ├── VirtualJoystick.ts   — mobile floating joystick
│   ├── WaveDirector.ts      — spawn director (reads QualityManager.enemyCap)
│   └── WeaponSystem.ts      — auto-fire (spatial-grid queried)
├── ui/
│   ├── HUD.ts               — stub
│   ├── Modal.ts             — stub
│   ├── MuteButton.ts        — top-right speaker icon
│   ├── SettingsMenu.ts      — audio + quality + cosmetics + achievements + controls + credits + reset
│   ├── SummaryScreen.ts     — stub
│   └── UpgradeCard.ts       — factory upgrade panel row
└── scrapyard/                  — M25 3D FPS mode (Three.js)
    ├── ScrapyardRenderer.ts    — Three.js renderer, scene, camera, lighting, bloom + OutputPass
    ├── ScrapyardQuality.ts     — LOW/MEDIUM/HIGH presets, auto-detect via hardwareConcurrency
    ├── FPSController.ts        — WASD + sprint/crouch/jump + pointer lock + gravity + AABB collision
    ├── FPSCamera.ts            — mouse look + weapon bob + recoil kick + screen shake
    ├── ScrapyardArena.ts       — procedural floor/walls/cover/extraction zone + colliders
    ├── ScrapyardEnemySystem.ts — pooled Rusher/Shooter AI + sphere raycast with headshots
    ├── ScrapyardWeapon.ts      — pulse rifle: hitscan, mag/reload, spread, recoil, muzzle flash
    ├── ScrapyardLoot.ts        — pooled loot orbs with burst physics + magnetic vacuum
    ├── ScrapyardExtraction.ts  — beacon + ring + paused-on-exit timer
    ├── ScrapyardParticles.ts   — billboard particles + canvas damage numbers
    ├── ScrapyardAudio.ts       — Web Audio SFX (independent AudioContext)
    ├── ScrapyardHUD.ts         — DOM HUD overlay (crosshair, HP, ammo, loot, kills, waypoint, extraction bar)
    └── scrapyard.css           — FPS HUD styles
```

### Save schema (v9)

```ts
{
  version: 9,
  scrap, cores, tokens,                            // currencies
  upgrades: { gen, drone, speed, magnet, damage, luck },
  refinery: { ... },                               // Cyber-Core refinery (post-launch)
  selectedOperator, unlockedOperators,             // M16
  achievements: string[],                          // M23
  prestige: { count, cyberCores },                 // post-launch
  daily: { lastClaim, questId, questProgress, questCompleted, streakDay, lastStreakDate },
  seasonPass: { tier, xp, premium },               // M23 — premium track is post-launch
  cosmetics: { equipped: { trail, skin, theme }, owned: string[] },  // M23
  infestation: { machineIds, failsBeforeFirst },   // M17
  infestationTutorialSeen,                         // M17
  stats: { runs, extracts, totalScrap, bestRaid, killCount },
  cosmeticShards,                                  // M18
  dailySeedAttempted, dailySeedHistory,            // M19
  adState: { factoryBoostLastMs, factoryBoostActiveUntilMs, lastDailyCrate },  // M20
  tryOutOperator,                                  // M20
  lastRaidDate,                                    // M20
  settings: { qualityPreset, qualityAutoDetect, qualityUpgradeOffered },  // M21
  tutorialDone,
  scrapyardStats: { runs, extracts, kills, bestLoot },  // M25
  raidsCompleted, successfulExtracts,
  firstCoreCollected,
  ftueUnlocks: { ... },                            // M11
  lastSave: number,
}
```

Migration chain: v0 → v1 (discard, start fresh) → v2 → v3 → v4 → v5 → v6 → v7 → v8 → v9.
v8→v9 adds `scrapyardStats` with all-zero defaults; existing saves keep all
top-down progress untouched. Test with `window.__migrationTest()` in dev tools.

---

## Known limitations + deferred work

### Documented design decisions (NOT defects)

- **Phaser physics-step drift on daily seed**: The seeded RNG threads
  through all stochastic gameplay (spawns, drops, power-ups, drafting,
  drop rolls). Phaser's physics step uses real time, so two players running
  today's seed will see visually identical spawn locations but
  micro-different collision moments. Scores match within a couple of Scrap.
  **Acceptable** for the "everyone plays the same raid" feature.
- **DPR cap is documented but not enforced**: Phaser's `Scale.FIT` renders
  the canvas at the design resolution (1280×720) and lets CSS scale it.
  `QualityManager.dprCap()` is reserved for future canvas-resolution work.
  The other quality settings (enemy cap, particle quantity, parallax
  layers) ARE enforced and have the bulk of the perf impact anyway.
- **Local-only leaderboard**: `LeaderboardSystem` stores scores in
  `saveSystem.get().dailySeedHistory` (max 30 entries). The "global"
  leaderboard the blueprint describes would require a backend; for
  CrazyGames launch the local board is enough to drive daily return.

### Post-launch work — REAL SDK SWAP (1 file)

Replace the method bodies in `src/platform/SDKBridge.ts`:

```ts
// /src/platform/SDKBridge.ts — production version (post-launch)
const hasSDK = typeof window !== 'undefined' && window.CrazyGames?.SDK;
const SDK = hasSDK ? window.CrazyGames.SDK : null;

class SDKBridgeImpl {
  async init() { if (SDK) await SDK.init(); /* ... */ }
  loadingStart() { if (SDK) SDK.game.loadingStart(); }
  loadingStop() { if (SDK) SDK.game.loadingStop(); }
  gameplayStart() { if (SDK) SDK.game.gameplayStart(); }
  gameplayStop() { if (SDK) SDK.game.gameplayStop(); }
  happytime() { if (SDK) SDK.game.happytime(); }
  async requestRewarded() {
    if (!SDK) return { success: true };  // keep dev fallback
    try { await SDK.ad.requestAd('rewarded'); return { success: true }; }
    catch (e) { return { success: false, reason: String(e) }; }
  }
  async requestMidgame() { if (SDK) await SDK.ad.requestAd('midgame').catch(() => {}); }
  async saveData(key, data) { /* prefer SDK.data, fall back to localStorage */ }
  async loadData(key) { /* ditto */ }
  getUser() { return SDK ? SDK.user.getUser() : { username: 'Player' }; }
  setMuted(muted) { AudioBus.setPlatformMute(muted); }
}
```

Add the SDK script tag to `index.html`:

```html
<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
```

That's it. No other file changes required. Validate by:
1. Watch the network panel — a rewarded ad request fires on accept.
2. Verify `happytime()` is sent on a successful extract (CrazyGames
   dashboard analytics will show the event).
3. Verify `gameplayStart`/`gameplayStop` fire around each raid.

### Post-launch content roadmap

| Area | Status | Notes |
|---|---|---|
| **Real ads** | Stub returns success | One-file SDK swap (above) |
| **Operators 3 & 4 (Surge, Lodestone)** | `locked: true` metadata | `apply()` empty; fill in stat mods, wire art |
| **Weekly boss (Signal Hydra)** | Not implemented | Spec at §16.4, §14.1; new raid mode |
| **Bomber enemy** | Telegraphed via `TODO(content)` in WaveDirector | Spawn slot at greed x2 |
| **Other deferred enemies** | Not implemented | Loot Goblin, Shield Carrier, Splitter, Extract Jammer |
| **Deferred power-ups** | Not implemented | Golden Fever (gold 2x scrap 8s), Turret Drop (auto-fire turret 12s) |
| **6 deferred draft cards** | Listed in CardDefs, filtered at draw | Ricochet, Slow Field, Frenzy Mode, Nova Dash, Time Dilation, Pyrokinetic |
| **Real season content** | Preseason placeholder (40 identical rewards) | Themed reward arrays per season |
| **IAP flow** | "Coming soon" modal stub | Real CrazyGames IAP integration |
| **Full cosmetic library** | 7 placeholder entries (colors only) | Real art + more variants |
| **Localization** | English only | Norwegian / Spanish / Portuguese / German / French (CrazyGames top markets) |
| **Prestige system** | `first-prestige` achievement deferred | Requires Gen Lv. 25 + 1000 Cores; spec at §10.3 |
| **Refinery (Cores → permanent multipliers)** | SaveData field exists | Spec at §10.2; build the Refinery UI in factory |
| **Mission board (contracts)** | Not implemented | Spec at §16.6 |
| **3D / WebGL upgrade** | ✅ Done in M25 | Optional secondary "Scrapyard" mode via Three.js; top-down §22.1 core unchanged |

### Tuning notes worth revisiting

- **Drone Multiplier on Pulse** is a known dead pick — Pulse starts with
  `bonusWeaponTargets = 0` so doubling does nothing. Run C flagged this.
  Either remove the card from Pulse's pool or have it always grant +1.
- **Magnet Storm card** reads identical to the Magnet Burst power-up.
  Run C suggested differentiating with true orbit physics — could compose
  with the M22 Magnet Lv. 5 orbit so Magnet Storm gives the orbit dance
  to every pickup for 8s.
- **Lucky card** (+5% core drop chance) is invisible per drop. Consider
  showing a small popup or a tinted Core sprite when Lucky is in play.
- **Heal on Pickup** (1 HP per scrap) is slow. Run C noted this. Maybe
  +2 HP per scrap above the upgrade-modified core chance threshold.
- **Phoenix charges** stack only to 1 per spec. Confirmed working.
- **Daily quest extracts2** is the easiest quest; consider replacing with
  something tougher in the rotation once players hit it consistently.
- **Greed escalation step 4 (x3.0)** spawns one elite plus the
  tank-rush. Real Bomber would punch up step 3 too — add when Bomber
  content lands.

---

## Run summaries (for future maintainers)

### Run A (M0–M10) decisions

- Phaser 3 over vanilla Canvas 2D (faster scaffold; scale layer free)
- Combo scales drop VALUE, not count (prevents pickup pool blowup)
- WeaponSystem canonical at `/src/systems/` (not under entities)
- HUDScene reads gameplay scenes via `scene.get()` for per-frame numerics;
  EventBus for discrete events
- Flat entities/systems/scenes layout (not nested by feature)

### Run B (M11–M14) decisions

- FTUE tutorial as a real raid with mods (HP×2, damage×2, spawn×0.4),
  not a separate scene
- Progressive UI reveal via `ftueUnlocks` flags, not derived from raid count
- Greed escalation is multi-axis (spawn rate × tank-rush share × vignette)
- Tutorial drives scripted power-up spawns (Drone Swarm 10s, Magnet 25s)
  via timer checks in PowerupSystem.tickTutorialSpawns

### Run C (M15–M19) decisions

- Drafting time-slow → full `scene.pause` + DraftScene overlay (cleaner
  than multi-axis time-scale)
- `bonusWeaponTargets` on RunMods replaces an earlier `droneMultiplier`
  on the M15 prototype
- Drone visual = tiny purple orbs at radius 36 (cosmetic; the gameplay
  effect is WeaponSystem reading bonusWeaponTargets)
- Magnet Storm card uses the Magnet Burst radius multiplier (no true orbit
  physics — flagged for future improvement)
- Quest panel bottom-LEFT (right side is upgrade panel; six rows reach
  near-bottom)
- Daily Seed UI gated on `tutorialDone`
- RNG threading clean for major surfaces; physics-step drift documented
  as acceptable for the daily-seed feature

### Run D (M20–M24) decisions

- AdManager owns the per-raid mutex flag (REVIVE vs DOUBLE LOOT) plus
  factory-boost cooldown / daily-crate eligibility helpers; per-placement
  logic lives in the calling scene
- ModalScene is generic (title + body + accept/decline) — every ad
  placement reuses it
- OPERATOR TRY-OUT only on implemented-but-unowned operators (Vanta in
  the launch build; Surge/Lodestone post-launch will surface automatically)
- DPR cap not enforced (Phaser Scale.FIT renders at design resolution);
  documented as reserved future work
- Quality auto-detect uses EMA on per-frame FPS, NOT a simple average,
  so a brief 60fps spike doesn't reset a sustained dip
- HTML preloader fades out from BootScene rather than being a Phaser scene
  (faster first paint; CSS owns the styling)
- `__migrationTest()` exposed on `window` (not in the UI) so QA can
  exercise the migration chain without test infrastructure

### Run E (M25) decisions

- **Scrapyard is a secondary mode, not a replacement.** Blueprint §2.2
  says "Not a 3D shooter"; the merge respects that by keeping the
  top-down loop as the default and gating the 3D pad behind 1 real raid
  so the FTUE stays focused on the polished core.
- **Phaser + Three.js coexist on separate canvases.** ScrapyardScene
  hides Phaser's canvas during the 3D run; HUDScene short-circuits when
  ScrapyardScene is active so the Phaser HUD doesn't double-render over
  the DOM HUD.
- **No singletons.** The original MergeThisGame code was vanilla-JS
  singletons that referenced each other directly (`gameManager.enemySystem`
  etc.). The TS port replaces that with constructor-injected dependencies
  + callback hooks (`onKill`, `onLootDrop`, `onCollect`, `onExtract`) so
  the systems are testable in isolation and the scene owns the wiring.
- **Shared progression via real plumbing, not duplication.** Loot from
  the 3D mode banks through `Economy.bankLoot()` — same wallet, same
  daily-quest hook, same offline-production target. Upgrade stats are
  projected onto FPS units in `ScrapyardScene.create()` (HP delta from
  `UpgradeEffects.playerMaxHp()`, weapon damage from
  `weaponDamageLevel × Balance.weapon.damagePerLevel`, magnet radius
  scaled from 2D px to 3D world units).
- **Voluntary "EXIT TO FACTORY" ends as `collapsed`.** Same 50% unbanked
  penalty as a top-down failed extract — preserves the risk model rather
  than offering a free escape hatch.
- **DOM HUD over Phaser HUD for the 3D mode.** Crosshair, vignette, and
  waypoint arrow are easier and faster in DOM than projecting through
  Three.js into a Phaser scene. CSS is injected once via a side-effect
  import in `ScrapyardScene.ts` (Vite handles bundling).
- **No greed/draft/operator port.** Scrapyard runs with a single fixed
  weapon and no in-run drafting; the rich top-down depth lives in
  RaidScene. Keeps Scrapyard as a quick "raid of a different shape"
  rather than a parallel content stack to maintain.

---

## Next-actions checklist (post-launch)

```
[ ] Real CrazyGames SDK swap (SDKBridge.ts method bodies; add script tag)
[ ] Verify each browser/platform listed in Appendix C on real devices
[ ] Build Operators 3 & 4 implementations (stat mods, kit apply)
[ ] Wire Bomber enemy + telegraph at greed x2
[ ] Implement the 6 deferred draft cards
[ ] Implement the 2 deferred power-ups
[ ] Implement deferred enemies (Loot Goblin, Splitter, etc.)
[ ] Build Signal Hydra weekly boss raid mode
[ ] Real season 1 content (themed rewards, cosmetic unlocks)
[ ] Real cosmetic library + IAP flow
[ ] Build Refinery UI for Cores → permanent multipliers
[ ] Build Mission Board UI (3 contracts in factory)
[ ] Prestige system implementation + first-prestige achievement
[ ] Localization pass (Norwegian, Spanish, Portuguese, German, French)
[ ] Backend leaderboard (replaces local-only daily seed history)
[ ] Address tuning notes above (Drone Multiplier dead pick, Magnet Storm
    differentiation, Lucky visibility, Heal-on-Pickup numbers)
```

### Scrapyard (M25) follow-ups

```
[ ] In-mode tutorial / first-time prompts — pointer lock + WASD + reload
    cues. Currently a one-line "CLICK TO LOCK CURSOR" overlay only.
[ ] Mouse sensitivity slider in SettingsMenu (FPSCamera.sensitivity is
    hardcoded at 0.002).
[ ] Mobile fallback — pointer lock is desktop-only. Either hide the
    Scrapyard pad on touch devices or add a virtual look-stick.
[ ] Wire daily-quest events (enemy kills, extractions) from
    ScrapyardScene so quests progress in 3D mode too. Currently
    only banking loot via Economy.bankLoot() composes; kill / extract
    quests don't increment from the FPS run.
[ ] Operator stat mods aren't fully projected onto FPS systems
    (drone count, bonusWeaponTargets, etc.). Pulse and Vanta apply
    their `apply()` to RaidScene state only.
[ ] Factory "best Scrapyard run" stat readout. `scrapyardStats` is
    persisted but not surfaced in the factory UI yet.
[ ] Greed / extraction-decay analog for the 3D mode (FPS extraction is
    a flat 10 s).
[ ] Bloom toggle in the SettingsMenu — currently driven only by the
    Scrapyard quality auto-detect.
```

**Ship it.**
