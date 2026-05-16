/**
 * ScrapyardAudio.ts
 * Web Audio synthesized SFX for the 3D Scrapyard mode.
 *
 * Independent of the main game's AudioBus — uses its own AudioContext so
 * it can be torn down with the scene without disrupting Phaser music.
 */

export class ScrapyardAudio {
  private _ctx: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _muted = false;
  private _initialized = false;

  init(): void {
    if (this._initialized) return;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this._ctx = new Ctor();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 0.3;
      this._masterGain.connect(this._ctx.destination);
      this._initialized = true;
    } catch (e) {
      console.warn('[ScrapyardAudio] Web Audio not available:', e);
    }
  }

  resume(): void {
    if (this._ctx && this._ctx.state === 'suspended') void this._ctx.resume();
  }

  mute(): void {
    this._muted = true;
    if (this._masterGain) this._masterGain.gain.value = 0;
  }

  unmute(): void {
    this._muted = false;
    if (this._masterGain) this._masterGain.gain.value = 0.3;
  }

  dispose(): void {
    if (this._ctx) {
      void this._ctx.close();
      this._ctx = null;
    }
    this._masterGain = null;
    this._initialized = false;
  }

  // ── SFX ──

  shoot(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(ctx, t, 'square', [[880, t], [220, t + 0.08]], 0.15, 0.08);
  }

  hitMarker(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.setValueAtTime(1600, t + 0.03);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain); gain.connect(this._masterGain!);
    osc.start(t); osc.stop(t + 0.06);
  }

  enemyDeath(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(ctx, t, 'sawtooth', [[600, t], [80, t + 0.25]], 0.1, 0.25);
  }

  lootPickup(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.setValueAtTime(900, t + 0.05);
    osc.frequency.setValueAtTime(1200, t + 0.1);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain); gain.connect(this._masterGain!);
    osc.start(t); osc.stop(t + 0.15);
  }

  extractionBeep(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, t);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain); gain.connect(this._masterGain!);
    osc.start(t); osc.stop(t + 0.1);
  }

  extractionSuccess(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.12);
      gain.gain.setValueAtTime(0.1, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.2);
      osc.connect(gain); gain.connect(this._masterGain!);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.2);
    });
  }

  playerDamage(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(ctx, t, 'sine', [[80, t], [40, t + 0.15]], 0.2, 0.15);
  }

  reload(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    this._noise(ctx, t, 0.05, 0.08);
    this._noise(ctx, t + 0.15, 0.08, 0.06);
    this._noise(ctx, t + 0.35, 0.04, 0.1);
  }

  click(): void {
    const ctx = this._ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1000, t);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(gain); gain.connect(this._masterGain!);
    osc.start(t); osc.stop(t + 0.03);
  }

  // ── helpers ──

  private _ready(): AudioContext | null {
    if (!this._initialized || this._muted || !this._ctx || !this._masterGain) return null;
    if (this._ctx.state === 'suspended') void this._ctx.resume();
    return this._ctx;
  }

  private _tone(
    ctx: AudioContext,
    t: number,
    type: OscillatorType,
    sweep: [number, number][],
    vol: number,
    dur: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(sweep[0][0], sweep[0][1]);
    if (sweep.length > 1) osc.frequency.exponentialRampToValueAtTime(sweep[1][0], sweep[1][1]);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(this._masterGain!);
    osc.start(t); osc.stop(t + dur);
  }

  private _noise(ctx: AudioContext, startTime: number, duration: number, volume: number): void {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * volume;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    source.connect(gain); gain.connect(this._masterGain!);
    source.start(startTime);
  }
}
