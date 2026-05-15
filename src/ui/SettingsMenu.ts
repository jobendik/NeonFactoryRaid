import Phaser from 'phaser';
import { AudioBus, type AudioVolumes } from '../audio/AudioBus';

// SettingsMenu scaffold per blueprint §21.6. M13 ships only audio controls:
// Master / Music / SFX sliders. Quality, key bindings, and the reset-save
// button arrive in later milestones - the class is structured so those
// rows can be added without changing the open/close lifecycle.
//
// Usage: `new SettingsMenu(scene).open()`. The menu is a modal overlay
// drawn at depth 3000+ so it sits above the HUD. close() unwires inputs
// and destroys all created game objects.

interface SliderHandle {
  container: Phaser.GameObjects.Container;
  knob: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  valueText: Phaser.GameObjects.Text;
  channel: keyof AudioVolumes;
  trackX: number;
  trackW: number;
}

const PANEL_W = 420;
const PANEL_H = 320;
const ROW_Y_GAP = 56;
const SLIDER_W = 240;
const SLIDER_H = 14;
const KNOB_W = 14;

export class SettingsMenu {
  private scene: Phaser.Scene;
  private open_ = false;
  private root: Phaser.GameObjects.Container | null = null;
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  private sliders: SliderHandle[] = [];
  private dragHandle: SliderHandle | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    if (this.open_) return;
    this.open_ = true;
    const scene = this.scene;
    const w = scene.scale.width;
    const h = scene.scale.height;

    this.backdrop = scene.add
      .rectangle(0, 0, w, h, 0x000000, 0.65)
      .setOrigin(0, 0)
      .setDepth(2900)
      .setInteractive();
    // Clicking the dim backdrop dismisses the menu.
    this.backdrop.on('pointerdown', () => this.close());

    this.root = scene.add.container(w / 2 - PANEL_W / 2, h / 2 - PANEL_H / 2);
    this.root.setDepth(3000);

    const panel = scene.add
      .rectangle(0, 0, PANEL_W, PANEL_H, 0x101820, 0.97)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x22f6ff, 0.85);
    this.root.add(panel);

    const title = scene.add
      .text(PANEL_W / 2, 20, 'SETTINGS', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#22f6ff',
      })
      .setOrigin(0.5, 0);
    this.root.add(title);

    const volumes = AudioBus.getVolumes();
    const channels: Array<{ label: string; key: keyof AudioVolumes }> = [
      { label: 'MASTER', key: 'master' },
      { label: 'MUSIC', key: 'music' },
      { label: 'SFX', key: 'sfx' },
    ];

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const y = 80 + i * ROW_Y_GAP;
      this.sliders.push(this.buildSlider(ch.label, ch.key, volumes[ch.key], y));
    }

    const closeBtn = scene.add
      .rectangle(PANEL_W / 2, PANEL_H - 44, 140, 36, 0x22f6ff, 1)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(1, 0xffffff, 0.85)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.close());
    this.root.add(closeBtn);
    const closeText = scene.add
      .text(PANEL_W / 2, PANEL_H - 44, 'CLOSE', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#000000',
      })
      .setOrigin(0.5);
    this.root.add(closeText);

    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.dragHandle = null;
    this.sliders = [];
    this.root?.destroy(true);
    this.root = null;
    this.backdrop?.destroy();
    this.backdrop = null;
  }

  private buildSlider(label: string, channel: keyof AudioVolumes, initial: number, y: number): SliderHandle {
    const scene = this.scene;
    const trackX = (PANEL_W - SLIDER_W) / 2;
    const trackY = y + 24;

    const labelText = scene.add.text(trackX, y, label, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
    });
    this.root!.add(labelText);

    const trackBg = scene.add
      .rectangle(trackX, trackY, SLIDER_W, SLIDER_H, 0x222a36, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 0.4);
    this.root!.add(trackBg);

    const fill = scene.add
      .rectangle(trackX + 1, trackY + 1, Math.max(0, SLIDER_W * initial - 2), SLIDER_H - 2, 0x22f6ff, 1)
      .setOrigin(0, 0);
    this.root!.add(fill);

    const knob = scene.add
      .rectangle(trackX + SLIDER_W * initial - KNOB_W / 2, trackY - 3, KNOB_W, SLIDER_H + 6, 0xffffff, 1)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.root!.add(knob);

    const valueText = scene.add
      .text(trackX + SLIDER_W + 12, trackY + SLIDER_H / 2, `${Math.round(initial * 100)}%`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5);
    this.root!.add(valueText);

    const handle: SliderHandle = {
      container: this.root!,
      knob,
      fill,
      valueText,
      channel,
      trackX,
      trackW: SLIDER_W,
    };

    knob.on('pointerdown', () => {
      this.dragHandle = handle;
    });
    return handle;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragHandle) return;
    this.updateHandleFromPointer(this.dragHandle, pointer);
  }

  private onPointerUp(): void {
    this.dragHandle = null;
  }

  // Maps the pointer's screen X back to the slider's [0,1] range, applies
  // it to the AudioBus, and redraws the visual.
  private updateHandleFromPointer(h: SliderHandle, pointer: Phaser.Input.Pointer): void {
    if (!this.root) return;
    const localX = pointer.x - this.root.x - h.trackX;
    const v = Math.max(0, Math.min(1, localX / h.trackW));
    AudioBus.setVolume(h.channel, v);
    h.knob.x = h.trackX + h.trackW * v - KNOB_W / 2;
    h.fill.setSize(Math.max(0, h.trackW * v - 2), SLIDER_H - 2);
    h.valueText.setText(`${Math.round(v * 100)}%`);
  }
}
