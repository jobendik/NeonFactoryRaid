/**
 * ScrapyardQuality.ts
 * Quality presets and device capability detection for the 3D scrapyard mode.
 * Controls visual fidelity, entity caps, and render settings.
 */

export type ScrapyardQualityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ScrapyardQualitySettings {
  readonly renderScale: number;
  readonly bloomEnabled: boolean;
  readonly shadowsEnabled: boolean;
  readonly maxEnemies: number;
  readonly maxLoot: number;
  readonly maxParticles: number;
  readonly maxDamageNumbers: number;
  readonly antialias: boolean;
  readonly pixelRatioMax: number;
}

const PRESETS: Record<ScrapyardQualityLevel, ScrapyardQualitySettings> = {
  LOW: {
    renderScale: 0.65,
    bloomEnabled: false,
    shadowsEnabled: false,
    maxEnemies: 12,
    maxLoot: 30,
    maxParticles: 60,
    maxDamageNumbers: 8,
    antialias: false,
    pixelRatioMax: 1,
  },
  MEDIUM: {
    renderScale: 0.85,
    bloomEnabled: true,
    shadowsEnabled: false,
    maxEnemies: 20,
    maxLoot: 50,
    maxParticles: 120,
    maxDamageNumbers: 12,
    antialias: true,
    pixelRatioMax: 1.5,
  },
  HIGH: {
    renderScale: 1.0,
    bloomEnabled: true,
    shadowsEnabled: true,
    maxEnemies: 30,
    maxLoot: 80,
    maxParticles: 200,
    maxDamageNumbers: 16,
    antialias: true,
    pixelRatioMax: 2,
  },
};

export class ScrapyardQuality {
  quality: ScrapyardQualityLevel = 'MEDIUM';
  settings: ScrapyardQualitySettings = { ...PRESETS.MEDIUM };

  constructor() {
    this._autoDetect();
  }

  /** Auto-detect quality based on device capabilities. */
  private _autoDetect(): void {
    const cores = navigator.hardwareConcurrency || 2;
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);

    if (isMobile || cores <= 2) {
      this.setQuality('LOW');
    } else if (cores >= 8) {
      this.setQuality('HIGH');
    } else {
      this.setQuality('MEDIUM');
    }
  }

  /** Set quality preset. */
  setQuality(level: ScrapyardQualityLevel): void {
    if (!PRESETS[level]) return;
    this.quality = level;
    this.settings = { ...PRESETS[level] };
  }

  /** Get a specific setting value by key. */
  get<K extends keyof ScrapyardQualitySettings>(key: K): ScrapyardQualitySettings[K] {
    return this.settings[key];
  }
}

/** Singleton shared across scrapyard subsystems. */
export const scrapyardQuality = new ScrapyardQuality();
