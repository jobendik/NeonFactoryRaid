import Phaser from 'phaser';
import { Strings } from '../config/Strings';
import type { RaidEndPayload, RaidEndState } from '../core/types';

// Run-end summary per blueprint §7.10. Launched by RaidScene as a top-stack overlay
// over a stopped raid. Three buttons:
//   - Factory: stop the raid and start FactoryScene (M8 stub for now).
//   - One More Raid: stop+restart RaidScene for immediate redeploy.
//   - Double Loot: rewarded-ad path, intentionally disabled until M20.
//
// Loot values arrive already-multiplied: greed applied on successful extract,
// 50% penalty applied on failed/collapsed. The badge surfaces which of those
// transforms ran so the player can read the math at a glance.

const TITLE_FOR: Record<RaidEndState, string> = {
  extracted: Strings.summaryExtracted,
  failed: Strings.summaryFailed,
  collapsed: Strings.summaryCollapsed,
};

const TITLE_COLOR: Record<RaidEndState, string> = {
  extracted: '#72ff9f',
  failed: '#ff416b',
  collapsed: '#ffd75a',
};

export class SummaryScene extends Phaser.Scene {
  private endState: RaidEndState = 'collapsed';
  private loot = { scrap: 0, cores: 0 };
  private greedMult = 1.0;
  private penaltyApplied = false;
  private tutorial = false;

  constructor() {
    super({ key: 'SummaryScene' });
  }

  init(data: RaidEndPayload): void {
    if (data) {
      this.endState = data.endState;
      this.loot = { scrap: data.loot.scrap, cores: data.loot.cores };
      this.greedMult = data.greedMult ?? 1.0;
      this.penaltyApplied = !!data.penaltyApplied;
      this.tutorial = !!data.tutorial;
    }
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // Dim backdrop
    const backdrop = this.add.rectangle(0, 0, w, h, 0x000000, 0.78);
    backdrop.setOrigin(0, 0);
    backdrop.setDepth(0);

    // Title
    this.add
      .text(w / 2, h * 0.18, TITLE_FOR[this.endState], {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: TITLE_COLOR[this.endState],
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);

    // Modifier badge: greed mult on extract, penalty notice on fail/collapse.
    if (this.endState === 'extracted' && this.greedMult > 1.0) {
      this.add
        .text(w / 2, h * 0.30, `${Strings.greedLabel}  x${this.greedMult.toFixed(2)}`, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#ffd75a',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
    } else if (this.penaltyApplied) {
      this.add
        .text(w / 2, h * 0.30, Strings.summaryPenalty, {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#ff416b',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
    }

    // Loot card
    const cardY = h * 0.40;
    const cardW = 360;
    const cardH = 150;
    this.add
      .rectangle(w / 2, cardY, cardW, cardH, 0x101820, 0.95)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(2, 0x22f6ff, 0.7);

    this.add
      .text(w / 2 - cardW / 2 + 30, cardY - 36, Strings.summaryScrap, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#22f6ff',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(w / 2 + cardW / 2 - 30, cardY - 36, `+${this.loot.scrap}`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(1, 0.5);

    this.add
      .text(w / 2 - cardW / 2 + 30, cardY + 16, Strings.summaryCores, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffd75a',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(w / 2 + cardW / 2 - 30, cardY + 16, `+${this.loot.cores}`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(1, 0.5);

    // Buttons row. The FTUE tutorial summary collapses to the single "UPGRADE"
    // button per §5.2: the player goes straight back to the factory, no
    // redeploy/double-loot options surfaced until the real first raid.
    const buttonY = h * 0.72;
    if (this.tutorial) {
      this.makeButton(w / 2, buttonY, Strings.summaryUpgrade, 0x22f6ff, '#000000', true, () =>
        this.gotoFactory(),
      );
      return;
    }

    const allowDoubleLoot = false; // M20

    this.makeButton(
      w / 2 - 280,
      buttonY,
      Strings.summaryDoubleLoot,
      allowDoubleLoot ? 0xffd75a : 0x444444,
      allowDoubleLoot ? '#000000' : '#888888',
      allowDoubleLoot,
      () => {
        // M20 - rewarded ad path
      },
    );

    this.makeButton(w / 2, buttonY, Strings.summaryFactory, 0x22f6ff, '#000000', true, () =>
      this.gotoFactory(),
    );

    this.makeButton(
      w / 2 + 280,
      buttonY,
      Strings.summaryRedeploy,
      0x72ff9f,
      '#000000',
      true,
      () => this.redeploy(),
    );
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    bgColor: number,
    textColor: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const bw = 230;
    const bh = 56;
    const bg = this.add.rectangle(x, y, bw, bh, bgColor, enabled ? 1 : 0.55);
    bg.setStrokeStyle(2, 0xffffff, enabled ? 0.85 : 0.25);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(bgColor, 0.85));
      bg.on('pointerout', () => bg.setFillStyle(bgColor, 1));
      bg.on('pointerdown', onClick);
    }
    this.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: textColor,
      })
      .setOrigin(0.5);
  }

  private gotoFactory(): void {
    this.scene.stop('RaidScene');
    this.scene.start('FactoryScene');
    this.scene.stop();
  }

  private redeploy(): void {
    this.scene.stop('RaidScene');
    this.scene.start('RaidScene');
    this.scene.stop();
  }
}
