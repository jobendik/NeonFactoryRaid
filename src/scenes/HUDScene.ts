import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';
import { Economy } from '../systems/EconomySystem';
import { InfestationSystem } from '../systems/InfestationSystem';
import { MuteButton } from '../ui/MuteButton';
import { SettingsMenu } from '../ui/SettingsMenu';
import { AudioBus } from '../audio/AudioBus';
import { QualityManager } from '../systems/QualityManager';
import { saveSystem } from '../platform/SaveSystem';
import { bus, Events } from '../core/EventBus';
import { AchievementDefs, type AchievementId } from '../systems/AchievementSystem';
import type { RaidScene } from './RaidScene';
import type { FactoryScene } from './FactoryScene';

// HUDScene runs as a persistent overlay above whatever gameplay scene is active.
// Through Milestone 8 it switches between two layouts:
//
// Raid mode (§21.1):
//   - HP bar (top-left, cyan, turns red when low)
//   - Run loot (top-right, Scrap and Cores - the in-progress haul)
//   - Raid timer (top-center)
//   - Combo multiplier (below timer, when > 1.0)
//   - Greed multiplier (below combo, prominent yellow when > 1.0)
//   - "EXTRACTION OPEN" banner once the pad becomes available
//   - Off-screen waypoint arrow toward the pad (§7.8)
//
// Factory mode (§21.2):
//   - Persistent wallet (top-right, Scrap and Cores from saveSystem)
//   - SPM display (top-center)
//
// FPS shows in both modes (dev affordance).
//
// State is read via raid.get*() / factory.get*() each frame - the convention
// settled in the M5 gate: scene.get() for per-frame numeric reads, EventBus
// for discrete events.

