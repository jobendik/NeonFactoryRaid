import Phaser from 'phaser';
import { saveSystem } from '../platform/SaveSystem';
import { Economy } from '../systems/EconomySystem';
import { UpgradeEffects } from '../systems/UpgradeSystem';
import { Balance } from '../config/Balance';
import { SDKBridge } from '../platform/SDKBridge';
import { bus, Events } from '../core/EventBus';
import type { RaidEndPayload, RaidEndState } from '../core/types';

import { ScrapyardRenderer } from '../scrapyard/ScrapyardRenderer';
import { FPSCamera } from '../scrapyard/FPSCamera';
import { FPSController } from '../scrapyard/FPSController';
import { ScrapyardArena } from '../scrapyard/ScrapyardArena';
import { ScrapyardEnemySystem } from '../scrapyard/ScrapyardEnemySystem';
import { ScrapyardLoot } from '../scrapyard/ScrapyardLoot';
import { ScrapyardExtraction } from '../scrapyard/ScrapyardExtraction';
import { ScrapyardWeapon } from '../scrapyard/ScrapyardWeapon';
import { ScrapyardParticles } from '../scrapyard/ScrapyardParticles';
import { ScrapyardAudio } from '../scrapyard/ScrapyardAudio';
import { ScrapyardHUD } from '../scrapyard/ScrapyardHUD';
import '../scrapyard/scrapyard.css';

type ScrapyardState = 'IN_MATCH' | 'EXTRACTING' | 'ENDED';

// ScrapyardScene orchestrates the 3D FPS mode. It boots Three.js on a DOM
// canvas overlaid on top of Phaser's canvas (which is hidden while active),
// drives the FPS systems each frame, and hands the resulting loot off to
// the existing SummaryScene so the rest of the meta-game stack (save,
// economy, quests) treats it identically to a top-down raid.
export class ScrapyardScene extends Phaser.Scene {
  private renderer3D!: ScrapyardRenderer;
  private fpsCamera!: FPSCamera;
  private fpsCtrl!: FPSController;
  private arena!: ScrapyardArena;
  private enemies!: ScrapyardEnemySystem;
  private loot!: ScrapyardLoot;
  private extraction!: ScrapyardExtraction;
  private weapon!: ScrapyardWeapon;
  private particles!: ScrapyardParticles;
  private audio3D!: ScrapyardAudio;
  private hud!: ScrapyardHUD;

  private state: ScrapyardState = 'IN_MATCH';
  private matchTime = 0;
  private killCount = 0;
  private unbankedScrap = 0;
  private phaserCanvasDisplay = '';

  constructor() {
    super({ key: 'ScrapyardScene' });
  }

