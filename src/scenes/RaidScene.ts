import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Pickup, type PickupType } from '../entities/Pickup';
import { Bullet } from '../entities/Bullet';
import { Powerup } from '../entities/Powerup';
import { InputSystem } from '../systems/InputSystem';
import { WaveDirector } from '../systems/WaveDirector';
import { WeaponSystem } from '../systems/WeaponSystem';
import { ParticleEffects } from '../systems/ParticleEffects';
import { ExtractionSystem } from '../systems/ExtractionSystem';
import { GreedSystem } from '../systems/GreedSystem';
import { PowerupSystem } from '../systems/PowerupSystem';
import { Economy } from '../systems/EconomySystem';
import { UpgradeEffects } from '../systems/UpgradeSystem';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';
import { EnemyDefs } from '../config/EnemyDefs';
import { PowerupDefs } from '../config/PowerupDefs';
import { bus, Events } from '../core/EventBus';
import { playRisingChord } from '../platform/Audio';
import { saveSystem } from '../platform/SaveSystem';
import type {
  RaidEndState,
  RaidEndPayload,
  RaidInitData,
  WaypointTarget,
} from '../core/types';

type RaidPhase = 'active' | 'extracting' | 'ended';

type TutorialCaptionKey = 'move' | 'dash' | 'powerup' | 'extract';

// RaidScene drives the raid lifecycle. Through M6 it owns:
//   - the player, enemies, pickups, bullets pools
//   - WaveDirector / WeaponSystem / ParticleEffects / ExtractionSystem
//   - the combo + run-loot accumulator
//   - the active->extracting->ended state machine and transition to SummaryScene
//
// Combo scales the VALUE of each drop (not the count) per the M5 gate decision:
// count-scaling explodes pickup population at high combo and hits the maxPickups cap.
// Greed multiplier (M7) will further scale banked loot on successful extract.

export class RaidScene extends Phaser.Scene {
  private player!: Player;
  private inputSystem!: InputSystem;
  private enemies!: Phaser.GameObjects.Group;
  private pickups!: Phaser.GameObjects.Group;
  private bullets!: Phaser.GameObjects.Group;
  private waveDirector!: WaveDirector;
  private weapons!: WeaponSystem;
  private particles!: ParticleEffects;
  private extraction!: ExtractionSystem;
  private greed!: GreedSystem;
  private runLoot = { scrap: 0, cores: 0 };
  private combo = 1.0;
  private comboGrace = 0;
  private timeRemaining: number = Balance.raid.normalDuration;
  private activePopups = 0;
  private phase: RaidPhase = 'active';
  private extractTimer = 0;
  private isTutorial = false;
  private elapsed = 0;
  private captionDoneIdx = -1;
  private tutorialBanner: Phaser.GameObjects.Text | null = null;
  private powerups!: Phaser.GameObjects.Group;
  private powerupSystem!: PowerupSystem;
  private onPlayerDied = (): void => this.requestEnd('failed');
  private onExtractionComplete = (): void => this.beginExtractionMoment();
  private onExtractionOpened = (): void => this.greed.start();

  constructor() {
    super({ key: 'RaidScene' });
  }

  init(data?: RaidInitData): void {
    this.isTutorial = !!data?.tutorial;
  }

