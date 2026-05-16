import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Pickup, type PickupType } from '../entities/Pickup';
import { Generator } from '../entities/Machine';
import { Drone } from '../entities/Drone';
import { InputSystem } from '../systems/InputSystem';
import { Economy } from '../systems/EconomySystem';
import { UpgradeEffects } from '../systems/UpgradeSystem';
import { saveSystem } from '../platform/SaveSystem';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';
import { bus, Events } from '../core/EventBus';
import { UpgradeCard } from '../ui/UpgradeCard';
import { UPGRADE_KEYS, type UpgradeKey } from '../config/UpgradeDefs';
import { MusicEngine } from '../audio/music';
import { sfxScrap, sfxCore, sfxUpgradePurchased, sfxGeneratorProduce } from '../audio/sfx';
import { OperatorDefs, OPERATOR_ORDER, type OperatorId } from '../config/OperatorDefs';
import { OperatorSystem } from '../systems/OperatorSystem';
import { InfestationSystem } from '../systems/InfestationSystem';
import { DailyQuestSystem } from '../systems/DailyQuestSystem';
import { StreakSystem } from '../systems/StreakSystem';
import { LeaderboardSystem } from '../systems/LeaderboardSystem';
import { todayUtcDate } from '../config/QuestDefs';
import { AdManager } from '../platform/AdManager';
import { CosmeticSystem } from '../systems/CosmeticSystem';
import { SeasonSystem } from '../systems/SeasonSystem';

// FactoryScene per blueprint §8. The factory is a "living place": the player
// physically walks around to pick up the scrap dropping out of generators, and
// stands on a deploy pad to launch a new raid.
//
// M8 implements:
//   - Player + InputSystem (same as raid)
//   - Generators that pulse and drop scrap on a cadence set by SPM (§8.7)
//   - Pickup pool + magnet (reused from raid)
//   - Deploy pad as a physical object - hold for `holdSec` to start a raid
//   - Walking on collected scrap banks it directly to saveSystem.get().scrap
//
// Future milestones layer on: M9 adds the upgrade panel and additional machine
// types, M10 adds offline production + persistence.

type DeployState = 'idle' | 'holding' | 'launching';

export class FactoryScene extends Phaser.Scene {
  private player!: Player;
  private inputSystem!: InputSystem;
  private pickups!: Phaser.GameObjects.Group;
  private generators: Generator[] = [];

  private padX = Balance.factory.deployPad.x;
  private padY = Balance.factory.deployPad.y;
  private padRadius = Balance.factory.deployPad.radius;
  private padBase!: Phaser.GameObjects.Graphics;
  private padFill!: Phaser.GameObjects.Graphics;
  private deployHold = 0;
  private deployState: DeployState = 'idle';
  // M25 — Secondary deploy pad for the 3D FPS Scrapyard mode. Mirrors the
  // primary pad but launches ScrapyardScene instead of RaidScene. Hidden
  // until the player has finished at least Balance.scrapyard.unlockAfterRaids
  // real raids so the FTUE isn't fragmented.
  private scrapPadX = Balance.factory.scrapyardPad.x;
  private scrapPadY = Balance.factory.scrapyardPad.y;
  private scrapPadRadius = Balance.factory.scrapyardPad.radius;
  private scrapPadBase: Phaser.GameObjects.Graphics | null = null;
  private scrapPadFill: Phaser.GameObjects.Graphics | null = null;
  private scrapPadLabel: Phaser.GameObjects.Text | null = null;
  private scrapDeployHold = 0;
  private scrapDeployState: DeployState = 'idle';
  private drones: Drone[] = [];
  private upgradeCards: UpgradeCard[] = [];
  private milestoneVisuals: Phaser.GameObjects.GameObject[] = [];
  // Pulsing "DEPLOY" prompt that appears the first time a post-tutorial player
  // returns to the factory and has bought Gen Lv. 2. Cleared once they walk on
  // the pad or once raidsCompleted advances past 1.
  private deployPrompt: Phaser.GameObjects.Text | null = null;
  private deployPromptTween: Phaser.Tweens.Tween | null = null;
  // M16 operator picker: rendered to the left of the deploy pad. Each entry
  // owns its own Phaser game objects so we can refresh state on click.
  private operatorPanelObjects: Phaser.GameObjects.GameObject[] = [];
  // M18 — quest panel handles, rebuilt on claim or raid-return.
  private questPanelObjects: Phaser.GameObjects.GameObject[] = [];
  // M19 — daily seed deploy button + leaderboard button + leaderboard modal.
  private dailySeedObjects: Phaser.GameObjects.GameObject[] = [];
  private leaderboardObjects: Phaser.GameObjects.GameObject[] = [];
  // M20 — rewarded-ad panel (FACTORY BOOST + CLEAR INFESTATION + DAILY CRATE).
  // Sits on the left edge below the FPS counter. Refreshed on any state
  // change (boost activated, infestation cleared, daily crate claimed) and
  // re-ticked each second so the FACTORY BOOST cooldown label updates.
  private adPanelObjects: Phaser.GameObjects.GameObject[] = [];
  private adPanelLastSecond = -1;
  private factoryBoostLabel: Phaser.GameObjects.Text | null = null;
  private factoryBoostBg: Phaser.GameObjects.Rectangle | null = null;
  // Pinned try-out toast (shown briefly after the player accepts the
  // OPERATOR TRY-OUT ad). Destroyed automatically.
  private tryOutToast: Phaser.GameObjects.Text | null = null;
  // M23 — season pass progress panel. Pinned top-center; built once on
  // create() and refreshed when a season tier is reached.
  private seasonPanelObjects: Phaser.GameObjects.GameObject[] = [];
  private onSeasonTierReached = (..._args: unknown[]): void => this.buildSeasonPanel();
  private onUpgradePurchased = (..._args: unknown[]): void => this.handleUpgradePurchased();

  constructor() {
    super({ key: 'FactoryScene' });
  }

  create(): void {
    const wb = Balance.player.worldBounds;
    const width = wb.maxX - wb.minX;
    const height = wb.maxY - wb.minY;
    this.physics.world.setBounds(wb.minX, wb.minY, width, height);
    this.cameras.main.setBounds(wb.minX, wb.minY, width, height);
    this.cameras.main.setBackgroundColor(Balance.factory.backgroundColor);

    this.drawBackground();
    this.drawPad();
    this.drawScrapyardPad();

    this.player = new Player(this, 0, 0);
    this.cameras.main.startFollow(
      this.player,
      true,
      Balance.ui.cameraFollowLerp,
      Balance.ui.cameraFollowLerp,
    );

    this.inputSystem = new InputSystem(this);

    this.pickups = this.add.group({
      classType: Pickup,
      maxSize: Balance.performance.maxPickups,
      runChildUpdate: false,
    });
    this.physics.add.overlap(this.player, this.pickups, this.onPickupOverlap, undefined, this);

    this.spawnGenerators();
    this.spawnMilestoneVisuals();
    this.spawnDrones();
    this.buildUpgradePanel();
    this.buildOperatorPanel();

    this.deployState = 'idle';
    this.deployHold = 0;

    bus.on(Events.UPGRADE_PURCHASED, this.onUpgradePurchased);

    this.showOfflineToast();
    this.refreshDeployPrompt();
    this.maybeShowInfestationToast();
    this.maybeShowInfestationTutorialModal();
    this.buildQuestPanel();
    this.buildDailySeedAndLeaderboardButtons();
    this.buildAdPanel();
    this.buildSeasonPanel();
    bus.on(Events.SEASON_TIER_REACHED, this.onSeasonTierReached);
    MusicEngine.startFactory();
  }