  create(): void {
    // Hide Phaser's canvas while the 3D mode is active so the Three.js
    // canvas underneath isn't obscured. The Phaser scene is still ticking,
    // just invisible.
    const phaserCanvas = this.game.canvas;
    this.phaserCanvasDisplay = phaserCanvas.style.display;
    phaserCanvas.style.display = 'none';

    // ── Audio ──
    this.audio3D = new ScrapyardAudio();
    this.audio3D.init();

    // ── HUD (also creates the canvas container DOM element) ──
    // We need a placeholder HUD reference before the systems exist because
    // some of them set callbacks into it. We'll wire systems after init.
    this.fpsCamera = new FPSCamera();
    this.fpsCamera.init();

    this.fpsCtrl = new FPSController(this.fpsCamera);

    // ── Renderer ──
    this.renderer3D = new ScrapyardRenderer();
    // Container is created via the HUD; we make a temp DOM div now and
    // the HUD reuses it. Order: create container → init renderer →
    // build HUD overlay.
    let container = document.getElementById('scrapyard-canvas-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'scrapyard-canvas-container';
      document.body.appendChild(container);
    }
    this.renderer3D.init(container);

    this.fpsCtrl.init(this.renderer3D);

    // ── World ──
    this.arena = new ScrapyardArena(this.renderer3D.scene);
    this.arena.generate();
    this.fpsCtrl.setColliders(this.arena.getColliders());

    // ── Particles ──
    this.particles = new ScrapyardParticles(this.renderer3D.scene, this.renderer3D.camera);
    this.particles.init();

    // ── Enemies ──
    this.enemies = new ScrapyardEnemySystem(
      this.renderer3D.scene,
      this.fpsCtrl,
      this.audio3D,
      this.particles,
    );
    this.enemies.init();
    this.enemies.reset(this.arena.getSpawnPoints());
    this.enemies.onKill = (): void => {
      this.killCount++;
      // Suggestions audit: fire ENEMY_KILLED so daily quests / missions /
      // achievements progress from Scrapyard runs too. No kind data — the
      // FPS enemies don't map onto the top-down EnemyKind taxonomy, so
      // mission rules that key on kind (e.g., killSwarmers) won't tick from
      // 3D. Generic "kill 50 enemies" quests will.
      bus.emit(Events.ENEMY_KILLED, { kind: 'fps' });
    };
    this.enemies.onLootDrop = (pos, count): void => this.loot.spawnLoot(pos, count);

    // ── Loot ──
    this.loot = new ScrapyardLoot(this.renderer3D.scene, this.fpsCtrl, this.audio3D, this.particles);
    this.loot.init();
    this.loot.reset();
    this.loot.onCollect = (value): void => {
      this.unbankedScrap += value;
    };
    // Magnet upgrade applies — convert 2D pixel radius to ~world units.
    // The top-down magnet radius is ~130-220px; mapping that into the 3D
    // arena (~50 units wide) gives ~3-5 units which feels right.
    const radius2D = UpgradeEffects.magnetRadius();
    this.loot.setMagnetRadius(3.0 + Math.max(0, (radius2D - Balance.magnet.baseRadius) / 60));

    // ── Extraction ──
    this.extraction = new ScrapyardExtraction(this.renderer3D.scene, this.fpsCtrl, this.audio3D);
    this.extraction.init();
    this.extraction.reset(this.arena.getExtractionPosition());
    this.extraction.onExtract = (): void => {
      // Fire EXTRACTION_COMPLETE so daily-quest "extract 2 times today"
      // progresses from FPS extractions.
      bus.emit(Events.EXTRACTION_COMPLETE);
      this.finishMatch('extracted');
    };
    this.extraction.onZoneChange = (inside): void => {
      this.state = inside ? 'EXTRACTING' : 'IN_MATCH';
    };

    // ── Weapon ──
    this.weapon = new ScrapyardWeapon(
      this.renderer3D.camera,
      this.renderer3D.scene,
      this.fpsCtrl,
      this.fpsCamera,
      this.enemies,
      this.particles,
      this.audio3D,
      this.arena.getWallMeshes(),
      { onHitMarker: () => this.hud.showHitMarker() },
    );
    this.weapon.init();

    // ── Apply shared upgrade stats ──
    const dmgLvl = UpgradeEffects.weaponDamageLevel();
    this.weapon.applyUpgrades({
      weaponDamage: dmgLvl * Balance.weapon.damagePerLevel,
    });
    const hp2D = UpgradeEffects.playerMaxHp();
    const speed2D = UpgradeEffects.playerSpeed();
    this.fpsCtrl.applyUpgrades({
      maxHP: Math.max(0, hp2D - Balance.player.baseHP),
      moveSpeed: Math.max(0, (speed2D - Balance.player.baseSpeed) / 60),
    });

    // ── Player spawn + death wiring ──
    this.fpsCtrl.reset(this.arena.getPlayerSpawn());
    this.fpsCtrl.onDamage = (_amount): void => {
      this.hud.showDamageVignette();
      this.audio3D.playerDamage();
    };
    this.fpsCtrl.onDeath = (): void => this.finishMatch('failed');

    // ── HUD (build DOM, attach to systems) ──
    this.hud = new ScrapyardHUD(this.fpsCtrl, this.weapon, this.extraction, this.renderer3D.camera);
    this.hud.init();
    this.hud.onExitRequested = (): void => {
      // Voluntary exit treated as a "collapsed" run — half loot penalty.
      this.finishMatch('collapsed');
    };

    // ── Reset run state ──
    this.matchTime = 0;
    this.killCount = 0;
    this.unbankedScrap = 0;
    this.state = 'IN_MATCH';

    SDKBridge.gameplayStart();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.state === 'ENDED') return;
    const dt = Math.min(0.05, deltaMs / 1000);
    this.matchTime += dt;

