import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';
import type { RaidScene } from './RaidScene';

// HUDScene runs as a persistent overlay above whatever gameplay scene is active.
// Through Milestone 6 it shows:
//   - FPS (top-left, dev affordance)
//   - Raid timer (top-center)
//   - Combo multiplier (top-center, only when > 1.0)
//   - "EXTRACTION OPEN" banner once the pad becomes available
//   - Off-screen waypoint arrow pointing at the pad when extraction is open and
//     the pad would otherwise be out of view (per §7.8).
//
// HP bar / loot counter / greed widget land in Milestone 7 alongside the proper HUD design.
// The waypoint reads RaidScene state via scene.get() each frame (the convention
// settled in the M5 gate for per-frame numeric reads; EventBus stays for discrete events).

function formatTime(secs: number): string {
  const total = Math.max(0, Math.ceil(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class HUDScene extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private extractBanner!: Phaser.GameObjects.Text;
  private waypoint!: Phaser.GameObjects.Graphics;
  private lastFpsUpdate = 0;

  constructor() {
    super({ key: 'HUDScene', active: false });
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.fpsText = this.add
      .text(12, 10, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#22f6ff',
      })
      .setScrollFactor(0)
      .setDepth(2000);

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

    this.comboText = this.add
      .text(cx, 52, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffd75a',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);

    this.extractBanner = this.add
      .text(cx, 80, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#72ff9f',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);

    this.waypoint = this.add.graphics();
    this.waypoint.setScrollFactor(0).setDepth(2000).setVisible(false);
  }

  override update(time: number): void {
    if (time - this.lastFpsUpdate > Balance.ui.fpsUpdateMs) {
      this.lastFpsUpdate = time;
      const fps = Math.round(this.game.loop.actualFps);
      this.fpsText.setText(`${Strings.fps}: ${fps}`);
    }

    const raid = this.scene.get('RaidScene') as RaidScene | undefined;
    if (!raid || !raid.scene.isActive()) {
      this.timerText.setText('');
      this.comboText.setText('');
      this.extractBanner.setText('');
      this.waypoint.setVisible(false);
      return;
    }
    this.timerText.setText(`${Strings.timerLabel}  ${formatTime(raid.getTimeRemaining())}`);
    const combo = raid.getCombo();
    if (combo > 1.01) {
      this.comboText.setText(`${Strings.comboLabel} x${combo.toFixed(2)}`);
    } else {
      this.comboText.setText('');
    }

    const ext = raid.getExtractionInfo();
    if (ext.open) {
      this.extractBanner.setText(Strings.extractionOpened);
      this.drawWaypoint(raid, ext.padX, ext.padY);
    } else {
      this.extractBanner.setText('');
      this.waypoint.setVisible(false);
    }
  }

  private drawWaypoint(raid: RaidScene, padX: number, padY: number): void {
    const cam = raid.cameras.main;
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const padScreenX = padX - cam.scrollX;
    const padScreenY = padY - cam.scrollY;

    // If the pad is already on-screen with some margin, no waypoint needed.
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

    // Project to the screen edge in the direction of the pad.
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
    // Rotate the arrow's local-space vertices into screen space manually so we
    // never mutate the Graphics canvas transform (which is global to the object).
    const localPts: Array<[number, number]> = [
      [size, 0],
      [-size * 0.6, -size * 0.7],
      [-size * 0.25, 0],
      [-size * 0.6, size * 0.7],
    ];
    this.waypoint.clear();
    this.waypoint.setVisible(true);
    this.waypoint.fillStyle(Balance.colors.extraction, 1);
    this.waypoint.lineStyle(2, 0xffffff, 0.9);
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