  // The §5.2 scripted moment: right after the player buys Gen Lv. 2 in their
  // first post-tutorial factory visit, light up the deploy pad. We key this off
  // (tutorialDone, gen>=2, raidsCompleted<=1) so it stops appearing once they're
  // past the FTUE.
  private refreshDeployPrompt(): void {
    const save = saveSystem.get();
    const want =
      save.tutorialDone === true &&
      save.upgrades.gen >= 2 &&
      save.raidsCompleted <= 1;

    if (want && !this.deployPrompt) {
      this.deployPrompt = this.add
        .text(this.padX, this.padY - this.padRadius - 24, Strings.ftueDeployPrompt, {
          fontFamily: 'monospace',
          fontSize: '34px',
          color: '#72ff9f',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1)
        .setDepth(3);
      this.deployPromptTween = this.tweens.add({
        targets: this.deployPrompt,
        scale: { from: 1, to: 1.18 },
        alpha: { from: 1, to: 0.7 },
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!want && this.deployPrompt) {
      this.deployPromptTween?.stop();
      this.deployPromptTween = null;
      this.deployPrompt.destroy();
      this.deployPrompt = null;
    }
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(Balance.performance.dtClamp, deltaMs / 1000);

    const frame = this.inputSystem.getInput();
    this.player.update(dt, frame);

    // Generators tick on the SPM cadence; output divides across active gens so
    // total factory throughput tracks SPM exactly.
    for (const gen of this.generators) {
      if (gen.tick(dt)) {
        this.spawnScrapAt(gen);
        sfxGeneratorProduce();
      }
    }

    for (const drone of this.drones) drone.update(dt, this.player.x, this.player.y);

    const baseRadius = UpgradeEffects.magnetRadius();
    for (const child of this.pickups.getChildren()) {
      const p = child as Pickup;
      if (!p.active) continue;
      // Drones extend the effective magnet by acting as secondary pull sources.
      // Whichever of (player, drone) is closest within its radius wins.
      let pullX = this.player.x;
      let pullY = this.player.y;
      let radius = baseRadius;
      const dxP = p.x - this.player.x;
      const dyP = p.y - this.player.y;
      let bestD = Math.hypot(dxP, dyP);
      for (const drone of this.drones) {
        const pos = drone.getPosition();
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        const d = Math.hypot(dx, dy);
        if (d < bestD && d <= drone.getPickupRadius()) {
          bestD = d;
          pullX = pos.x;
          pullY = pos.y;
          radius = drone.getPickupRadius();
        }
      }
      p.updateMagnet(dt, pullX, pullY, radius);
    }

    this.tickDeployPad(dt);
    this.tickScrapyardPad(dt);
    this.tickAdPanel();
  }

  shutdown(): void {
    MusicEngine.stop();
    bus.off(Events.UPGRADE_PURCHASED, this.onUpgradePurchased);
    // Bracket the scene transition with a save so deploy-and-die can't lose
    // upgrades the player just bought.
    void saveSystem.persist();
    this.inputSystem.destroy();
    for (const gen of this.generators) gen.destroy();
    this.generators = [];
    for (const drone of this.drones) drone.destroy();
    this.drones = [];
    for (const card of this.upgradeCards) card.destroy();
    this.upgradeCards = [];
    for (const v of this.milestoneVisuals) v.destroy();
    this.milestoneVisuals = [];
    this.deployPromptTween?.stop();
    this.deployPromptTween = null;
    this.deployPrompt?.destroy();
    this.deployPrompt = null;
    this.scrapPadBase?.destroy();
    this.scrapPadBase = null;
    this.scrapPadFill?.destroy();
    this.scrapPadFill = null;
    this.scrapPadLabel?.destroy();
    this.scrapPadLabel = null;
    this.destroyOperatorPanel();
    this.destroyQuestPanel();
    this.destroyDailySeedAndLeaderboard();
    this.destroyAdPanel();
    this.destroySeasonPanel();
    bus.off(Events.SEASON_TIER_REACHED, this.onSeasonTierReached);
    this.tryOutToast?.destroy();
    this.tryOutToast = null;
  }

  // ---- accessors used by HUDScene ----

  getSpm(): number {
    return Economy.computeSpm();
  }

  getDeployHoldRatio(): number {
    if (this.deployState === 'idle') return 0;
    return Math.min(1, this.deployHold / Balance.factory.deployPad.holdSec);
  }

  // ---- internals ----

  private spawnGenerators(): void {
    // M8 ships gen_level=1 → one generator visible. Once Gen Lv. 2 unlocks in M9
    // the second slot from generatorPositions slides in (per §8.5).
    const genLevel = Math.max(1, saveSystem.get().upgrades.gen);
    const slots = Balance.factory.generatorPositions.slice(0, Math.min(genLevel, Balance.factory.generatorPositions.length));
    // M17 — Economy.computeSpm now reads infestation ratio automatically, so
    // generatorDropIntervalSec already reflects fewer working machines. We
    // multiply by the WORKING count (not slots.length) so each healthy
    // generator drops at the right cadence to land at the post-infestation
    // SPM. With 1 of 2 infested: working=1, perGenInterval = baseInterval.
    const infested = new Set(InfestationSystem.getInfestedIndices());
    const workingCount = Math.max(1, slots.length - infested.size);
    const totalIntervalSec = Economy.generatorDropIntervalSec();
    const perGenInterval = totalIntervalSec * workingCount;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const gen = new Generator(this, slot.x, slot.y, perGenInterval, i);
      if (infested.has(i)) gen.setInfested(true);
      this.generators.push(gen);
    }
  }

  private spawnScrapAt(gen: Generator): void {
    const pos = gen.randomDropPosition();
    const p = this.pickups.get(pos.x, pos.y) as Pickup | null;
    if (!p) return;
    p.spawn(pos.x, pos.y, 'scrap', 1);
  }

  private spawnDrones(): void {
    const count = UpgradeEffects.droneCount();
    const withTrail = count >= 3; // §8.5 "Drone Lv. 3: drones gain trails"
    const orbitRadius = 56;
    const orbitSpeed = 2.4;
    for (let i = 0; i < count; i++) {
      const baseAngle = (i / Math.max(1, count)) * Math.PI * 2;
      this.drones.push(
        new Drone(this, {
          orbitRadius,
          orbitSpeed,
          baseAngle,
          pickupRadius: 110,
          withTrail,
        }),
      );
    }
  }

  private buildUpgradePanel(): void {
    const panelW = 300;
    const x = this.scale.width - panelW;
    const startY = 100;
    const rowGap = 96;

    // Panel header
    const header = this.add
      .text(x + 10, startY - 30, 'FACTORY UPGRADES', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#22f6ff',
      })
      .setScrollFactor(0)
      .setDepth(2000);
    this.milestoneVisuals.push(header);

    // Progressive reveal per blueprint §5.3 - only render rows the FTUE has
    // unlocked. The list is filtered before layout so visible rows stack
    // flush, with no holes for locked tracks.
    const visibleKeys = UPGRADE_KEYS.filter(k => this.isUpgradeUnlocked(k));
    for (let i = 0; i < visibleKeys.length; i++) {
      const key = visibleKeys[i];
      const card = new UpgradeCard(this, key, x + 10, startY + i * rowGap);
      card.refresh();
      this.upgradeCards.push(card);
    }
  }

  // §5.3 reveal rules. Gen is always visible (first factory view shows only
  // GENERATOR per the M11 spec). The rest gate on the ftueUnlocks flags set
  // by RaidScene.finishRaid. Speed isn't called out in §5.3 - we piggyback
  // it on the first-real-raid magnet reveal so the first factory visit is
  // a single highlighted row, matching the tutorial brief.
  private isUpgradeUnlocked(key: UpgradeKey): boolean {
    const u = saveSystem.get().ftueUnlocks;
    switch (key) {
      case 'gen':
        return true;
      case 'speed':
        return u.magnetUpgrade;
      case 'magnet':
        return u.magnetUpgrade;
      case 'drone':
        return u.droneUpgrade;
      case 'damage':
        return u.damageUpgrade;
      case 'luck':
        return u.luckUpgrade;
    }
  }

  private handleUpgradePurchased(): void {
    // Refresh affordability + level text on every card after any purchase.
    for (const card of this.upgradeCards) card.refresh();
    // Player numeric stats (HP, speed) refresh immediately for the in-factory feel.
    this.player.refreshFromUpgrades();
    // Some upgrades require live changes to the factory floor (more generators,
    // a new drone, new placeholder visuals).
    this.rebuildFactoryFloor();
    // After Gen Lv. 2 - the scripted §5.2 first-purchase - light up the deploy
    // pad so the player understands what to do next.
    this.refreshDeployPrompt();
    sfxUpgradePurchased();
  }

  private rebuildFactoryFloor(): void {
    for (const gen of this.generators) gen.destroy();
    this.generators = [];
    for (const drone of this.drones) drone.destroy();
    this.drones = [];
    for (const v of this.milestoneVisuals.filter(v => v.getData('milestone') === true)) v.destroy();
    this.milestoneVisuals = this.milestoneVisuals.filter(v => v.getData('milestone') !== true);

    this.spawnGenerators();
    this.spawnMilestoneVisuals();
    this.spawnDrones();
  }

  private showOfflineToast(): void {
    const amount = saveSystem.consumePendingOfflineScrap();
    if (amount <= 0) return;
    const toast = this.add
      .text(this.scale.width / 2, 60, `+${amount} ${Strings.summaryScrap} from offline factory`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#22f6ff',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: '#0a1014',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2100)
      .setAlpha(0);

    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 80,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
    this.time.delayedCall(4200, () => {
      this.tweens.add({
        targets: toast,
        alpha: 0,
        duration: 500,
        onComplete: () => toast.destroy(),
      });
    });
  }

  private spawnMilestoneVisuals(): void {
    const save = saveSystem.get();
    const gen = save.upgrades.gen;
    const magnet = save.upgrades.magnet;

    // Gen Lv. 3: conveyor belts connect generators (placeholder line strip).
    if (gen >= 3 && this.generators.length >= 2) {
      const a = this.generators[0];
      const b = this.generators[1];
      const belt = this.add.graphics();
      belt.setDepth(1);
      belt.lineStyle(8, 0x202a3a, 1);
      belt.lineBetween(a.x, a.y, b.x, b.y);
      belt.lineStyle(2, 0x22f6ff, 0.5);
      belt.lineBetween(a.x, a.y, b.x, b.y);
      belt.setData('milestone', true);
      this.milestoneVisuals.push(belt);
    }

    // Gen Lv. 5: factory expands - zoom camera out slightly.
    this.cameras.main.setZoom(gen >= 5 ? 0.88 : 1);

    // Gen Lv. 10: reactor core in center (labeled placeholder).
    if (gen >= 10) {
      const reactor = this.add.rectangle(0, 0, 80, 80, 0xffd75a, 0.35);
      reactor.setStrokeStyle(2, 0xffd75a, 0.85);
      reactor.setDepth(1);
      reactor.setData('milestone', true);
      this.milestoneVisuals.push(reactor);
      const label = this.add
        .text(0, 0, 'REACTOR', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffd75a',
        })
        .setOrigin(0.5)
        .setDepth(2);
      label.setData('milestone', true);
      this.milestoneVisuals.push(label);
    }

    // Magnet Lv. 3+: visible coil pillar (placeholder).
    if (magnet >= 3) {
      const coil = this.add.rectangle(-200, 220, 40, 60, 0x22f6ff, 0.55);
      coil.setStrokeStyle(2, 0x22f6ff, 0.9);
      coil.setDepth(1);
      coil.setData('milestone', true);
      this.milestoneVisuals.push(coil);
      const label = this.add
        .text(-200, 260, 'COIL', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#22f6ff',
        })
        .setOrigin(0.5)
        .setDepth(2);
      label.setData('milestone', true);
      this.milestoneVisuals.push(label);
    }
  }