function formatTime(secs: number): string {
  const total = Math.max(0, Math.ceil(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const HP_BAR_X = 12;
const HP_BAR_Y = 36;
const HP_BAR_W = 220;
const HP_BAR_H = 14;
const HP_LOW_RATIO = 0.30;

// Active-power-up pip strip lives under the HP bar.
const PIP_STRIP_X = 12;
const PIP_STRIP_Y = 60;
const PIP_W = 92;
const PIP_H = 26;
const PIP_GAP = 6;

interface PowerupPip {
  bg: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

export class HUDScene extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private scrapText!: Phaser.GameObjects.Text;
  private coresText!: Phaser.GameObjects.Text;
  // M23 — premium currency display, factory mode only.
  private tokensText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private greedText!: Phaser.GameObjects.Text;
  private extractBanner!: Phaser.GameObjects.Text;
  private waypoint!: Phaser.GameObjects.Graphics;
  private spmText!: Phaser.GameObjects.Text;
  private deployText!: Phaser.GameObjects.Text;
  // M17 cleanse counter, top-right beneath the loot.
  private cleanseText!: Phaser.GameObjects.Text;
  private lastFpsUpdate = 0;
  // Reusable pip slots (allocated once, shown/hidden per frame).
  private powerupPips: PowerupPip[] = [];
  private shieldPip!: PowerupPip;
  private settingsMenu!: SettingsMenu;
  // M21 — performance overlay (§24.5). Hidden by default; backtick toggles.
  private perfOverlay: Phaser.GameObjects.Text | null = null;
  private perfOverlayOn = false;
  // FPS sampling for the rolling auto-detect window.
  private autoDetectAccum = 0;
  // M22 HUD pass — HP flash: red on damage, green on heal. We snapshot the
  // last-frame HP and react to deltas. flashTimer counts down to 0 over a
  // short window where the HP-bar fill color is overridden.
  private lastHp = -1;
  private hpFlashColor = 0;
  private hpFlashTimer = 0;

  constructor() {
    super({ key: 'HUDScene', active: false });
  }

  create(): void {
    const cx = this.scale.width / 2;
    const rightX = this.scale.width - 12;

    this.fpsText = this.add
      .text(HP_BAR_X, 10, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#22f6ff',
      })
      .setScrollFactor(0)
      .setDepth(2000);

    this.hpBarBg = this.add
      .rectangle(HP_BAR_X, HP_BAR_Y, HP_BAR_W, HP_BAR_H, 0x0a1014, 0.9)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 0.6)
      .setScrollFactor(0)
      .setDepth(2000);
    this.hpBarFill = this.add
      .rectangle(HP_BAR_X + 1, HP_BAR_Y + 1, HP_BAR_W - 2, HP_BAR_H - 2, Balance.colors.player, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2001);
    this.hpText = this.add
      .text(HP_BAR_X + HP_BAR_W / 2, HP_BAR_Y + HP_BAR_H / 2, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2002);

    this.scrapText = this.add
      .text(rightX, 14, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#22f6ff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2000);
    this.coresText = this.add
      .text(rightX, 38, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffd75a',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2000);

    // M23 — Neon Tokens wallet display, factory mode only. Renders below
    // cores when the player has any tokens or when the premium store is
    // surfaced via the cosmetics menu.
    this.tokensText = this.add
      .text(rightX, 62, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#a76cff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setVisible(false);

    this.timerText = this.add
      .text(cx, 18, '', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);

    // Combo sits just under the raid timer. Smaller / dimmer than greed so
    // the eye reads the prominent yellow badge first. M22: anchor below the
    // timer rather than to its side so the badges always have vertical
    // headroom on narrow viewports.
    this.comboText = this.add
      .text(cx, 52, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ffd75a',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);

    // Greed badge per M14: bigger, brighter, with a contrasting background
    // pill. M22: stacked directly below combo so a narrow viewport never
    // collides the two readouts. Both center-aligned to the timer.
    this.greedText = this.add
      .text(cx, 74, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffd75a',
        stroke: '#000000',
        strokeThickness: 5,
        backgroundColor: '#1a0a14',
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);

    this.extractBanner = this.add
      .text(cx, 112, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#72ff9f',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);

    this.waypoint = this.add.graphics();
    this.waypoint.setScrollFactor(0).setDepth(2000).setVisible(false);

    this.spmText = this.add
      .text(cx, 18, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#22f6ff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setVisible(false);

    this.deployText = this.add
      .text(cx, this.scale.height - 28, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#72ff9f',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setVisible(false);

    this.cleanseText = this.add
      .text(rightX, 64, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ff416b',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setVisible(false);

    // Pool of pip slots for timed power-ups. We allocate up to the same cap
    // as PowerupSystem.active can hold (one per distinct kind = 4 timed
    // entries today). Anything beyond that just stops rendering.
    for (let i = 0; i < 4; i++) this.powerupPips.push(this.makePip(i));
    this.shieldPip = this.makePip(0);

    // MuteButton's constructor wires itself into the scene; we don't need
    // to keep a handle (the redraw callback runs from its own pointer listener).
    void new MuteButton(this);
    this.buildSettingsButton();
    this.settingsMenu = new SettingsMenu(this);

    // Browsers refuse to start AudioContext until a user gesture. We listen
    // game-wide for the first pointer/key event and call resume(); after
    // that, sfx + music can play freely.
    const unlock = (): void => {
      AudioBus.resume();
      this.input.off('pointerdown', unlock);
      const keyboard = this.input.keyboard;
      if (keyboard) keyboard.off('keydown', unlock);
    };
    this.input.on('pointerdown', unlock);
    const keyboard = this.input.keyboard;
    if (keyboard) keyboard.on('keydown', unlock);

    // M21 — performance overlay toggle (backtick). Pure dev tool; left in
    // production but undocumented per §24.5.
    this.perfOverlay = this.add
      .text(this.scale.width - 12, this.scale.height - 12, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#88a0a8',
        backgroundColor: '#0a1014',
        padding: { x: 8, y: 6 },
        align: 'right',
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(2400)
      .setVisible(false);
    if (keyboard) {
      keyboard.on('keydown-BACKTICK', () => this.togglePerfOverlay());
      // M24 — ESC opens the SettingsMenu so the player has a pause /
      // settings affordance from the keyboard. The SettingsMenu's modal
      // backdrop blocks input to the gameplay scene beneath it.
      keyboard.on('keydown-ESC', () => {
        if (this.settingsMenu.isOpen()) this.settingsMenu.close();
        else this.settingsMenu.open();
      });
    }

    // M23 — achievement unlock toast bridge. AchievementSystem emits
    // ACHIEVEMENT_UNLOCKED with the id; HUDScene composes the toast
    // copy from AchievementDefs so the system is self-contained.
    bus.on(Events.ACHIEVEMENT_UNLOCKED, (...args: unknown[]) => {
      const id = args[0] as AchievementId | undefined;
      if (!id) return;
      const def = AchievementDefs[id];
      if (!def) return;
      this.showAchievementToast(`${Strings.achievementUnlockedPrefix}${def.name}`);
    });
  }

  private showAchievementToast(text: string): void {
    const t = this.add
      .text(this.scale.width / 2, 100, text, {
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
      .setDepth(2250)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: 120,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
    this.time.delayedCall(3800, () => {
      this.tweens.add({
        targets: t,
        alpha: 0,
        duration: 500,
        onComplete: () => t.destroy(),
      });
    });
  }

  private togglePerfOverlay(): void {
    this.perfOverlayOn = !this.perfOverlayOn;
    if (this.perfOverlay) this.perfOverlay.setVisible(this.perfOverlayOn);
  }

  // Gear icon to the left of the mute button. Opens the SettingsMenu modal.
  private buildSettingsButton(): void {
    const size = 22;
    const padding = 12;
    const x = this.scale.width - padding - size - 8 - size;
    const y = padding;
    const g = this.add.graphics().setScrollFactor(0).setDepth(2300);
    g.setPosition(x + size / 2, y + size / 2);
    g.fillStyle(0x101820, 0.85);
    g.fillCircle(0, 0, size / 2);
    g.lineStyle(1.5, 0xffffff, 0.85);
    g.strokeCircle(0, 0, size / 2);
    // Cog teeth - 8 small lines radiating outward.
    g.lineStyle(2, 0xffffff, 0.95);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const inner = size / 2 - 5;
      const outer = size / 2 + 2;
      g.lineBetween(Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * outer, Math.sin(a) * outer);
    }
    g.lineStyle(1.5, 0xffffff, 0.85);
    g.strokeCircle(0, 0, 4);
    // The graphics object isn't held - it lives on the scene's display list
    // for the rest of the session. The hit zone owns the click handler.
    void g;

    const hit = this.add
      .zone(x, y, size, size)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2300)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (this.settingsMenu.isOpen()) this.settingsMenu.close();
      else this.settingsMenu.open();
    });
  }

  private makePip(index: number): PowerupPip {
    const x = PIP_STRIP_X + index * (PIP_W + PIP_GAP);
    const bg = this.add
      .rectangle(x, PIP_STRIP_Y, PIP_W, PIP_H, 0x0a1014, 0.9)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 0.55)
      .setScrollFactor(0)
      .setDepth(2000)
      .setVisible(false);
    const fill = this.add
      .rectangle(x + 1, PIP_STRIP_Y + PIP_H - 4, PIP_W - 2, 3, 0xffffff, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2001)
      .setVisible(false);
    const text = this.add
      .text(x + PIP_W / 2, PIP_STRIP_Y + (PIP_H - 4) / 2, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2002)
      .setVisible(false);
    return { bg, fill, text };
  }

  override update(time: number, deltaMs: number): void {
    const fps = this.game.loop.actualFps;
    if (time - this.lastFpsUpdate > Balance.ui.fpsUpdateMs) {
      this.lastFpsUpdate = time;
      this.fpsText.setText(`${Strings.fps}: ${Math.round(fps)}`);
    }

    // M21 — auto-detect tick + optional toast on preset change.
    const dt = Math.min(0.1, deltaMs / 1000);
    const toast = QualityManager.tick(dt, fps);
    if (toast) this.showAutoQualityToast(toast);

    // M21 — performance overlay refresh (1/4-second cadence so the text
    // doesn't flicker; same cadence as FPS).
    if (this.perfOverlayOn && time - this.autoDetectAccum > 250) {
      this.autoDetectAccum = time;
      this.renderPerfOverlay(fps);
    }

    const raid = this.scene.get('RaidScene') as RaidScene | undefined;
    if (raid && raid.scene.isActive()) {
      this.renderRaid(raid);
      return;
    }

    const factory = this.scene.get('FactoryScene') as FactoryScene | undefined;
    if (factory && factory.scene.isActive()) {
      this.renderFactory(factory);
      return;
    }

    this.clearRaidHud();
  }

  // M21 — small bottom-center toast surfaced when QualityManager auto-changes
  // preset or unlocks the upgrade prompt. Mirrors the offline-scrap toast in
  // FactoryScene visually so the player sees the same affordance.
  private showAutoQualityToast(text: string): void {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height - 40, text, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#22f6ff',
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: '#0a1014',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(2350)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: this.scale.height - 60,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
    this.time.delayedCall(3500, () => {
      this.tweens.add({
        targets: t,
        alpha: 0,
        duration: 500,
        onComplete: () => t.destroy(),
      });
    });
  }

  private renderPerfOverlay(fps: number): void {
    if (!this.perfOverlay) return;
    const raid = this.scene.get('RaidScene') as RaidScene | undefined;
    let enemyCount = 0;
    let pickupCount = 0;
    let bulletCount = 0;
    let powerupCount = 0;
    if (raid && raid.scene.isActive()) {
      const counts = raid.getEntityCounts();
      enemyCount = counts.enemies;
      pickupCount = counts.pickups;
      bulletCount = counts.bullets;
      powerupCount = counts.powerups;
    }
    const preset = QualityManager.getPreset();
    const dpr = QualityManager.dprCap();
    const ft = fps > 0 ? (1000 / fps).toFixed(1) : '—';
    const lines = [
      `FPS:    ${Math.round(fps)}  (${ft} ms)`,
      `Enem:   ${enemyCount}`,
      `Pick:   ${pickupCount}`,
      `Bull:   ${bulletCount}`,
      `Pow:    ${powerupCount}`,
      `Qual:   ${preset.toUpperCase()}`,
      `DPRcap: ${dpr.toFixed(1)}`,
    ];
    this.perfOverlay.setText(lines.join('\n'));
  }

  private renderRaid(raid: RaidScene): void {
    if (this.spmText.visible) this.spmText.setVisible(false);
    if (this.deployText.visible) this.deployText.setVisible(false);
    if (this.tokensText.visible) this.tokensText.setVisible(false);

    const hpInfo = raid.getPlayerHP();
    const ratio = hpInfo.max > 0 ? Math.max(0, hpInfo.hp / hpInfo.max) : 0;
    // M22 HP flash — detect delta vs last frame. Heal → green, damage → red.
    // Tutorial / first-frame initializes lastHp without flashing.
    if (this.lastHp >= 0 && hpInfo.hp !== this.lastHp) {
      const delta = hpInfo.hp - this.lastHp;
      if (delta < 0) {
        this.hpFlashColor = 0xff416b;
        this.hpFlashTimer = 0.22;
      } else if (delta > 0) {
        this.hpFlashColor = 0x72ff9f;
        this.hpFlashTimer = 0.22;
      }
    }
    this.lastHp = hpInfo.hp;
    let fillColor: number = ratio <= HP_LOW_RATIO ? Balance.colors.danger : Balance.colors.player;
    if (this.hpFlashTimer > 0) {
      fillColor = this.hpFlashColor;
      this.hpFlashTimer = Math.max(0, this.hpFlashTimer - this.game.loop.delta / 1000);
    }
    this.hpBarFill.setSize(Math.max(0, (HP_BAR_W - 2) * ratio), HP_BAR_H - 2);
    this.hpBarFill.setFillStyle(fillColor, 1);
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true);
    this.hpText.setText(`${Strings.hpLabel} ${Math.ceil(hpInfo.hp)} / ${hpInfo.max}`);
    this.hpText.setVisible(true);

    const loot = raid.getRunLoot();
    this.scrapText.setText(`${Strings.summaryScrap} ${loot.scrap}`);
    this.coresText.setText(`${Strings.summaryCores} ${loot.cores}`);

    this.timerText.setText(`${Strings.timerLabel}  ${formatTime(raid.getTimeRemaining())}`);
    const combo = raid.getCombo();
    if (combo > 1.01) {
      this.comboText.setText(`${Strings.comboLabel} x${combo.toFixed(2)}`);
    } else {
      this.comboText.setText('');
    }

    const greed = raid.getGreedInfo();
    if (greed.active && greed.mult > 1.0) {
      this.greedText.setText(`${Strings.greedLabel}  x${greed.mult.toFixed(2)}`).setVisible(true);
    } else {
      this.greedText.setText('').setVisible(false);
    }

    const ext = raid.getExtractionInfo();
    if (ext.open) {
      this.extractBanner.setText(Strings.extractionOpened);
    } else {
      this.extractBanner.setText('');
    }

    // Off-screen waypoint per §7.8 - target is owned by RaidScene so the FTUE
    // tutorial can swap it between an active power-up and the extraction pad.
    const wp = raid.getWaypointTarget();
    if (wp) {
      const color = wp.kind === 'powerup' ? Balance.colors.reward : Balance.colors.extraction;
      this.drawWaypoint(raid, wp.x, wp.y, color);
    } else {
      this.waypoint.setVisible(false);
    }

    this.renderPowerupStrip(raid);

    // M17 cleanse counter — visible whenever the player has any infested
    // machines OR has cleanse progress this raid. Pluralizes the machine
    // count so "1 machine" reads correctly.
    const cleanse = raid.getCleanseInfo();
    if (cleanse.active) {
      const noun = cleanse.infestedRemaining === 1 ? 'machine' : 'machines';
      const txt = `${Strings.infestationCleansingPrefix}${cleanse.progressInWindow}${Strings.infestationCleansingMid}${cleanse.perMachine} — ${cleanse.infestedRemaining} ${noun}`;
      this.cleanseText.setText(txt).setVisible(true);
    } else {
      this.cleanseText.setVisible(false);
    }
  }

  private renderPowerupStrip(raid: RaidScene): void {
    const active = raid.getActivePowerups();
    const shieldCharges = raid.getShieldCharges();

    // Timed pips
    for (let i = 0; i < this.powerupPips.length; i++) {
      const pip = this.powerupPips[i];
      const eff = active[i];
      if (!eff) {
        pip.bg.setVisible(false);
        pip.fill.setVisible(false);
        pip.text.setVisible(false);
        continue;
      }
      pip.bg.setVisible(true).setStrokeStyle(1, eff.color, 0.9);
      pip.fill.setVisible(true).setFillStyle(eff.color, 1);
      const ratio = Math.max(0, Math.min(1, eff.remaining / Math.max(0.001, eff.total)));
      pip.fill.setSize(Math.max(0, (PIP_W - 2) * ratio), 3);
      pip.text.setVisible(true).setText(`${eff.iconText}  ${eff.remaining.toFixed(1)}s`);
    }

    // Shield pip - drawn to the right of any active timed effects.
    if (shieldCharges > 0) {
      const slotIdx = active.length;
      const sx = PIP_STRIP_X + slotIdx * (PIP_W + PIP_GAP);
      this.shieldPip.bg.setPosition(sx, PIP_STRIP_Y).setVisible(true).setStrokeStyle(1, 0xffffff, 0.9);
      this.shieldPip.fill.setPosition(sx + 1, PIP_STRIP_Y + PIP_H - 4).setVisible(true).setFillStyle(0xffffff, 1);
      this.shieldPip.fill.setSize(PIP_W - 2, 3);
      this.shieldPip.text
        .setPosition(sx + PIP_W / 2, PIP_STRIP_Y + (PIP_H - 4) / 2)
        .setVisible(true)
        .setText(`SHLD x${shieldCharges}`);
    } else {
      this.shieldPip.bg.setVisible(false);
      this.shieldPip.fill.setVisible(false);
      this.shieldPip.text.setVisible(false);
    }
  }

  private hideAllPips(): void {
    for (const pip of this.powerupPips) {
      pip.bg.setVisible(false);
      pip.fill.setVisible(false);
      pip.text.setVisible(false);
    }
    this.shieldPip.bg.setVisible(false);
    this.shieldPip.fill.setVisible(false);
    this.shieldPip.text.setVisible(false);
  }

  private renderFactory(factory: FactoryScene): void {
    // Hide raid-only widgets.
    this.timerText.setText('');
    this.comboText.setText('');
    this.greedText.setText('').setVisible(false);
    this.extractBanner.setText('');
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
    this.hpText.setText('');
    this.hpText.setVisible(false);
    this.waypoint.setVisible(false);
    this.hideAllPips();
    if (this.cleanseText) this.cleanseText.setVisible(false);
    void InfestationSystem; // imported for future "infested HP bar" hook

    const wallet = Economy.getWallet();
    this.scrapText.setText(`${Strings.summaryScrap} ${wallet.scrap}`);
    this.coresText.setText(`${Strings.summaryCores} ${wallet.cores}`);
    // M23 — token wallet display. Shown only on factory mode; raid HUD
    // suppresses it (no token spend during raids).
    const tokens = saveSystem.get().tokens ?? 0;
    if (tokens > 0) {
      this.tokensText.setText(`${Strings.walletTokens} ${tokens}`).setVisible(true);
    } else {
      this.tokensText.setVisible(false);
    }

    const spm = factory.getSpm();
    this.spmText.setText(`${Strings.factorySpm}  ${spm.toFixed(0)}`);
    this.spmText.setVisible(true);

    // Light hint when the player is hovering on the deploy pad.
    const hold = factory.getDeployHoldRatio();
    if (hold > 0) {
      this.deployText.setText(Strings.factoryDeployHint);
      this.deployText.setVisible(true);
    } else {
      this.deployText.setVisible(false);
    }
  }

  private clearRaidHud(): void {
    this.timerText.setText('');
    this.comboText.setText('');
    this.greedText.setText('').setVisible(false);
    this.extractBanner.setText('');
    this.scrapText.setText('');
    this.coresText.setText('');
    this.hpText.setText('');
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
    this.hpText.setVisible(false);
    this.waypoint.setVisible(false);
    if (this.spmText) this.spmText.setVisible(false);
    if (this.deployText) this.deployText.setVisible(false);
    if (this.cleanseText) this.cleanseText.setVisible(false);
    if (this.tokensText) this.tokensText.setVisible(false);
    if (this.shieldPip) this.hideAllPips();
  }

  private drawWaypoint(raid: RaidScene, padX: number, padY: number, color: number = Balance.colors.extraction): void {
    const cam = raid.cameras.main;
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const padScreenX = padX - cam.scrollX;
    const padScreenY = padY - cam.scrollY;

    const inset = 40;
    if (
      padScreenX >= inset &&
      padScreenX <= viewW - inset &&
      padScreenY >= inset &&
      padScreenY <= viewH - inset
    ) {
      this.waypoint.setVisible(false);
      return;
    }

    const cx = viewW / 2;
    const cy = viewH / 2;
    const dx = padScreenX - cx;
    const dy = padScreenY - cy;
    const angle = Math.atan2(dy, dx);
    const margin = Balance.extraction.waypointEdgeMargin;
    const halfW = viewW / 2 - margin;
    const halfH = viewH / 2 - margin;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const tx = Math.abs(cosA) > 1e-6 ? halfW / Math.abs(cosA) : Number.POSITIVE_INFINITY;
    const ty = Math.abs(sinA) > 1e-6 ? halfH / Math.abs(sinA) : Number.POSITIVE_INFINITY;
    const t = Math.min(tx, ty);
    const ax = cx + cosA * t;
    const ay = cy + sinA * t;

    const size = Balance.extraction.waypointSize;
    const localPts: Array<[number, number]> = [
      [size, 0],
      [-size * 0.6, -size * 0.7],
      [-size * 0.25, 0],
      [-size * 0.6, size * 0.7],
    ];
    this.waypoint.clear();
    this.waypoint.setVisible(true);
    this.waypoint.fillStyle(color, 1);
    // M22 — thicker stroke so the arrow reads cleanly against the busiest
    // backgrounds (especially the deep-end greed vignette).
    this.waypoint.lineStyle(3, 0xffffff, 1);
    this.waypoint.beginPath();
    for (let i = 0; i < localPts.length; i++) {
      const pt = localPts[i];
      const lx = pt[0];
      const ly = pt[1];
      const sx = ax + lx * cosA - ly * sinA;
      const sy = ay + lx * sinA + ly * cosA;
      if (i === 0) this.waypoint.moveTo(sx, sy);
      else this.waypoint.lineTo(sx, sy);
    }
    this.waypoint.closePath();
    this.waypoint.fillPath();
    this.waypoint.strokePath();
  }
}