  create(): void {
    const wb = Balance.player.worldBounds;
    const width = wb.maxX - wb.minX;
    const height = wb.maxY - wb.minY;
    this.physics.world.setBounds(wb.minX, wb.minY, width, height);
    this.cameras.main.setBounds(wb.minX, wb.minY, width, height);
    this.cameras.main.setBackgroundColor(Balance.rendering.backgroundColor);

    this.drawBackground();

    this.player = new Player(this, 0, 0);
    this.cameras.main.startFollow(
      this.player,
      true,
      Balance.ui.cameraFollowLerp,
      Balance.ui.cameraFollowLerp,
    );

    this.inputSystem = new InputSystem(this);

    this.enemies = this.add.group({
      classType: Enemy,
      maxSize: Balance.enemies.maxOnScreen,
      runChildUpdate: false,
    });
    this.pickups = this.add.group({
      classType: Pickup,
      maxSize: Balance.performance.maxPickups,
      runChildUpdate: false,
    });
    this.bullets = this.add.group({
      classType: Bullet,
      maxSize: Balance.shooter.bulletMaxOnField,
      runChildUpdate: false,
    });
    this.powerups = this.add.group({
      classType: Powerup,
      maxSize: Balance.powerups.maxOnField,
      runChildUpdate: false,
    });
    this.physics.add.overlap(this.player, this.pickups, this.onPickupOverlap, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerEnemyOverlap, undefined, this);
    this.physics.add.overlap(this.player, this.bullets, this.onPlayerBulletOverlap, undefined, this);
    this.physics.add.overlap(this.player, this.powerups, this.onPowerupOverlap, undefined, this);

    this.waveDirector = new WaveDirector(this.enemies, () => ({
      x: this.player.x,
      y: this.player.y,
    }));
    const raidDuration = this.isTutorial
      ? Balance.raid.tutorialDuration
      : Balance.raid.normalDuration;
    if (this.isTutorial) {
      this.waveDirector.start({
        spawnRateMult: Balance.tutorial.enemySpawnRateMult,
        enemyHpMult: Balance.tutorial.enemyHpMult,
        raidDuration,
      });
    } else {
      this.waveDirector.start({ raidDuration });
    }

    this.particles = new ParticleEffects(this);
    this.weapons = new WeaponSystem(
      this,
      () => ({ x: this.player.x, y: this.player.y }),
      () => this.enemies.getChildren(),
    );
    this.weapons.setDamageLevel(UpgradeEffects.weaponDamageLevel());
    if (this.isTutorial) this.weapons.setDamageMult(Balance.tutorial.playerDamageMult);

    this.extraction = new ExtractionSystem(
      this,
      Balance.extraction.padX,
      Balance.extraction.padY,
      Balance.extraction.padRadius,
      this.isTutorial ? Balance.raid.tutorialExtractionOpenTime : Balance.raid.extractionOpenTime,
    );

    this.greed = new GreedSystem();

    this.powerupSystem = new PowerupSystem(
      this,
      this.powerups,
      () => ({ x: this.player.x, y: this.player.y }),
      { tutorial: this.isTutorial },
      {
        signalNuke: () => this.activateSignalNuke(),
        timeBonus: () => this.activateTimeBonus(),
        shieldGrant: () => this.player.addShieldCharge(),
      },
    );
    this.powerupSystem.start();

    this.runLoot.scrap = 0;
    this.runLoot.cores = 0;
    this.combo = 1.0;
    this.comboGrace = 0;
    this.timeRemaining = raidDuration;
    this.phase = 'active';
    this.extractTimer = 0;
    this.elapsed = 0;
    this.captionDoneIdx = -1;

    if (this.isTutorial) {
      this.player.applyHpMult(Balance.tutorial.playerHpMult);
      this.player.setHpFloor(Balance.tutorial.safetyNetHpFloor);
      this.spawnInitialScrapPile();
      this.spawnTutorialBanner();
    }

    bus.on(Events.PLAYER_DIED, this.onPlayerDied);
    bus.on(Events.EXTRACTION_COMPLETE, this.onExtractionComplete);
    bus.on(Events.EXTRACTION_OPENED, this.onExtractionOpened);

    bus.emit(Events.RAID_STARTED);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(Balance.performance.dtClamp, deltaMs / 1000);

    if (this.phase === 'ended') return;

    if (this.phase === 'extracting') {
      this.updateExtractionMoment(dt);
      return;
    }

    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    this.elapsed += dt;

    const frame = this.inputSystem.getInput();
    this.player.update(dt, frame);
    this.player.syncShieldAura();
    this.waveDirector.update(dt);
    this.extraction.update(dt, this.player.x, this.player.y);
    this.greed.update(dt);
    this.powerupSystem.update(dt);

    if (this.isTutorial) this.tickTutorial(dt);

    // Push current power-up state into the weapon. Cheap to do every frame -
    // the setters are just field writes.
    this.weapons.setFireRateMult(this.powerupSystem.getFireRateMult());
    this.weapons.setTargetsPerShot(this.powerupSystem.getTargetsPerShot());

    const frozen = this.powerupSystem.isFreezeActive();
    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (!e.active) continue;
      // Visual cue while Freeze Pulse is up; restored to white on thaw.
      if (frozen) e.setTint(Balance.powerups.freezeTint);
      else e.clearTint();
      const r = e.tick(dt, this.player.x, this.player.y, frozen);
      if (r.fired) this.spawnEnemyBullet(r.fired.fromX, r.fired.fromY, r.fired.dirX, r.fired.dirY);
    }