  private onPickupOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, pickupObj) => {
    const p = pickupObj as Pickup;
    if (!p.active) return;
    const type: PickupType = p.type;
    const value = p.value;
    if (type === 'scrap') Economy.bankLoot(value, 0);
    else Economy.bankLoot(0, value);
    if (type === 'core') sfxCore();
    else sfxScrap();
    p.kill();
    bus.emit(Events.PICKUP_COLLECTED, type, value);
  };

  private tickDeployPad(dt: number): void {
    if (this.deployState === 'launching') return;
    const dx = this.player.x - this.padX;
    const dy = this.player.y - this.padY;
    const onPad = Math.hypot(dx, dy) <= this.padRadius;
    if (onPad) {
      this.deployHold = Math.min(Balance.factory.deployPad.holdSec, this.deployHold + dt);
      this.deployState = 'holding';
      if (this.deployHold >= Balance.factory.deployPad.holdSec) {
        this.deployState = 'launching';
        this.scene.start('RaidScene');
        return;
      }
    } else {
      this.deployHold = Math.max(0, this.deployHold - dt * 2);
      if (this.deployHold <= 0) this.deployState = 'idle';
    }
    this.drawPadFill();
  }

  // M25 — Scrapyard (3D FPS) deploy pad. Unlocked once the player has done
  // at least Balance.scrapyard.unlockAfterRaids real raids, so the FTUE flow
  // can finish on the top-down loop first.
  private isScrapyardUnlocked(): boolean {
    const save = saveSystem.get();
    if (!save.tutorialDone) return false;
    const realRaids = Math.max(0, save.raidsCompleted - 1);
    return realRaids >= Balance.scrapyard.unlockAfterRaids;
  }

  private tickScrapyardPad(dt: number): void {
    if (!this.isScrapyardUnlocked()) return;
    if (this.scrapDeployState === 'launching') return;
    const dx = this.player.x - this.scrapPadX;
    const dy = this.player.y - this.scrapPadY;
    const onPad = Math.hypot(dx, dy) <= this.scrapPadRadius;
    if (onPad) {
      this.scrapDeployHold = Math.min(Balance.factory.scrapyardPad.holdSec, this.scrapDeployHold + dt);
      this.scrapDeployState = 'holding';
      if (this.scrapDeployHold >= Balance.factory.scrapyardPad.holdSec) {
        this.scrapDeployState = 'launching';
        this.scene.start('ScrapyardScene');
        return;
      }
    } else {
      this.scrapDeployHold = Math.max(0, this.scrapDeployHold - dt * 2);
      if (this.scrapDeployHold <= 0) this.scrapDeployState = 'idle';
    }
    this.drawScrapyardPadFill();
  }

  private drawBackground(): void {
    const wb = Balance.player.worldBounds;
    const grid = this.add.graphics();
    // M23 — equipped factory theme tints the grid lines. Defaults to the
    // base background color so unequipped saves render unchanged.
    const themeColor = CosmeticSystem.getEquippedThemeColor() || Balance.colors.background;
    grid.lineStyle(1, themeColor, Balance.ui.gridAlpha);
    const step = Balance.ui.gridStep;
    for (let x = wb.minX; x <= wb.maxX; x += step) {
      grid.moveTo(x, wb.minY);
      grid.lineTo(x, wb.maxY);
    }
    for (let y = wb.minY; y <= wb.maxY; y += step) {
      grid.moveTo(wb.minX, y);
      grid.lineTo(wb.maxX, y);
    }
    grid.strokePath();
  }

  private drawPad(): void {
    this.padBase = this.add.graphics();
    this.padBase.setDepth(2);
    this.padBase.fillStyle(Balance.colors.extraction, 0.14);
    this.padBase.fillCircle(this.padX, this.padY, this.padRadius);
    this.padBase.lineStyle(3, Balance.colors.extraction, 0.85);
    this.padBase.strokeCircle(this.padX, this.padY, this.padRadius);
    this.padBase.lineStyle(1, Balance.colors.extraction, 0.4);
    this.padBase.strokeCircle(this.padX, this.padY, this.padRadius * 0.55);

    this.padFill = this.add.graphics();
    this.padFill.setDepth(3);

    this.add
      .text(this.padX, this.padY + this.padRadius + 18, Strings.factoryDeployHint, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#72ff9f',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
  }

  private drawPadFill(): void {
    this.padFill.clear();
    if (this.deployHold <= 0) return;
    const ratio = this.deployHold / Balance.factory.deployPad.holdSec;
    this.padFill.lineStyle(6, Balance.colors.extraction, 1);
    const start = -Math.PI / 2;
    const end = start + ratio * Math.PI * 2;
    this.padFill.beginPath();
    this.padFill.arc(this.padX, this.padY, this.padRadius * 0.82, start, end, false);
    this.padFill.strokePath();
  }

  // M25 — Scrapyard pad rendering. Uses a violet ring to distinguish it
  // visually from the green primary deploy pad. Hidden until unlocked.
  private drawScrapyardPad(): void {
    if (!this.isScrapyardUnlocked()) return;
    const ringColor = 0xa76cff;
    this.scrapPadBase = this.add.graphics();
    this.scrapPadBase.setDepth(2);
    this.scrapPadBase.fillStyle(ringColor, 0.12);
    this.scrapPadBase.fillCircle(this.scrapPadX, this.scrapPadY, this.scrapPadRadius);
    this.scrapPadBase.lineStyle(3, ringColor, 0.85);
    this.scrapPadBase.strokeCircle(this.scrapPadX, this.scrapPadY, this.scrapPadRadius);
    this.scrapPadBase.lineStyle(1, ringColor, 0.4);
    this.scrapPadBase.strokeCircle(this.scrapPadX, this.scrapPadY, this.scrapPadRadius * 0.55);

    this.scrapPadFill = this.add.graphics();
    this.scrapPadFill.setDepth(3);

    this.scrapPadLabel = this.add
      .text(this.scrapPadX, this.scrapPadY + this.scrapPadRadius + 18, 'ENTER SCRAPYARD (3D)', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#c8a4ff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
  }

  private drawScrapyardPadFill(): void {
    if (!this.scrapPadFill) return;
    this.scrapPadFill.clear();
    if (this.scrapDeployHold <= 0) return;
    const ratio = this.scrapDeployHold / Balance.factory.scrapyardPad.holdSec;
    this.scrapPadFill.lineStyle(6, 0xa76cff, 1);
    const start = -Math.PI / 2;
    const end = start + ratio * Math.PI * 2;
    this.scrapPadFill.beginPath();
    this.scrapPadFill.arc(this.scrapPadX, this.scrapPadY, this.scrapPadRadius * 0.82, start, end, false);
    this.scrapPadFill.strokePath();
  }

  // §11 operator picker. Pinned to the viewport (scroll-factor 0) along the
  // bottom-center of the screen so it's reachable regardless of the player's
  // position in the factory. One tile per operator in OPERATOR_ORDER. Tap
  // an unlocked operator to select; tap a locked one with sufficient Cores
  // to unlock + select. Surge / Lodestone are flagged `locked: true` (no
  // implementation) and show "COMING SOON".
  private buildOperatorPanel(): void {
    this.destroyOperatorPanel();

    const tileW = 100;
    const tileH = 110;
    const gap = 14;
    const totalW = OPERATOR_ORDER.length * tileW + (OPERATOR_ORDER.length - 1) * gap;
    const startX = (this.scale.width - totalW) / 2;
    const y = this.scale.height - tileH - 16;

    const header = this.add
      .text(this.scale.width / 2, y - 18, Strings.operatorPanelTitle, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#22f6ff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2050);
    this.operatorPanelObjects.push(header);

    for (let i = 0; i < OPERATOR_ORDER.length; i++) {
      const id = OPERATOR_ORDER[i];
      const x = startX + i * (tileW + gap);
      this.buildOperatorTile(id, x, y, tileW, tileH);
    }
  }

  private buildOperatorTile(id: OperatorId, x: number, y: number, w: number, h: number): void {
    const def = OperatorDefs[id];
    const isUnlocked = OperatorSystem.isUnlocked(id);
    const isSelected = OperatorSystem.getSelected() === id;
    const isLocked = def.locked;

    // Background tile. Selected gets a brighter border.
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, 0x0a1014, 0.92)
      .setStrokeStyle(isSelected ? 3 : 2, isSelected ? def.color : 0x4a5560, isSelected ? 1 : 0.7)
      .setScrollFactor(0)
      .setDepth(2050);
    this.operatorPanelObjects.push(bg);

    // Silhouette - dim when locked, full color when selectable.
    const silhouette = this.add.graphics().setScrollFactor(0).setDepth(2051);
    silhouette.setPosition(x + w / 2, y + 28);
    silhouette.fillStyle(def.color, isLocked || !isUnlocked ? 0.25 : 0.85);
    silhouette.lineStyle(2, def.color, isLocked || !isUnlocked ? 0.35 : 1);
    // Triangle silhouette pointing right - mirrors the player ship.
    silhouette.beginPath();
    silhouette.moveTo(14, 0);
    silhouette.lineTo(-12, -10);
    silhouette.lineTo(-6, 0);
    silhouette.lineTo(-12, 10);
    silhouette.closePath();
    silhouette.fillPath();
    silhouette.strokePath();
    this.operatorPanelObjects.push(silhouette);

    // Name
    const name = this.add
      .text(x + w / 2, y + 52, def.name, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: isLocked ? '#666666' : '#ffffff',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2051);
    this.operatorPanelObjects.push(name);

    // Status line (state-dependent)
    const statusText = isLocked
      ? Strings.operatorComingSoon
      : isSelected
        ? Strings.operatorSelected
        : isUnlocked
          ? Strings.operatorUnlock
          : `${Strings.operatorCostPrefix}${def.unlockCost}${Strings.operatorCostSuffix}`;
    const statusColor = isLocked
      ? '#666666'
      : isSelected
        ? '#72ff9f'
        : isUnlocked
          ? '#22f6ff'
          : '#ffd75a';
    const status = this.add
      .text(x + w / 2, y + 70, statusText, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: statusColor,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2051);
    this.operatorPanelObjects.push(status);

    // Description
    const desc = this.add
      .text(x + w / 2, y + h - 18, def.description, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: isLocked ? '#444444' : '#88a0a8',
        wordWrap: { width: w - 8 },
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2051);
    this.operatorPanelObjects.push(desc);

    if (isLocked) return; // No interactive zone for unimplemented operators.

    const hit = this.add
      .zone(x, y, w, h)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2052)
      .setInteractive({ useHandCursor: true });
    this.operatorPanelObjects.push(hit);
    hit.on('pointerdown', () => this.handleOperatorTilePress(id));

    // M20 OPERATOR TRY-OUT — implemented but not yet unlocked tiles get a
    // small "TRY IN NEXT RAID" pill above the tile that routes through the
    // rewarded-ad path. Tutorial-gated: don't surface this until the player
    // is past the FTUE so the first impression isn't ad-cluttered.
    const showTryOut =
      !isUnlocked && saveSystem.get().tutorialDone && OperatorSystem.getTryOut() !== id;
    if (showTryOut) {
      const tryY = y - 22;
      const tryBg = this.add
        .rectangle(x + w / 2, tryY, w - 8, 18, 0xa76cff, 1)
        .setStrokeStyle(1, 0xffffff, 0.9)
        .setScrollFactor(0)
        .setDepth(2053)
        .setInteractive({ useHandCursor: true });
      const tryLabel = this.add
        .text(x + w / 2, tryY, Strings.adOperatorTryButton, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#000000',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2054);
      this.operatorPanelObjects.push(tryBg);
      this.operatorPanelObjects.push(tryLabel);
      tryBg.on('pointerdown', () => {
        void this.handleOperatorTryOut(id);
      });
    } else if (OperatorSystem.getTryOut() === id) {
      // Already queued — show a confirming label so the player knows the
      // next raid will use this operator.
      const tryY = y - 22;
      const queuedLabel = this.add
        .text(x + w / 2, tryY, 'TRY QUEUED', {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#72ff9f',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2054);
      this.operatorPanelObjects.push(queuedLabel);
    }
  }

  private handleOperatorTilePress(id: OperatorId): void {
    const def = OperatorDefs[id];
    if (def.locked) return;
    if (!OperatorSystem.isUnlocked(id)) {
      // Tap to unlock if affordable.
      const ok = OperatorSystem.unlock(id);
      if (!ok) return; // not enough cores
      sfxUpgradePurchased();
      OperatorSystem.select(id);
    } else {
      const before = OperatorSystem.getSelected();
      const ok = OperatorSystem.select(id);
      if (ok && before !== id) sfxCore();
    }
    void saveSystem.persist();
    // Refresh wallet display if any text shows balance + the panel itself.
    this.buildOperatorPanel();
  }

  private destroyOperatorPanel(): void {
    for (const o of this.operatorPanelObjects) o.destroy();
    this.operatorPanelObjects = [];
  }

  // Toast on FactoryScene entry when there's any standing infestation.
  // Decoupled from the first-time modal — appears every visit until cleared.
  private maybeShowInfestationToast(): void {
    if (!InfestationSystem.hasInfestation()) return;
    // Don't show alongside the explainer modal on the very first visit.
    if (!saveSystem.get().infestationTutorialSeen) return;
    const toast = this.add
      .text(this.scale.width / 2, 100, Strings.infestationToast, {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#ff416b',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: '#1a0a14',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2200)
      .setAlpha(0);
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 120,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
    this.time.delayedCall(4500, () => {
      this.tweens.add({
        targets: toast,
        alpha: 0,
        duration: 500,
        onComplete: () => toast.destroy(),
      });
    });
  }

  // First-time-only mechanic explainer. Per Run C clarification #3, this is
  // the only mid-game text modal in the build (outside the FTUE tutorial).
  // Gated by save.infestationTutorialSeen.
  private maybeShowInfestationTutorialModal(): void {
    const save = saveSystem.get();
    if (save.infestationTutorialSeen) return;
    if (!InfestationSystem.hasInfestation()) return;

    const w = this.scale.width;
    const h = this.scale.height;
    const layer: Phaser.GameObjects.GameObject[] = [];
    const backdrop = this.add
      .rectangle(0, 0, w, h, 0x000000, 0.78)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(3000)
      .setInteractive();
    layer.push(backdrop);

    const panelW = 560;
    const panelH = 280;
    const panel = this.add
      .rectangle(w / 2, h / 2, panelW, panelH, 0x101820, 0.98)
      .setStrokeStyle(3, 0xff416b, 0.95)
      .setScrollFactor(0)
      .setDepth(3001);
    layer.push(panel);

    layer.push(
      this.add
        .text(w / 2, h / 2 - panelH / 2 + 28, Strings.infestationModalTitle, {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: '#ff416b',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(3002),
    );
    layer.push(
      this.add
        .text(w / 2, h / 2 - 20, Strings.infestationModalBody, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
          align: 'center',
          wordWrap: { width: panelW - 60 },
          lineSpacing: 6,
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(3002),
    );
    const buttonY = h / 2 + panelH / 2 - 40;
    const btn = this.add
      .rectangle(w / 2, buttonY, 200, 44, 0xff416b, 1)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setScrollFactor(0)
      .setDepth(3002)
      .setInteractive({ useHandCursor: true });
    layer.push(btn);
    layer.push(
      this.add
        .text(w / 2, buttonY, Strings.infestationModalDismiss, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#000000',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(3003),
    );
    const dismiss = (): void => {
      InfestationSystem.markTutorialSeen();
      void saveSystem.persist();
      for (const o of layer) o.destroy();
    };
    btn.on('pointerdown', dismiss);
  }

  // §16.1 daily quest + §16.2 streak panel. Pinned to the right side of
  // the viewport beneath the upgrade panel. Shows the current quest text +
  // progress + claim button + streak counter. Gated by ftueUnlocks.dailyClaim
  // (set by the FTUE on tutorial extract).
  private buildQuestPanel(): void {
    this.destroyQuestPanel();
    const save = saveSystem.get();
    if (!save.ftueUnlocks.dailyClaim) return;
    // Per spec: "panel only appears after tutorial done + first real raid".
    // raidsCompleted counts the tutorial as 1, so >=2 means at least one
    // real raid has finished.
    if (save.raidsCompleted < 2) return;

    DailyQuestSystem.ensureTodaysQuest();
    const cur = DailyQuestSystem.getCurrent();

    // Bottom-left placement avoids the right-side upgrade panel and the
    // bottom-center operator picker. The "right side panel beneath upgrades"
    // wording from spec didn't fit when six upgrade rows reach near the
    // bottom of the viewport, so we move to the symmetric corner.
    const panelW = 320;
    const panelH = 96;
    const x = 12;
    const startY = this.scale.height - panelH - 20;

    const header = this.add
      .text(x + 4, startY - 18, Strings.questPanelTitle, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#22f6ff',
      })
      .setScrollFactor(0)
      .setDepth(2000);
    this.questPanelObjects.push(header);

    const cardBg = this.add
      .rectangle(x, startY, panelW, panelH, 0x0a1014, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x22f6ff, 0.5)
      .setScrollFactor(0)
      .setDepth(2000);
    this.questPanelObjects.push(cardBg);

    if (!cur) {
      const txt = this.add
        .text(x + 12, startY + 14, '— claimed today —', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#88a0a8',
        })
        .setScrollFactor(0)
        .setDepth(2001);
      this.questPanelObjects.push(txt);
    } else {
      const questText = this.add
        .text(x + 12, startY + 10, cur.def.text, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          wordWrap: { width: panelW - 24 },
        })
        .setScrollFactor(0)
        .setDepth(2001);
      this.questPanelObjects.push(questText);

      const progressText = this.add
        .text(x + 12, startY + 46, `${cur.progress}${Strings.questProgressMid}${cur.def.threshold}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: cur.completed ? '#72ff9f' : '#22f6ff',
        })
        .setScrollFactor(0)
        .setDepth(2001);
      this.questPanelObjects.push(progressText);

      if (cur.completed) {
        const btn = this.add
          .rectangle(x + panelW - 78, startY + 52, 130, 28, 0x72ff9f, 1)
          .setStrokeStyle(2, 0xffffff, 0.9)
          .setScrollFactor(0)
          .setDepth(2002)
          .setInteractive({ useHandCursor: true });
        this.questPanelObjects.push(btn);
        const btnLabel = this.add
          .text(x + panelW - 78, startY + 52, Strings.questClaimReady, {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#000000',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(2003);
        this.questPanelObjects.push(btnLabel);
        btn.on('pointerdown', () => this.handleQuestClaim());
      }
    }

    const streakDay = StreakSystem.getDay();
    const streakText = this.add
      .text(x + 12, startY + 70, `${Strings.streakLabel}${streakDay}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffd75a',
      })
      .setScrollFactor(0)
      .setDepth(2001);
    this.questPanelObjects.push(streakText);
  }

  private handleQuestClaim(): void {
    const result = DailyQuestSystem.claim();
    if (!result.ok) return;
    sfxCore();
    void saveSystem.persist();
    // Toast the headline reward; the streak's own day-tier bonus is paid
    // silently into the wallet (visible via the Scrap/Cores HUD).
    const toast = this.add
      .text(this.scale.width / 2, 60, Strings.questRewardToast, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ffd75a',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: '#0a1014',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2200)
      .setAlpha(0);
    this.tweens.add({ targets: toast, alpha: 1, y: 80, duration: 320, ease: 'Cubic.easeOut' });
    this.time.delayedCall(3000, () => {
      this.tweens.add({ targets: toast, alpha: 0, duration: 500, onComplete: () => toast.destroy() });
    });
    this.buildQuestPanel();
  }

  private destroyQuestPanel(): void {
    for (const o of this.questPanelObjects) o.destroy();
    this.questPanelObjects = [];
  }

  // §16.3 daily seed UI: a secondary "DAILY SEED" deploy button next to the
  // normal pad, plus a "TODAY'S BOARD" button that opens the local leaderboard.
  // The daily-seed button greys + relabels itself once the player has used
  // their one attempt today.
  private buildDailySeedAndLeaderboardButtons(): void {
    this.destroyDailySeedAndLeaderboard();

    // Gate behind tutorial completion so FTUE players see only the normal
    // deploy pad and don't get distracted by a secondary launch.
    if (!saveSystem.get().tutorialDone) return;

    const today = todayUtcDate();
    const attempted = LeaderboardSystem.hasAttemptedToday(today);

    // Daily seed button — placed under the deploy pad.
    const btnW = 160;
    const btnH = 40;
    const x = this.padX;
    const y = this.padY + this.padRadius + 56;

    const seedBg = this.add
      .rectangle(x, y, btnW, btnH, attempted ? 0x444444 : 0xa76cff, attempted ? 0.55 : 1)
      .setStrokeStyle(2, 0xffffff, attempted ? 0.25 : 0.85)
      .setDepth(3);
    this.dailySeedObjects.push(seedBg);
    const seedLabel = this.add
      .text(x, y, attempted ? Strings.factoryDailySeedAttempted : Strings.factoryDailySeed, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: attempted ? '#888888' : '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(4);
    this.dailySeedObjects.push(seedLabel);
    if (!attempted) {
      const hint = this.add
        .text(x, y + btnH / 2 + 8, Strings.factoryDailySeedHint, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#a76cff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0)
        .setDepth(4);
      this.dailySeedObjects.push(hint);
      seedBg.setInteractive({ useHandCursor: true });
      seedBg.on('pointerdown', () => this.launchDailySeedRaid());
    }

    // Leaderboard button — top-right corner, viewport-pinned.
    const lbBtn = this.add
      .rectangle(this.scale.width - 110, 84, 200, 30, 0x101820, 0.95)
      .setStrokeStyle(2, 0xa76cff, 0.85)
      .setScrollFactor(0)
      .setDepth(2050)
      .setInteractive({ useHandCursor: true });
    this.dailySeedObjects.push(lbBtn);
    const lbLabel = this.add
      .text(this.scale.width - 110, 84, Strings.leaderboardButton, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#a76cff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2051);
    this.dailySeedObjects.push(lbLabel);
    lbBtn.on('pointerdown', () => this.openLeaderboard());
  }

  private launchDailySeedRaid(): void {
    LeaderboardSystem.markAttempted(todayUtcDate());
    void saveSystem.persist();
    this.scene.start('RaidScene', { tutorial: false, mode: 'dailySeed' });
  }

  private openLeaderboard(): void {
    // Toggle: if already open, close it.
    if (this.leaderboardObjects.length > 0) {
      this.closeLeaderboard();
      return;
    }
    const w = this.scale.width;
    const h = this.scale.height;

    const backdrop = this.add
      .rectangle(0, 0, w, h, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(3500)
      .setInteractive();
    this.leaderboardObjects.push(backdrop);
    backdrop.on('pointerdown', () => this.closeLeaderboard());

    const panelW = 460;
    const panelH = 480;
    const panel = this.add
      .rectangle(w / 2, h / 2, panelW, panelH, 0x101820, 0.98)
      .setStrokeStyle(3, 0xa76cff, 0.95)
      .setScrollFactor(0)
      .setDepth(3501);
    this.leaderboardObjects.push(panel);

    this.leaderboardObjects.push(
      this.add
        .text(w / 2, h / 2 - panelH / 2 + 24, Strings.leaderboardTitle, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#a76cff',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(3502),
    );

    const entries = LeaderboardSystem.getTopEntries();
    if (entries.length === 0) {
      this.leaderboardObjects.push(
        this.add
          .text(w / 2, h / 2, Strings.leaderboardEmpty, {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#88a0a8',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(3502),
      );
    } else {
      const startY = h / 2 - panelH / 2 + 70;
      const rowH = 32;
      const today = todayUtcDate();
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const ry = startY + i * rowH;
        const rank = String(i + 1).padStart(2, ' ');
        const dateLabel = e.date === today ? `${e.date} (TODAY)` : e.date;
        this.leaderboardObjects.push(
          this.add
            .text(w / 2 - panelW / 2 + 30, ry, `#${rank}`, {
              fontFamily: 'monospace',
              fontSize: '14px',
              color: '#ffd75a',
            })
            .setScrollFactor(0)
            .setDepth(3502),
        );
        this.leaderboardObjects.push(
          this.add
            .text(w / 2 - panelW / 2 + 80, ry, dateLabel, {
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#ffffff',
            })
            .setScrollFactor(0)
            .setDepth(3502),
        );
        this.leaderboardObjects.push(
          this.add
            .text(w / 2 + panelW / 2 - 110, ry, `${e.score} ${Strings.summaryScrap}`, {
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#22f6ff',
            })
            .setScrollFactor(0)
            .setDepth(3502),
        );
        if (e.isYou) {
          this.leaderboardObjects.push(
            this.add
              .text(w / 2 + panelW / 2 - 40, ry, Strings.leaderboardYou, {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#72ff9f',
              })
              .setScrollFactor(0)
              .setDepth(3502),
          );
        }
      }
    }

    const closeY = h / 2 + panelH / 2 - 36;
    const closeBg = this.add
      .rectangle(w / 2, closeY, 140, 36, 0xa76cff, 1)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setScrollFactor(0)
      .setDepth(3502)
      .setInteractive({ useHandCursor: true });
    this.leaderboardObjects.push(closeBg);
    this.leaderboardObjects.push(
      this.add
        .text(w / 2, closeY, Strings.leaderboardClose, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#000000',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(3503),
    );
    closeBg.on('pointerdown', () => this.closeLeaderboard());
  }

  private closeLeaderboard(): void {
    for (const o of this.leaderboardObjects) o.destroy();
    this.leaderboardObjects = [];
  }

  private destroyDailySeedAndLeaderboard(): void {
    for (const o of this.dailySeedObjects) o.destroy();
    this.dailySeedObjects = [];
    this.closeLeaderboard();
  }

  // M20 — left-edge rewarded-ad panel. Three buttons:
  //   FACTORY BOOST  (gated on ftueUnlocks.factoryBoost; shows cooldown live)
  //   CLEAR INFESTATION (visible only when any machines are infested)
  //   DAILY CRATE (visible only when the player has raided today and not yet claimed)
  // Each routes through AdManager.offer() which handles the modal + SDK call.
  private buildAdPanel(): void {
    this.destroyAdPanel();
    const save = saveSystem.get();
    const x = 12;
    let y = 120;
    const btnW = 220;
    const btnH = 40;
    const gap = 8;

    // FACTORY BOOST. Only visible once the FTUE has unlocked it (5+ raids).
    if (save.ftueUnlocks.factoryBoost) {
      const fb = this.makeAdButton(x, y, btnW, btnH, this.factoryBoostLabelText(), 0xffd75a, () =>
        this.handleFactoryBoost(),
      );
      this.factoryBoostBg = fb.bg;
      this.factoryBoostLabel = fb.label;
      this.adPanelObjects.push(fb.bg);
      this.adPanelObjects.push(fb.label);
      y += btnH + gap;
      this.applyFactoryBoostVisuals();
    } else {
      this.factoryBoostBg = null;
      this.factoryBoostLabel = null;
    }

    // CLEAR INFESTATION — replaces the previous M20 stub. Routes to the
    // existing InfestationSystem.clearAllInfestation() on grant.
    if (InfestationSystem.hasInfestation()) {
      const ci = this.makeAdButton(x, y, btnW, btnH, Strings.infestationClearAd, 0xff416b, () =>
        this.handleClearInfestation(),
      );
      this.adPanelObjects.push(ci.bg);
      this.adPanelObjects.push(ci.label);
      y += btnH + gap;
    }

    // DAILY CRATE — eligibility means "raided today AND not yet claimed".
    // If already claimed, render a passive label instead so the player sees
    // their progression (claimed → bare label, becomes button again next day).
    if (save.tutorialDone && AdManager.isDailyCrateEligible()) {
      const dc = this.makeAdButton(x, y, btnW, btnH, Strings.adDailyCrateButton, 0xa76cff, () =>
        this.handleDailyCrate(),
      );
      this.adPanelObjects.push(dc.bg);
      this.adPanelObjects.push(dc.label);
      y += btnH + gap;
    } else if (save.tutorialDone && AdManager.isDailyCrateClaimedToday()) {
      const label = this.add
        .text(x, y, Strings.adDailyCrateClaimed, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#666666',
        })
        .setScrollFactor(0)
        .setDepth(2051);
      this.adPanelObjects.push(label);
      y += 18 + gap;
    }
  }

  private destroyAdPanel(): void {
    for (const o of this.adPanelObjects) o.destroy();
    this.adPanelObjects = [];
    this.factoryBoostBg = null;
    this.factoryBoostLabel = null;
  }

  // Per-frame: refresh the FACTORY BOOST label so the cooldown ticks live
  // (1-second granularity). Bails on no-button / no-elapsed-second to keep
  // the work minimal.
  private tickAdPanel(): void {
    if (!this.factoryBoostLabel) return;
    const sec = Math.floor(Date.now() / 1000);
    if (sec === this.adPanelLastSecond) return;
    this.adPanelLastSecond = sec;
    this.factoryBoostLabel.setText(this.factoryBoostLabelText());
    this.applyFactoryBoostVisuals();
    // Rebuild the whole panel if the boost just ended (cooldown text differs
    // from active text, and we might want to enable a queued claim).
    if (!AdManager.isFactoryBoostActive() && this.factoryBoostBg && this.factoryBoostBg.alpha < 1) {
      // No-op: actual rebuild only on user-action paths to avoid flicker.
    }
  }

  private factoryBoostLabelText(): string {
    if (AdManager.isFactoryBoostActive()) {
      const secs = AdManager.factoryBoostCooldownRemainingSec();
      return `${Strings.adFactoryBoostActive} ${secs}s`;
    }
    if (AdManager.isFactoryBoostOnCooldown()) {
      const secs = AdManager.factoryBoostCooldownRemainingSec();
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${Strings.adFactoryBoostCooldown} ${m}:${s.toString().padStart(2, '0')}`;
    }
    return Strings.adFactoryBoostButton;
  }

  private applyFactoryBoostVisuals(): void {
    if (!this.factoryBoostBg || !this.factoryBoostLabel) return;
    const onCd = AdManager.isFactoryBoostOnCooldown();
    const active = AdManager.isFactoryBoostActive();
    if (active) {
      this.factoryBoostBg.setFillStyle(0x72ff9f, 0.9);
      this.factoryBoostBg.setStrokeStyle(2, 0xffffff, 0.85);
      this.factoryBoostBg.disableInteractive();
      this.factoryBoostLabel.setColor('#000000');
    } else if (onCd) {
      this.factoryBoostBg.setFillStyle(0x444444, 0.6);
      this.factoryBoostBg.setStrokeStyle(1, 0xffffff, 0.25);
      this.factoryBoostBg.disableInteractive();
      this.factoryBoostLabel.setColor('#888888');
    } else {
      this.factoryBoostBg.setFillStyle(0xffd75a, 1);
      this.factoryBoostBg.setStrokeStyle(2, 0xffffff, 0.9);
      this.factoryBoostBg.setInteractive({ useHandCursor: true });
      this.factoryBoostLabel.setColor('#000000');
    }
  }

  // Shared button factory for the M20 ad panel. Pure visual; click handler
  // is wired by the caller because each placement runs different logic.
  private makeAdButton(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    bgColor: number,
    onClick: () => void,
  ): { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } {
    const bg = this.add
      .rectangle(x, y, w, h, bgColor, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setScrollFactor(0)
      .setDepth(2050)
      .setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(bgColor, 0.85));
    bg.on('pointerout', () => bg.setFillStyle(bgColor, 1));
    bg.on('pointerdown', onClick);
    const label = this.add
      .text(x + w / 2, y + h / 2, text, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#000000',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2051);
    return { bg, label };
  }

  private async handleFactoryBoost(): Promise<void> {
    if (AdManager.isFactoryBoostOnCooldown()) return;
    this.scene.pause();
    const granted = await AdManager.offer(this, {
      title: Strings.adFactoryBoostTitle,
      description: Strings.adFactoryBoostDesc,
    });
    this.scene.resume();
    if (!granted) return;
    AdManager.activateFactoryBoost();
    void saveSystem.persist();
    // Regenerator drop cadence depends on SPM which depends on the boost
    // active state. Rebuild generators so they tick at the boosted rate.
    this.rebuildFactoryFloor();
    this.buildAdPanel();
  }

  private async handleClearInfestation(): Promise<void> {
    if (!InfestationSystem.hasInfestation()) return;
    this.scene.pause();
    const granted = await AdManager.offer(this, {
      title: Strings.adClearInfestationTitle,
      description: Strings.adClearInfestationDesc,
      borderColor: 0xff416b,
    });
    this.scene.resume();
    if (!granted) return;
    InfestationSystem.clearAllInfestation();
    void saveSystem.persist();
    this.rebuildFactoryFloor();
    this.buildAdPanel();
  }

  private async handleDailyCrate(): Promise<void> {
    if (!AdManager.isDailyCrateEligible()) return;
    this.scene.pause();
    const granted = await AdManager.offer(this, {
      title: Strings.adDailyCrateTitle,
      description: Strings.adDailyCrateDesc,
      borderColor: 0xa76cff,
    });
    this.scene.resume();
    if (!granted) return;
    const reward = AdManager.claimDailyCrate();
    if (reward.kind === 'scrap') Economy.bankLoot(reward.amount, 0);
    else Economy.bankLoot(0, reward.amount);
    void saveSystem.persist();
    this.showAdRewardToast(AdManager.formatDailyCrateRewardText(reward));
    this.buildAdPanel();
  }

  private showAdRewardToast(text: string): void {
    const toast = this.add
      .text(this.scale.width / 2, 50, text, {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#ffd75a',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: '#0a1014',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2200)
      .setAlpha(0);
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 70,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
    this.time.delayedCall(3500, () => {
      this.tweens.add({
        targets: toast,
        alpha: 0,
        duration: 500,
        onComplete: () => toast.destroy(),
      });
    });
  }

  // M23 — small season pass progress panel pinned top-center. Shows current
  // tier + XP bar. Refreshed when a SEASON_TIER_REACHED event fires.
  private buildSeasonPanel(): void {
    this.destroySeasonPanel();
    // Gate behind tutorial completion — first-time players don't need extra
    // numbers on screen.
    if (!saveSystem.get().tutorialDone) return;
    const prog = SeasonSystem.getProgress();
    const x = this.scale.width / 2;
    const y = 12;
    const w = 220;
    const h = 28;
    const bg = this.add
      .rectangle(x, y, w, h, 0x0a1014, 0.85)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, 0xa76cff, 0.7)
      .setScrollFactor(0)
      .setDepth(2050);
    this.seasonPanelObjects.push(bg);
    const trackTag = prog.premium ? Strings.seasonPremiumTag : Strings.seasonFreeTag;
    const label = this.add
      .text(x, y + 4, `${Strings.seasonTierPrefix}${prog.tier}${Strings.seasonTierMid}${prog.max}${trackTag}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#a76cff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2051);
    this.seasonPanelObjects.push(label);
    // XP bar (small).
    const barW = w - 24;
    const barH = 6;
    const barX = x - barW / 2;
    const barY = y + h - barH - 4;
    const barBg = this.add
      .rectangle(barX, barY, barW, barH, 0x222a36, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 0.4)
      .setScrollFactor(0)
      .setDepth(2051);
    this.seasonPanelObjects.push(barBg);
    const ratio = Math.max(0, Math.min(1, prog.xp / Math.max(1, prog.xpPerTier)));
    const barFill = this.add
      .rectangle(barX + 1, barY + 1, Math.max(0, (barW - 2) * ratio), barH - 2, 0xa76cff, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2052);
    this.seasonPanelObjects.push(barFill);
  }

  private destroySeasonPanel(): void {
    for (const o of this.seasonPanelObjects) o.destroy();
    this.seasonPanelObjects = [];
  }

  // M20 OPERATOR TRY-OUT — handler called from the operator tile's "TRY IN
  // NEXT RAID" button. Sets save.tryOutOperator so the next raid swaps the
  // selected operator for one run (consumed in RaidScene.finishRaid).
  private async handleOperatorTryOut(id: OperatorId): Promise<void> {
    const def = OperatorDefs[id];
    if (def.locked) return; // unimplemented operators can't be tried
    if (OperatorSystem.isUnlocked(id)) return; // already owned, no need
    this.scene.pause();
    const granted = await AdManager.offer(this, {
      title: Strings.adOperatorTryOutTitle,
      description: Strings.adOperatorTryOutDesc,
      borderColor: def.color,
    });
    this.scene.resume();
    if (!granted) return;
    OperatorSystem.setTryOut(id);
    void saveSystem.persist();
    this.showAdRewardToast(Strings.adTryOutToast);
    this.buildOperatorPanel();
  }
}
