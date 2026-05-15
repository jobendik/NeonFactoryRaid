import Phaser from 'phaser';
import { UpgradeDefs, nextMilestone, type UpgradeKey } from '../config/UpgradeDefs';
import { UpgradeSystem } from '../systems/UpgradeSystem';

// Upgrade card per blueprint §21.4. Each card renders the four lines the
// blueprint mandates: label, level transition, next-milestone hint, cost.
// The card subscribes to nothing - it's pulled by the panel each refresh().

const CARD_W = 280;
const CARD_H = 86;
const PADDING = 10;

export class UpgradeCard {
  private key: UpgradeKey;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private labelText: Phaser.GameObjects.Text;
  private levelText: Phaser.GameObjects.Text;
  private milestoneText: Phaser.GameObjects.Text;
  private buyBg: Phaser.GameObjects.Rectangle;
  private buyText: Phaser.GameObjects.Text;
  private onPurchase?: () => void;

  constructor(scene: Phaser.Scene, key: UpgradeKey, x: number, y: number) {
    this.key = key;
    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0).setDepth(2000);

    this.bg = scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x101820, 0.92);
    this.bg.setStrokeStyle(1, 0x22f6ff, 0.55);
    this.bg.setOrigin(0, 0);

    this.labelText = scene.add.text(PADDING, PADDING, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#22f6ff',
    });

    this.levelText = scene.add.text(PADDING, PADDING + 22, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
    });

    this.milestoneText = scene.add.text(PADDING, PADDING + 42, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#888888',
    });

    const buyW = 86;
    const buyH = 28;
    const buyX = CARD_W - PADDING - buyW;
    const buyY = CARD_H - PADDING - buyH;
    this.buyBg = scene.add.rectangle(buyX, buyY, buyW, buyH, 0x22f6ff, 1);
    this.buyBg.setStrokeStyle(1, 0xffffff, 0.85);
    this.buyBg.setOrigin(0, 0);
    this.buyBg.setInteractive({ useHandCursor: true });
    this.buyBg.on('pointerdown', () => {
      if (UpgradeSystem.canAfford(this.key) && UpgradeSystem.purchase(this.key)) {
        this.refresh();
        if (this.onPurchase) this.onPurchase();
      }
    });
    this.buyText = scene.add.text(buyX + buyW / 2, buyY + buyH / 2, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#000000',
    });
    this.buyText.setOrigin(0.5);

    this.container.add([
      this.bg,
      this.labelText,
      this.levelText,
      this.milestoneText,
      this.buyBg,
      this.buyText,
    ]);
  }

  setOnPurchase(fn: () => void): void {
    this.onPurchase = fn;
  }

  refresh(): void {
    const def = UpgradeDefs[this.key];
    const level = UpgradeSystem.getLevel(this.key);
    const cost = UpgradeSystem.getNextCost(this.key);
    const affordable = UpgradeSystem.canAfford(this.key);

    this.labelText.setText(def.label);
    this.levelText.setText(`Lv. ${level} → ${level + 1}`);

    const ms = nextMilestone(this.key, level);
    if (ms) {
      this.milestoneText.setText(`Lv. ${ms.level}: ${ms.text}`);
    } else {
      this.milestoneText.setText(def.description);
    }

    this.buyText.setText(`${cost} ◆`);
    if (affordable) {
      this.buyBg.setFillStyle(0x22f6ff, 1);
      this.buyText.setColor('#000000');
    } else {
      this.buyBg.setFillStyle(0x444444, 1);
      this.buyText.setColor('#888888');
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