    // Camera readouts the HUD needs each frame.
    this.fpsCamera.isMoving = this.fpsCtrl.isMoving;
    this.fpsCamera.isSprinting = this.fpsCtrl.isSprinting;

    // ── Order: player → camera → world systems → particles → render ──
    this.fpsCtrl.update(dt, this.renderer3D.camera);
    this.fpsCamera.update(dt, this.renderer3D.camera);
    this.weapon.update(dt);
    this.enemies.update(dt);
    this.loot.update(dt);
    this.extraction.update(dt);
    this.particles.update(dt);

    // ── HUD ──
    this.hud.unbankedLoot = this.unbankedScrap;
    this.hud.killCount = this.killCount;
    this.hud.matchTime = this.matchTime;
    this.hud.update(dt);

    this.renderer3D.render();
  }

  /**
   * End the FPS run and hand off to SummaryScene. Identical payload shape
   * to a top-down raid so SummaryScene + the meta-systems behind it work
   * unchanged.
   */
  private finishMatch(endState: RaidEndState): void {
    if (this.state === 'ENDED') return;
    this.state = 'ENDED';
    SDKBridge.gameplayStop();

    // Loot math — match the top-down rule: extracted banks gross, fail/collapse
    // halves the unbanked total. No greed system in scrapyard mode (yet) so
    // greedMult is always 1.0.
    let scrap = this.unbankedScrap;
    let penaltyApplied = false;
    if (endState !== 'extracted') {
      scrap = Math.floor(scrap * 0.5);
      penaltyApplied = true;
    }
    Economy.bankLoot(scrap, 0);

    // Persist scrapyard stats so the FactoryScene can show "best run" etc.
    const save = saveSystem.get();
    save.scrapyardStats.runs += 1;
    if (endState === 'extracted') save.scrapyardStats.extracts += 1;
    save.scrapyardStats.kills += this.killCount;
    if (scrap > save.scrapyardStats.bestLoot) save.scrapyardStats.bestLoot = scrap;
    void saveSystem.persist();

    const payload: RaidEndPayload & { scrapyard?: boolean } = {
      endState,
      loot: { scrap, cores: 0 },
      greedMult: 1.0,
      penaltyApplied,
      tutorial: false,
      newlyInfested: 0,
      machinesRestored: 0,
      allowDoubleLoot: endState === 'extracted',
      scrapyard: true,
    };

    if (endState === 'extracted') this.audio3D.extractionSuccess();

    this.time.delayedCall(180, () => {
      this.teardown();
      this.scene.launch('SummaryScene', payload);
      this.scene.stop();
    });
  }

  shutdown(): void {
    this.teardown();
  }

  private teardown(): void {
    this.weapon?.dispose();
    this.fpsCtrl?.dispose();
    this.fpsCamera?.dispose();
    this.extraction?.dispose();
    this.renderer3D?.dispose();
    this.hud?.dispose();
    this.audio3D?.dispose();

    // Restore Phaser's canvas display.
    const phaserCanvas = this.game.canvas;
    if (phaserCanvas) phaserCanvas.style.display = this.phaserCanvasDisplay;
  }
}