    const hits = this.weapons.update(dt);
    for (const hit of hits) this.processHit(hit.target, hit.damage, this.player.x, this.player.y);

    // Magnet radius: base × upgrade × Magnet Burst (when active).
    const magnetRadius = UpgradeEffects.magnetRadius() * this.powerupSystem.getMagnetMult();
    for (const child of this.pickups.getChildren()) {
      const p = child as Pickup;
      if (p.active) p.updateMagnet(dt, this.player.x, this.player.y, magnetRadius);
    }

    // Powerups magnetize on the same radius but with a separate, more
    // forgiving pull profile (Powerup.updateMagnet's internal speeds).
    for (const child of this.powerups.getChildren()) {
      const p = child as Powerup;
      if (p.active) p.updateMagnet(dt, this.player.x, this.player.y, magnetRadius);
    }

    this.tickBullets(dt);
    this.tickCombo(dt);

    if (this.timeRemaining <= 0) {
      this.requestEnd('collapsed');
    }
  }

  shutdown(): void {
    bus.off(Events.PLAYER_DIED, this.onPlayerDied);
    bus.off(Events.EXTRACTION_COMPLETE, this.onExtractionComplete);
    bus.off(Events.EXTRACTION_OPENED, this.onExtractionOpened);
    this.waveDirector.stop();
    this.inputSystem.destroy();
    this.particles.destroy();
    this.extraction.destroy();
    this.greed.stop();
    this.powerupSystem.stop();
    if (this.tutorialBanner) {
      this.tutorialBanner.destroy();
      this.tutorialBanner = null;
    }
    bus.emit(Events.RAID_ENDED);
  }

  // ---- accessors used by HUDScene ----

  getTimeRemaining(): number {
    return this.timeRemaining;
  }

  getCombo(): number {
    return this.combo;
  }

  getRunLoot(): { scrap: number; cores: number } {
    return { scrap: this.runLoot.scrap, cores: this.runLoot.cores };
  }

  getPlayerHP(): { hp: number; max: number } {
    return { hp: this.player.hp, max: this.player.maxHp };
  }

  getExtractionInfo(): { open: boolean; padX: number; padY: number; fill: number } {
    const pos = this.extraction.getPadPosition();
    return {
      open: this.extraction.isOpen(),
      padX: pos.x,
      padY: pos.y,
      fill: this.extraction.getFill(),
    };
  }

  getGreedInfo(): { active: boolean; mult: number; elapsed: number } {
    return {
      active: this.greed.isRunning(),
      mult: this.greed.getMultiplier(),
      elapsed: this.greed.getElapsed(),
    };
  }

  // ---- overlap callbacks ----

  private onPickupOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, pickupObj) => {
    const p = pickupObj as Pickup;
    if (!p.active) return;
    const type: PickupType = p.type;
    const value = p.value;
    if (type === 'scrap') this.runLoot.scrap += value;
    else this.runLoot.cores += value;
    if (value > 1) {
      this.showPopup(
        p.x,
        p.y - 10,
        `+${value}`,
        type === 'scrap' ? '#22f6ff' : '#ffd75a',
      );
    }
    if (type === 'core') {
      const save = saveSystem.get();
      if (!save.firstCoreCollected) {
        save.firstCoreCollected = true;
        save.ftueUnlocks.luckUpgrade = true;
      }
    }
    p.kill();
    bus.emit(Events.PICKUP_COLLECTED, type, value);
  };

  private onPlayerEnemyOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, enemyObj) => {
    if (this.phase !== 'active') return;
    const e = enemyObj as Enemy;
    if (!e.active) return;
    const def = EnemyDefs[e.kind];
    const applied = this.player.takeDamage(def.contactDamage);
    if (applied > 0) {
      this.showPopup(this.player.x, this.player.y - 22, `-${applied}`, '#ff416b');
    }
  };

  private onPlayerBulletOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_playerObj, bulletObj) => {
    if (this.phase !== 'active') return;
    const b = bulletObj as Bullet;
    if (!b.active) return;
    const applied = this.player.takeDamage(b.damage);
    if (applied > 0) {
      this.showPopup(this.player.x, this.player.y - 22, `-${applied}`, '#ff416b');
    }
    b.kill();
  };

  // ---- internals ----

  private onEnemyKilled(): void {
    this.combo = Math.min(Balance.raid.comboMax, this.combo + Balance.raid.comboPerKill);
    this.comboGrace = Balance.raid.comboGraceSec;
    bus.emit(Events.COMBO_CHANGED, this.combo);
    bus.emit(Events.ENEMY_KILLED);
  }

  private tickCombo(dt: number): void {
    if (this.comboGrace > 0) {
      this.comboGrace -= dt;
      return;
    }
    if (this.combo > 1.0) {
      this.combo = Math.max(1.0, this.combo - Balance.raid.comboDecayPerSec * dt);
    }
  }

  private spawnDrops(enemy: Enemy): void {
    const def = EnemyDefs[enemy.kind];
    const ex = enemy.x;
    const ey = enemy.y;
    // Combo scales the VALUE of each pickup (per M5 gate decision); count stays
    // fixed at the §14.3 base so we never blow past Balance.performance.maxPickups.
    const valuePerDrop = Math.max(1, Math.round(this.combo));
    for (let i = 0; i < def.scrapDrop; i++) {
      const p = this.pickups.get(ex, ey) as Pickup | null;
      if (!p) break;
      p.spawn(ex, ey, 'scrap', valuePerDrop);
    }
    const coreChance = UpgradeEffects.coreDropChance(def.coreChance);
    if (Math.random() < coreChance) {
      const p = this.pickups.get(ex, ey) as Pickup | null;
      if (p) p.spawn(ex, ey, 'core', valuePerDrop);
    }
  }

  private spawnEnemyBullet(fromX: number, fromY: number, dirX: number, dirY: number): void {
    const b = this.bullets.get(fromX, fromY) as Bullet | null;
    if (!b) return;
    b.fire(fromX, fromY, dirX, dirY, Balance.shooter.bulletSpeed, Balance.shooter.bulletDamage);
  }

  private tickBullets(dt: number): void {
    const wb = Balance.player.worldBounds;
    for (const child of this.bullets.getChildren()) {
      const b = child as Bullet;
      if (!b.active) continue;
      b.tick(dt);
      if (b.x < wb.minX || b.x > wb.maxX || b.y < wb.minY || b.y > wb.maxY) b.kill();
    }
  }

  private showPopup(x: number, y: number, text: string, color: string): void {
    if (this.activePopups >= Balance.performance.maxPopups) return;
    this.activePopups++;
    const t = this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    t.setOrigin(0.5).setDepth(100);
    this.tweens.add({
      targets: t,
      y: y - Balance.ui.popupRiseDist,
      alpha: 0,
      duration: Balance.ui.popupDurationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        t.destroy();
        this.activePopups--;
      },
    });
  }

  private drawBackground(): void {
    const wb = Balance.player.worldBounds;
    const grid = this.add.graphics();
    grid.lineStyle(1, Balance.colors.background, Balance.ui.gridAlpha);
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

    const bounds = this.add.graphics();
    bounds.lineStyle(2, Balance.colors.background, Balance.ui.boundsAlpha);
    bounds.strokeRect(wb.minX, wb.minY, wb.maxX - wb.minX, wb.maxY - wb.minY);
  }

  // ---- end-state machine ----

  private beginExtractionMoment(): void {
    if (this.phase !== 'active') return;
    this.phase = 'extracting';
    this.extractTimer = Balance.extraction.momentDurationSec;

    // Stop incoming threats.
    this.waveDirector.stop();
    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (!e.active) continue;
      this.particles.enemyDeath(e.kind, e.x, e.y);
      e.kill();
    }
    for (const child of this.bullets.getChildren()) {
      const b = child as Bullet;
      if (b.active) b.kill();
    }

    // Brief frame freeze + radial light blast at the player.
    this.spawnRadialFlash();
    playRisingChord();
  }

  private updateExtractionMoment(dt: number): void {
    this.extractTimer -= dt;
    const elapsed = Balance.extraction.momentDurationSec - this.extractTimer;
    const stillFrozen = elapsed < Balance.extraction.momentFreezeSec;

    if (!stillFrozen) {
      // After the freeze: pickups beeline to the player and any newly-magnetized
      // values are banked through the existing overlap callback.
      for (const child of this.pickups.getChildren()) {
        const p = child as Pickup;
        if (p.active) p.flyIn(this.player.x, this.player.y, Balance.extraction.flyInSpeed);
      }
    }

    if (this.extractTimer <= 0) {
      this.finishRaid('extracted');
    }
  }

  private requestEnd(state: RaidEndState): void {
    if (this.phase !== 'active') return;
    this.finishRaid(state);
  }

  private finishRaid(state: RaidEndState): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.extraction.finish();
    this.waveDirector.stop();
    this.greed.stop();

    // Greed multiplies banked loot on successful extract. Death and collapse
    // both forfeit 50% of unbanked loot per the prototype rule. Combo is already
    // baked into pickup values at drop time.
    let scrap = this.runLoot.scrap;
    let cores = this.runLoot.cores;
    let greedMult = 1.0;
    let penaltyApplied = false;
    if (state === 'extracted') {
      greedMult = this.greed.getMultiplier();
      scrap = Math.round(scrap * greedMult);
      cores = Math.round(cores * greedMult);
    } else {
      scrap = Math.floor(scrap * 0.5);
      cores = Math.floor(cores * 0.5);
      penaltyApplied = true;
    }

    Economy.bankLoot(scrap, cores);
    if (cores > 0) {
      const save = saveSystem.get();
      if (!save.firstCoreCollected) {
        save.firstCoreCollected = true;
        save.ftueUnlocks.luckUpgrade = true;
      }
    }
    this.updateFtueProgress(state);
    // Persist immediately on raid-end so the player can't lose loot to a tab
    // close on the summary screen. The 10s autosave and the RAID_ENDED handler
    // both still fire later; this is the belt-and-suspenders save.
    void saveSystem.persist();

    const payload: RaidEndPayload = {
      endState: state,
      loot: { scrap, cores },
      greedMult,
      penaltyApplied,
      tutorial: this.isTutorial,
    };

    // Small delay so the moment's tail visuals finish before the summary appears.
    this.time.delayedCall(120, () => {
      this.scene.launch('SummaryScene', payload);
      this.scene.pause();
    });
  }

  // Centralizes the §5.3 progressive-reveal rules. Called once per raid-end,
  // before the SummaryScene reads the save. The §5.3 table puts a few unlocks
  // on the "X raids completed" axis; raidsCompleted counts the tutorial as
  // raid #1, so the magnet/drone/damage gates compare against >=2/>=3/>=4.
  private updateFtueProgress(state: RaidEndState): void {
    const save = saveSystem.get();
    save.raidsCompleted += 1;
    if (state === 'extracted') save.successfulExtracts += 1;

    if (this.isTutorial && state === 'extracted') {
      save.tutorialDone = true;
      save.ftueUnlocks.dailyClaim = true;
    }

    // Real-raid count (post-tutorial). Reveal milestones key off this number,
    // not raidsCompleted, so a player who never finished the tutorial doesn't
    // accidentally unlock real-raid gates by failing it.
    const realRaids = save.tutorialDone ? Math.max(0, save.raidsCompleted - 1) : 0;
    if (realRaids >= 1) save.ftueUnlocks.magnetUpgrade = true;
    if (realRaids >= 2) save.ftueUnlocks.droneUpgrade = true;
    if (realRaids >= 3) save.ftueUnlocks.damageUpgrade = true;
    if (realRaids >= 5) save.ftueUnlocks.factoryBoost = true;
  }

  // ---- tutorial-only helpers ----

  // Tutorial loop just drives caption timings now - power-up spawns and
  // effects are handled by PowerupSystem in tutorial mode (scripted at
  // §5.4 timestamps).
  private tickTutorial(_dt: number): void {
    const timings = Balance.tutorial.captionTimings;
    for (let i = this.captionDoneIdx + 1; i < timings.length; i++) {
      if (this.elapsed >= timings[i].t) {
        this.captionDoneIdx = i;
        this.showTutorialCaption(timings[i].key);
      } else break;
    }
  }

  private showTutorialCaption(key: TutorialCaptionKey): void {
    const text =
      key === 'move'
        ? Strings.ftueMove
        : key === 'dash'
          ? Strings.ftueDash
          : key === 'powerup'
            ? Strings.ftuePowerup
            : Strings.ftueExtract;
    const t = this.add.text(this.scale.width / 2, 220, text, {
      fontFamily: 'monospace',
      fontSize: '64px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
    });
    t.setOrigin(0.5).setScrollFactor(0).setDepth(2200).setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: 1,
      duration: Balance.tutorial.captionFadeMs,
      ease: 'Cubic.easeOut',
    });
    this.time.delayedCall(Balance.tutorial.captionHoldSec * 1000, () => {
      this.tweens.add({
        targets: t,
        alpha: 0,
        duration: Balance.tutorial.captionFadeMs,
        onComplete: () => t.destroy(),
      });
    });
  }

  private spawnTutorialBanner(): void {
    const banner = this.add.text(this.scale.width / 2, 6, Strings.ftueTutorialBanner, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#888888',
      stroke: '#000000',
      strokeThickness: 2,
    });
    banner.setOrigin(0.5, 0).setScrollFactor(0).setDepth(2050);
    this.tutorialBanner = banner;
  }

  private spawnInitialScrapPile(): void {
    // §5.2 0.0s: "Big arrow points to nearby scrap pile" - we spawn a small
    // visible cluster right next to the player so the player picks it up within
    // the first 2 seconds without needing to chase.
    const offset = Balance.tutorial.initialScrapPileOffset;
    for (let i = 0; i < Balance.tutorial.initialScrapPileCount; i++) {
      const angle = (i / Balance.tutorial.initialScrapPileCount) * Math.PI * 2;
      const x = this.player.x + Math.cos(angle) * offset;
      const y = this.player.y + Math.sin(angle) * offset;
      const p = this.pickups.get(x, y) as Pickup | null;
      if (p) p.spawn(x, y, 'scrap', 1);
    }
  }

  // ---- power-up overlap + chain + instant handlers ----

  private onPowerupOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, powerupObj) => {
    const pup = powerupObj as Powerup;
    if (!pup.active) return;
    const kind = pup.kind;
    const def = PowerupDefs[kind];
    pup.kill();
    this.powerupSystem.activate(kind);
    // §13: every power-up surfaces its label as a popup so the player learns
    // the names without a tooltip.
    this.showPopup(this.player.x, this.player.y - 24, def.label, '#ffd75a');
    bus.emit(Events.POWERUP_COLLECTED, kind);
  };

  // processHit centralizes the per-hit damage path: render -damage popup, run
  // hit() / kill paths, then if Drone Swarm is up, chain to N more enemies
  // within the chain radius.
  private processHit(target: Enemy, damage: number, sourceX: number, sourceY: number): void {
    if (!target.active) return;
    const tx = target.x;
    const ty = target.y;
    const killed = target.hit(damage);
    this.showPopup(tx, ty - 16, `-${Math.round(damage)}`, '#ffffff');
    if (killed) {
      this.particles.enemyDeath(target.kind, tx, ty);
      this.spawnDrops(target);
      target.kill();
      this.onEnemyKilled();
    }

    // Chain (Drone Swarm). Each chain hop deals the same damage; chain count
    // is capped per shot. We chain from the last hit location, not the player,
    // so the tracer visually walks across the field.
    const chains = this.powerupSystem.getChainCount();
    if (chains <= 0) return;
    let fromX = tx;
    let fromY = ty;
    const visited = new Set<Enemy>([target]);
    for (let i = 0; i < chains; i++) {
      const next = this.findChainTarget(fromX, fromY, visited);
      if (!next) break;
      visited.add(next);
      this.weapons.drawTracer(fromX, fromY, next.x, next.y, PowerupDefs.droneSwarm.color);
      const nextX = next.x;
      const nextY = next.y;
      const nextKilled = next.hit(damage);
      this.showPopup(nextX, nextY - 16, `-${Math.round(damage)}`, '#a76cff');
      if (nextKilled) {
        this.particles.enemyDeath(next.kind, nextX, nextY);
        this.spawnDrops(next);
        next.kill();
        this.onEnemyKilled();
      }
      fromX = nextX;
      fromY = nextY;
    }
    // sourceX/sourceY currently unused - reserved if chain logic later wants to
    // gate the FIRST chain on a max-distance-from-player check.
    void sourceX;
    void sourceY;
  }

  private findChainTarget(fromX: number, fromY: number, visited: Set<Enemy>): Enemy | null {
    const radius2 = Balance.powerups.droneSwarmChainRadius * Balance.powerups.droneSwarmChainRadius;
    let best: Enemy | null = null;
    let bestD2 = radius2;
    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (!e.active || visited.has(e)) continue;
      const dx = e.x - fromX;
      const dy = e.y - fromY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  // Signal Nuke (§13 "kills all on-screen enemies"). We use a generous radius
  // around the player rather than reading the camera so a player at the edge
  // of the arena still clears the wave they can see.
  private activateSignalNuke(): void {
    const r2 = Balance.powerups.signalNukeRadius * Balance.powerups.signalNukeRadius;
    this.cameras.main.shake(180, 0.012);
    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (!e.active) continue;
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      if (dx * dx + dy * dy > r2) continue;
      this.particles.enemyDeath(e.kind, e.x, e.y);
      this.spawnDrops(e);
      e.kill();
      this.onEnemyKilled();
    }
    // Also clear in-flight enemy bullets so the nuke feels totally clean.
    for (const child of this.bullets.getChildren()) {
      const b = child as Bullet;
      if (b.active) b.kill();
    }
  }

  // +15 Seconds: just extends the raid timer. The HUD timer rounds up so the
  // bump is visible immediately.
  private activateTimeBonus(): void {
    this.timeRemaining += Balance.powerups.timeBonusSeconds;
  }

  // ---- waypoint target (consumed by HUDScene) ----

  // Priority order: an open extraction pad always wins. Before extraction
  // opens, the tutorial directs the off-screen arrow at the live power-up
  // (if any). Non-tutorial raids return null until extraction opens.
  getWaypointTarget(): WaypointTarget | null {
    if (this.extraction.isOpen()) {
      const pos = this.extraction.getPadPosition();
      return { x: pos.x, y: pos.y, kind: 'extract' };
    }
    if (this.isTutorial) {
      for (const child of this.powerups.getChildren()) {
        const p = child as Powerup;
        if (p.active) return { x: p.x, y: p.y, kind: 'powerup' };
      }
    }
    return null;
  }

  isTutorialRaid(): boolean {
    return this.isTutorial;
  }

  // Read by HUDScene to render the active-power-up strip (timer-bar pips).
  getActivePowerups(): ReturnType<PowerupSystem['getActiveEffectsView']> {
    return this.powerupSystem.getActiveEffectsView();
  }

  // Shield Bubble (§13): HUD renders a small pip when the player holds at
  // least one charge. The charge isn't timed - it lives on the Player.
  getShieldCharges(): number {
    return this.player.shieldCharges;
  }

  private spawnRadialFlash(): void {
    const px = this.player.x;
    const py = this.player.y;

    const flash = this.add.graphics();
    flash.fillStyle(0xffffff, 0.85);
    flash.fillCircle(0, 0, 60);
    flash.setPosition(px, py);
    flash.setDepth(900);
    this.tweens.add({
      targets: flash,
      scaleX: Balance.extraction.momentFlashMaxScale,
      scaleY: Balance.extraction.momentFlashMaxScale,
      alpha: 0,
      duration: Balance.extraction.momentFlashDurationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    const ring = this.add.graphics();
    ring.lineStyle(8, Balance.colors.extraction, 1);
    ring.strokeCircle(0, 0, 90);
    ring.setPosition(px, py);
    ring.setDepth(901);
    this.tweens.add({
      targets: ring,
      scaleX: Balance.extraction.momentRingMaxScale,
      scaleY: Balance.extraction.momentRingMaxScale,
      alpha: 0,
      duration: Balance.extraction.momentRingDurationMs,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
}
