import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { Strings } from '../config/Strings';
import type { CardDef, CardRarity } from '../config/CardDefs';
import { bus, Events } from '../core/EventBus';
import { sfxUpgradePurchased } from '../audio/sfx';

// DraftScene per blueprint §12. Launched as an overlay by RaidScene at the
// 20s and 45s draft windows; RaidScene pauses itself before launch so the
// player is safe while choosing.
//
// Time-slow note (M15): the blueprint calls for "time slows to 10%". We
// chose full pause instead of multi-axis time-scaling (physics + tweens +
// anims + manual dt) because the four-axis scale is fragile and the user
// confirmed "Full pause is acceptable here". Documented in the M15 commit.
//
// Layout: dim backdrop, centered title, three cards side-by-side, countdown
// at the top. Click any card to pick; on 8s timeout the middle card is
// auto-picked.

export interface DraftSceneInit {
  cards: CardDef[];
  draftIndex: number;
  raidSceneKey: string;
}

const RARITY_BORDER: Record<CardRarity, number> = {
  common: 0xffffff,
  rare: 0x22f6ff,
  epic: 0xa76cff,
};

const RARITY_LABEL: Record<CardRarity, string> = {
  common: Strings.draftRarityCommon,
  rare: Strings.draftRarityRare,
  epic: Strings.draftRarityEpic,
};

const RARITY_COLOR_HEX: Record<CardRarity, string> = {
  common: '#ffffff',
  rare: '#22f6ff',
  epic: '#a76cff',
};

interface CardView {
  card: CardDef;
  bg: Phaser.GameObjects.Rectangle;
  hit: Phaser.GameObjects.Zone;
}

export class DraftScene extends Phaser.Scene {
  private cards: CardDef[] = [];
  private raidSceneKey = 'RaidScene';
  private cardViews: CardView[] = [];
  private remaining: number = Balance.cards.autoPickSec;
  private timerText!: Phaser.GameObjects.Text;
  private picked = false;

  constructor() {
    super({ key: 'DraftScene' });
  }

  init(data: DraftSceneInit): void {
    this.cards = data?.cards ?? [];
    this.raidSceneKey = data?.raidSceneKey ?? 'RaidScene';
    this.remaining = Balance.cards.autoPickSec;
    this.picked = false;
    this.cardViews = [];
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // Dim backdrop. Click-through is disabled by the card hit zones; backdrop
    // only catches clicks outside the cards, where it's a no-op.
    this.add
      .rectangle(0, 0, w, h, 0x000000, 0.78)
      .setOrigin(0, 0)
      .setDepth(0)
      .setInteractive();

    // Title
    this.add
      .text(w / 2, h * 0.13, Strings.draftTitle, {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(1);

    this.timerText = this.add
      .text(w / 2, h * 0.13 + 36, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffd75a',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(1);

    this.layoutCards();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.picked) return;
    const dt = deltaMs / 1000;
    this.remaining = Math.max(0, this.remaining - dt);
    this.timerText.setText(`${Strings.draftAutoPick} ${Math.ceil(this.remaining)}s`);
    if (this.remaining <= 0) {
      // Auto-pick middle card per spec; if there are fewer than 3, pick the
      // first one.
      const idx = this.cards.length >= 2 ? 1 : 0;
      const fallback = this.cards[idx];
      if (fallback) this.pick(fallback);
    }
  }

  private layoutCards(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cardW = 240;
    const cardH = 340;
    const gap = 36;
    const totalW = this.cards.length * cardW + (this.cards.length - 1) * gap;
    const startX = w / 2 - totalW / 2 + cardW / 2;
    const cy = h * 0.52;

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const cx = startX + i * (cardW + gap);
      this.cardViews.push(this.buildCard(card, cx, cy, cardW, cardH));
    }
  }

  private buildCard(card: CardDef, cx: number, cy: number, cw: number, ch: number): CardView {
    const border = RARITY_BORDER[card.tier];
    const hexColor = RARITY_COLOR_HEX[card.tier];

    const bg = this.add
      .rectangle(cx, cy, cw, ch, 0x0a1014, 0.95)
      .setStrokeStyle(3, border, 0.95)
      .setDepth(2);

    // Rarity ribbon at top
    this.add
      .text(cx, cy - ch / 2 + 18, RARITY_LABEL[card.tier], {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: hexColor,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(3);

    // Placeholder icon - a colored shape sized to the rarity.
    this.drawCardIcon(card.tier, cx, cy - 50, hexColor);

    // Name
    this.add
      .text(cx, cy + 60, card.name, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: cw - 20 },
      })
      .setOrigin(0.5)
      .setDepth(3);

    // Effect text
    this.add
      .text(cx, cy + 110, card.effect, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#bcd2dc',
        align: 'center',
        wordWrap: { width: cw - 24 },
      })
      .setOrigin(0.5, 0)
      .setDepth(3);

    const hit = this.add
      .zone(cx, cy, cw, ch)
      .setOrigin(0.5)
      .setDepth(4)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      bg.setStrokeStyle(4, border, 1);
      bg.setFillStyle(0x121a26, 1);
    });
    hit.on('pointerout', () => {
      bg.setStrokeStyle(3, border, 0.95);
      bg.setFillStyle(0x0a1014, 0.95);
    });
    hit.on('pointerdown', () => this.pick(card));

    return { card, bg, hit };
  }

  private drawCardIcon(tier: CardRarity, x: number, y: number, hexColor: string): void {
    const g = this.add.graphics().setDepth(3);
    const colorNum = Phaser.Display.Color.HexStringToColor(hexColor).color;
    g.fillStyle(colorNum, 0.6);
    g.lineStyle(3, colorNum, 1);
    const r = 30;
    if (tier === 'common') {
      // Square
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.strokeRect(x - r, y - r, r * 2, r * 2);
    } else if (tier === 'rare') {
      // Triangle
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r, y + r * 0.85);
      g.lineTo(x - r, y + r * 0.85);
      g.closePath();
      g.fillPath();
      g.strokePath();
    } else {
      // Hexagon
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
  }

  private pick(card: CardDef): void {
    if (this.picked) return;
    this.picked = true;
    sfxUpgradePurchased();

    // Hand the picked card to RaidScene through the bus event. RaidScene's
    // listener will mutate RunMods, refresh derived caches, and resume itself.
    bus.emit(Events.DRAFT_PICKED, card);

    // Tear down: stop ourselves and resume the host raid scene. RaidScene's
    // bus handler does the resume so the order is deterministic on its end,
    // but we also issue resume here as a safety net in case the listener was
    // late to register.
    this.scene.resume(this.raidSceneKey);
    this.scene.stop();
  }
}
