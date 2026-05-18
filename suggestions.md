# Neon Factory Raid — Optimization & Improvement Suggestions

> Audit of the M0–M25 build against `blueprint.md` and CrazyGames platform
> requirements. The game is **functionally feature-complete and well-architected**
> — but there are a handful of real launch-blockers, performance wins, and
> blueprint deltas worth closing before submission and in the first post-launch
> sprint.

**Verdict**: **Not yet optimal for submission.** One hard blocker (build asset
paths) plus the stubbed SDK make a real CrazyGames upload either crash or
silently fail to attribute revenue. With the P0 items below addressed, the
game is genuinely ready to ship.

---

## Executive summary

| Severity | Count | Category |
|---|---:|---|
| **P0 — Launch blocker** | 3 | Submission, monetization, attribution |
| **P1 — High value, low effort** | 6 | Performance, polish, retention |
| **P2 — Blueprint deltas** | 7 | Content / system gaps documented in handoff |
| **P3 — Post-launch polish** | 6 | Live-ops, optimization, quality of life |

---

## P0 — Launch blockers (fix before submission)

### P0-1. Vite `base` path will break asset loading on CrazyGames

[vite.config.ts:4](vite.config.ts#L4) sets `base: '/NeonFactoryRaid/'`.
The current `dist/index.html` emits absolute paths:

```html
<script src="/NeonFactoryRaid/assets/index-EtyuPM-_.js"></script>
<link rel="modulepreload" href="/NeonFactoryRaid/assets/phaser-CaWnzXme.js">
<link rel="stylesheet" href="/NeonFactoryRaid/assets/index-DIKo84Mn.css">
```

CrazyGames serves submissions from a sandboxed iframe whose origin path is
**not** `/NeonFactoryRaid/`. Every asset URL above will 404 on production —
the player gets a black screen. This is the single most likely reason a
submission would be rejected at QA.

**Fix** (one-line change in `vite.config.ts`):

```ts
base: './',   // relative; works on CG, on itch.io, and on GitHub Pages with a redirect
```

Then `npm run build` and verify `dist/index.html` references `./assets/...`.
Test by zipping `/dist/` and opening `index.html` directly from `file://` —
the game should boot.

### P0-2. SDKBridge is still a no-op stub

[src/platform/SDKBridge.ts](src/platform/SDKBridge.ts) — every method is a
documented stub. In production this means:

- **Zero ad revenue**. `requestRewarded()` returns `{success: true}` without
  ever calling `SDK.ad.requestAd('rewarded')`. Players get the reward for
  free, CrazyGames gets nothing, you get nothing.
- `happytime()`, `gameplayStart/Stop`, `loadingStart/Stop` never reach the
  platform → no engagement nudges, no analytics, no proper loading screen
  handoff.
- Cloud saves never happen. Players who clear cookies lose all progress.

The handoff calls this out as a one-file swap. **It is the highest-priority
post-merge task.** Concrete steps:

1. Add `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>`
   to [index.html](index.html#L83) before the module script.
2. Replace the stubbed method bodies with the production implementations
   shown in [FINAL_HANDOFF.md:280-307](FINAL_HANDOFF.md#L280).
3. Keep the localStorage path in `saveData`/`loadData` as a fallback when
   `SDK.data` is unavailable (e.g. local dev).
4. Wire the SDK's mute callback to `SDKBridge.setMuted(true/false)` (the
   method already exists and routes to `AudioBus`).
5. Verify on real CrazyGames sandbox: open Network panel, watch a rewarded
   request fire on accept; verify `happytime` fires on extract.

### P0-3. Midgame interstitial is specified but never invoked

Blueprint §17.6 mandates `SDK.ad.requestAd('midgame')` "every 3rd raid when
returning to factory" and "after failure summary if no rewarded ad was
watched." A `grep` of the codebase finds **zero callsites** of
`SDKBridge.requestMidgame()` outside its definition.

Midgame ads are CrazyGames' primary revenue driver — display ads compose
~60% of the revenue mix per §17.1. Skipping them leaves measurable money on
the table.

**Fix**: In [SummaryScene](src/scenes/SummaryScene.ts) when the player
chooses "Factory" (or any non-double-loot exit), increment a session-scoped
raid counter; on every 3rd return AND after a failed-extract summary that
didn't show a rewarded ad, `await SDKBridge.requestMidgame()` before
launching the factory. Honor the §17.6 "never within 60 seconds of session
start" rule with a timestamp guard.

---

## P1 — High value, low effort (ship with launch if possible)

### P1-1. Phaser bundle is 339 KB gzip — explore tree-shaking

`dist/assets/phaser-CaWnzXme.js` is 1.48 MB raw / 339 KB gzip. This is
~63% of the entire payload. Phaser 3 ships every subsystem by default, but
the game uses neither **Tilemaps**, **Spine**, **Video**, nor **WebGL
post-FX pipelines** directly.

Options ranked by ROI:

1. **Custom Phaser build** — `phaser/phaser-core` import + only the
   subsystems you use. Realistic win: 80–120 KB gzip.
2. **Switch to PixiJS for raid + factory** (blueprint §22.1 already
   anticipates this for "Phase 2 scale"). Largest win (~200 KB gzip
   shaved), but high effort — only worth it if you hit perf ceilings on
   low-end mobile, which the current QualityManager auto-detect handles for
   now.
3. **Defer-load Scrapyard's Three.js chunk** — the 3D mode adds ~150 KB
   gzip; load it lazily via `import('./scenes/ScrapyardScene')` only when
   the player actually approaches the violet pad. Cuts the cold-start
   payload for the 90% of players who never enter Scrapyard.

Option 3 is by far the best ratio: medium effort, ~150 KB win on first
playable, and matches CrazyGames' "first frame in 5 s on 4G" pressure.

### P1-2. Per-shot `Graphics` allocation in WeaponSystem hot path

[src/systems/WeaponSystem.ts:190,203](src/systems/WeaponSystem.ts#L190) does
`this.scene.add.graphics()` for every bullet tracer, then tweens-to-destroy
it. At fire rate 0.06 s (Laser Overdrive × 2 targets + crit + drone
swarm chains), that's ~80–120 Graphics objects per second, each
hitting the display list. On a Chromebook this is measurable GC pressure.

**Fix**: Pool a single `Phaser.GameObjects.Graphics` per scene, clear it
each frame, redraw all active tracers as line segments with fade
calculated from `(now - tracer.startTime)`. Trivial win, drop-in
replacement.

Alternative: switch tracers to a particle emitter with line-segment
particles. Phaser's particle emitters are GPU-batched.

### P1-3. Local-only leaderboard kills the daily-seed retention feature

Blueprint §16.3 declares the daily-seed leaderboard "the single most powerful
retention feature for daily return visits." [LeaderboardSystem](src/systems/LeaderboardSystem.ts)
ships with a `TODO(post-launch)` and stores the player's own history
locally — the "leaderboard" is just personal-bests with the label "YOU"
on every row.

This is a feel-bad. Players who beat their own score on day 7 see
themselves at #1 with no context, which is worse than no leaderboard at
all. Two acceptable shippable approaches:

1. **Cheap backend**: a single Firebase / Supabase / Cloudflare Worker
   endpoint with one collection: `{date, score, anonymousId}`. ~50 LoC.
   Returns top 50 per day. ~$0/mo at CG-scale until you're huge.
2. **Hide the leaderboard panel until backend lands** rather than
   shipping a fake one. Avoids the player-self-deception problem.

(2) is shippable today; (1) is shippable in a day.

### P1-4. Analytics is a complete no-op

[src/platform/Analytics.ts](src/platform/Analytics.ts) is 9 lines, all
no-op. Every event site in the code is correctly wired (good!) but
nothing reaches anywhere. After launch you'll have **zero data** to
diagnose D1 drop-off, FTUE friction, or which power-ups are dominating.

Minimum viable analytics for launch:

- Route everything to **CrazyGames Analytics** (`SDK.analytics.track(...)`)
  — free, no GDPR consent flow needed, dashboard included.
- Same `Analytics.track(event, props)` signature; just stub the body to
  the SDK call.

Or, equivalently, a single fetch-and-forget POST to a Cloudflare Worker
that writes to a free Logflare/Axiom tier. Either way, **do not ship blind.**

### P1-5. RaidScene and FactoryScene are megafiles

`RaidScene.ts` (1,499 lines) and `FactoryScene.ts` (1,679 lines) carry too
much responsibility — they're the choke point for every future change.
Blueprint §22.3 already anticipates extraction: `/raid/RaidSystem.ts`,
`/factory/FactorySystem.ts`, etc. These weren't split during M0–M25 for
velocity reasons, which is fine for a prototype but becomes the
"why-is-the-factory-tab-broken-now" file in 6 months.

Not urgent for launch — flag for the first post-launch refactor sprint.
Split candidates:

- **RaidScene** → `RaidLifecycle`, `RaidHUDBindings`, `RaidEndFlow`
  (extracted, failed, collapsed end-states).
- **FactoryScene** → `FactoryHub`, `FactoryUpgradePanel`, `FactoryDeployFlow`,
  `FactoryMissionBoard` (when contracts land).

### P1-6. Honor the OS-level "reduced motion" preference

The game's identity is screen-shake, hit-stop, vignette pulses, deep-end
tints. Accessibility-conscious players (and motion-sensitive players)
need an opt-out. CrazyGames doesn't enforce this, but **PEGI 12 and
Apple App Store policy reviewers do.**

**Fix**: Add a "Reduce motion" toggle in
[SettingsMenu](src/ui/SettingsMenu.ts) that:

- Halves all `cameras.main.shake` magnitudes.
- Disables the greed vignette pulse.
- Disables the deep-end tint.
- Caps particle counts at Low preset values regardless of preset.

Default off; auto-on if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.

---

## P2 — Blueprint content deltas (deferred per FINAL_HANDOFF, worth scheduling)

These are all called out as `TODO(content)` or in the handoff's
"deferred-work" list. Listed here in **priority order for first
post-launch content drop** — not all of them are equally valuable.

### P2-1. Wire the Bomber enemy at Greed × 2 (high impact, low effort)

The Bomber is the only enemy with a real telegraph mechanic — "0.5 s
expanding red ring before explosion" (§14.2). Without it, the greed
escalation table currently does spawn-rate ramp + tank-rush but lacks the
**visual escalation** that makes high-greed feel scary. WaveDirector
already has the slot marked. This is the single highest-impact missing
content.

### P2-2. Loot Goblin (fixes a content gap in the loot loop)

§14.1 says Loot Goblin "flees, drops bonus loot if killed" — drops 30 Scrap
+ 80% Core chance. This is the dopamine-spike enemy. Without it, the
mid-raid Core economy feels stingy. Adds a player skill expression
("chase or don't") without changing core mechanics.

### P2-3. Real season content (currently 40 identical rewards)

Blueprint §16.5 specifies 40-tier seasons with themed rewards. The
SeasonSystem ships with the scaffold but uses placeholder rewards.
Players who hit tier 40 in 4 weeks need a reason to come back for the
next season. **Cosmetic-only premium tiers** is the cheap solution.

### P2-4. Refinery UI (Cores → permanent multipliers)

Save data has the field; the table in §10.2 is fully spec'd; no UI
exists in FactoryScene. Cores currently have only one sink (operator
unlocks), so once players unlock Vanta they stop caring about Cores —
which kills the entire Core drop loop. **This is a quiet retention killer.**

### P2-5. Mission Board (3 contracts in factory)

§16.6. Daily quest is one quest; contracts are three smaller goals.
Together they're the daily-return scaffold. Without contracts, the
"check in once a day" cadence is thin.

### P2-6. Operators 3 & 4 (Surge, Lodestone)

Defined in OperatorDefs as `locked: true` with empty `apply()`. Player
unlock pacing currently goes: Pulse (free) → Vanta (50 Cores). That's
it. §11.2 says "Day-2 retention is largely driven by 'I want to unlock
the next character.'" Empty stat panel on Day 3 = bounce.

### P2-7. 6 deferred draft cards + 2 deferred power-ups + 4 deferred enemies

All listed in the handoff. Cumulatively important for raid variety, but
each individually small. Sequence them across post-launch content drops
to maintain a "new card every Tuesday" cadence.

---

## P3 — Post-launch polish

### P3-1. The Scrapyard mode follow-ups from the handoff

The 7-item checklist at [FINAL_HANDOFF.md:478-497](FINAL_HANDOFF.md#L478)
is solid. Highest-ROI items:

- **Mobile fallback for Scrapyard** — pointer lock is desktop-only; mobile
  players who tap the violet pad currently get an unresponsive 3D scene.
  Either hide the pad on touch devices (1-line check on `'ontouchstart'
  in window`) or wire a second virtual stick.
- **Mouse sensitivity slider** in SettingsMenu (FPSCamera hardcodes 0.002).
- **Wire daily-quest events from Scrapyard** — quest progress currently
  only accrues during top-down raids, which makes the Scrapyard mode
  feel disconnected from the meta-loop.

### P3-2. Known tuning issues from FINAL_HANDOFF

The handoff's "Tuning notes worth revisiting" section (lines 341–360)
flags six concrete tuning bugs. Quick fixes:

- **Drone Multiplier dead pick on Pulse** → either filter the card from
  Pulse's pool in [CardDefs](src/config/CardDefs.ts), or change the card
  to "+1 drone" instead of "× existing drones."
- **Magnet Storm = Magnet Burst duplicate** → make Magnet Storm apply the
  orbit physics from Magnet Lv. 5 to every pickup for 8 s. Genuinely
  different feel, reuses existing render code.
- **Lucky card invisibility** → tint the Core sprite gold when Lucky is
  active OR show a small "+Lucky" badge above the player.
- **Heal on Pickup too slow** → bump to +2 HP per scrap above the upgrade
  threshold (per Run C note).
- **Daily quest "extracts2" too easy** → replace with "extract with
  Greed ≥ x1.5" once players hit it three times.

### P3-3. Add a real prestige (System Reboot) UI

Save data, achievements, and Cyber-Core math all exist; no UI to invoke
prestige (§10.3). Prestige is what whales do in idle games — gating it
behind "Gen Lv. 25 + 1000 Cores" without a button to press it is
unintuitive.

### P3-4. Localization to 5 markets

Blueprint §22.8 lists Norwegian, Spanish, Portuguese, German, French as
CrazyGames top markets. The string layer ([Strings.ts](src/config/Strings.ts))
already centralizes everything. Translation cost is low (~2,500 words);
expected uplift in non-English markets is significant.

### P3-5. Save migration test runs in dev only

[MigrationTest.ts](src/platform/MigrationTest.ts) exposes
`window.__migrationTest()` for QA. Consider promoting this to a real
unit test (Vitest is a trivial add) so the migration chain is part of
every CI run, not just spot-checked by a human in dev tools. Save bugs
are uniquely terrible because they corrupt real players.

### P3-6. Backdrop blur in High preset — verify on Safari iOS

Quality presets table (§24.3) calls for `Backdrop blur: Yes` on High.
Safari iOS supports `backdrop-filter` only with `-webkit-` prefix and
has historically been the slowest engine for it. Verify on a real iOS
device before enabling High by default there.

---

## What the game is genuinely doing right

(So this audit doesn't read as a takedown.)

- **Architecture cleanliness.** Constructor injection, no singletons,
  systems decoupled via EventBus. The Scrapyard mode merging cleanly
  through `Economy.bankLoot()` is a textbook example of "shared
  progression via real plumbing, not duplication."
- **Save versioning + migration chain.** v0→v9 with a real test entry
  point. Most browser games crash on day 30 when the dev adds a field;
  this one won't.
- **Submission discipline.** Appendix C checklist is fully audited in
  FINAL_HANDOFF.md with honest ⚠️ marks where things genuinely need a
  real device, not green ticks of convenience.
- **FTUE is real.** Tutorial as a real raid with HP×2 / dmg×2 / spawn×0.4
  mods (rather than a separate scene) is the right call. No tutorial
  modal at start. Auto-shielded at HP 1. All per §5.
- **Performance scaffold.** SpatialGrid, object pooling, swap-remove,
  QualityManager with EMA-based auto-detect, dev-mode FPS overlay —
  every box from §24.2 is ticked. The codebase is ready for the perf
  numbers to actually be hit on a real Chromebook.
- **Balance externalized.** [Balance.ts](src/config/Balance.ts) is the
  single source of truth per §23. Designers can tune without touching
  logic. This pays back continuously over the game's life.
- **Honest deferrals.** The handoff is unusually candid about what
  isn't done. That's what makes this audit possible at all.

---

## Suggested order of operations

```
Week 0 (pre-submission):
  [ ] P0-1  Flip vite base to './'  (15 min)
  [ ] P0-2  Real SDK swap            (1-2 hours)
  [ ] P0-3  Midgame ad placements    (2 hours)
  [ ] P1-4  Analytics → SDK route    (1 hour)
  [ ] P1-3  Hide leaderboard panel   (30 min, defer real backend to W2)
  [ ] Real-device QA pass: Chrome Android, Safari iOS, Chromebook

Week 1 (launch):
  [ ] Soft-launch via CrazyGames
  [ ] Monitor D1 funnel, FPS warnings, ad acceptance rate
  [ ] P1-1  Defer-load Scrapyard chunk
  [ ] P1-6  Reduced-motion toggle

Week 2-4 (post-launch content):
  [ ] P2-1  Bomber enemy
  [ ] P2-4  Refinery UI
  [ ] P2-2  Loot Goblin
  [ ] P1-3  Real backend leaderboard
  [ ] P3-2  Tuning bug pass

Month 2:
  [ ] P2-3  Real season content
  [ ] P2-6  Operators 3 & 4
  [ ] P2-5  Mission Board
  [ ] P3-4  Localization (5 markets)
  [ ] P1-5  Split RaidScene / FactoryScene megafiles
```

The cumulative effect of just **Week 0** (~5–6 hours of focused work) is
the difference between "submission auto-rejected for broken asset paths
and missing ads" and "real launch with real revenue and real telemetry."
That's the single highest-leverage block of time in the entire
post-M25 lifecycle.

---

**TL;DR**: Game design, architecture, and content are solid. Fix the
three P0 items before pressing Submit, and this is genuinely a
CrazyGames-ready title.
