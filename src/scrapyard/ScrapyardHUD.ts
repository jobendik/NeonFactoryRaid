/**
 * ScrapyardHUD.ts
 * DOM-based first-person HUD overlay: crosshair with dynamic spread, health
 * bar, ammo counter, loot counter, kill counter, match timer, extraction
 * progress, waypoint arrow, damage vignette.
 */

import * as THREE from 'three';
import type { FPSController } from './FPSController';
import type { ScrapyardWeapon } from './ScrapyardWeapon';
import type { ScrapyardExtraction } from './ScrapyardExtraction';
import { SCRAPYARD_EXTRACT_TIME } from './ScrapyardExtraction';

const ROOT_ID = 'scrapyard-root';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class ScrapyardHUD {
  private _player: FPSController;
  private _weapon: ScrapyardWeapon;
  private _extraction: ScrapyardExtraction;
  private _camera: THREE.Camera;
  private _root: HTMLElement | null = null;

  private _crosshairLines: HTMLElement[] = [];
  private _crosshairDot: HTMLElement | null = null;
  private _healthFill: HTMLElement | null = null;
  private _healthText: HTMLElement | null = null;
  private _ammoText: HTMLElement | null = null;
  private _lootText: HTMLElement | null = null;
  private _killCounter: HTMLElement | null = null;
  private _matchTimer: HTMLElement | null = null;
  private _extractionContainer: HTMLElement | null = null;
  private _extractionFill: HTMLElement | null = null;
  private _extractionText: HTMLElement | null = null;
  private _waypointArrow: HTMLElement | null = null;
  private _waypointChevron: HTMLElement | null = null;
  private _waypointDist: HTMLElement | null = null;
  private _vignette: HTMLElement | null = null;
  private _clickPrompt: HTMLElement | null = null;
  private _exitBtn: HTMLButtonElement | null = null;

  private _vignetteTimer = 0;
  private _hitMarkerTimer = 0;
  private _lootDisplay = 0;
  private _camDir = new THREE.Vector3();

  // External state set by the scene each frame.
  unbankedLoot = 0;
  killCount = 0;
  matchTime = 0;

  // Click handler for the EXTRACT-side exit button.
  onExitRequested: (() => void) | null = null;

  constructor(
    player: FPSController,
    weapon: ScrapyardWeapon,
    extraction: ScrapyardExtraction,
    camera: THREE.Camera,
  ) {
    this._player = player;
    this._weapon = weapon;
    this._extraction = extraction;
    this._camera = camera;
  }

  /** Build DOM + return the canvas container element for the renderer to mount into. */
  init(): HTMLElement {
    // CSS — injected once per session.
    if (!document.getElementById('scrapyard-css-loaded')) {
      const link = document.createElement('link');
      link.id = 'scrapyard-css-loaded';
      link.rel = 'stylesheet';
      // Vite resolves CSS imports differently; we use a JS import in
      // ScrapyardScene that triggers Vite to bundle the CSS. The link tag
      // is a fallback for dev builds that don't auto-inject.
      this._injectInlineCss();
    }

    // Canvas container.
    let container = document.getElementById('scrapyard-canvas-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'scrapyard-canvas-container';
      document.body.appendChild(container);
    }

    // HUD root.
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    root.innerHTML = `
      <div id="sy-damage-vignette"></div>

      <button id="sy-exit-btn" type="button">EXIT TO FACTORY</button>

      <div id="sy-timer-container"><span id="sy-match-timer">0:00</span></div>

      <div id="sy-waypoint-arrow">
        <div class="sy-waypoint-chevron">▲</div>
        <div class="sy-waypoint-label">EXTRACT</div>
        <div class="sy-waypoint-dist">0m</div>
      </div>

      <div id="sy-crosshair">
        <div id="sy-crosshair-dot"></div>
        <div class="sy-crosshair-line" data-dir="top"></div>
        <div class="sy-crosshair-line" data-dir="bottom"></div>
        <div class="sy-crosshair-line" data-dir="left"></div>
        <div class="sy-crosshair-line" data-dir="right"></div>
      </div>

      <div id="sy-click-prompt">CLICK TO LOCK CURSOR</div>

      <div id="sy-extraction-container" class="sy-hidden">
        <div id="sy-extraction-bar-bg"><div id="sy-extraction-fill"></div></div>
        <div id="sy-extraction-text">EXTRACTING 10.0s</div>
      </div>

      <div id="sy-health-container"><div id="sy-health-fill"></div></div>
      <div id="sy-health-text">100 / 100</div>

      <div id="sy-ammo-container"><span id="sy-ammo-text">24 / 24</span></div>

      <div id="sy-loot-container">
        <span>★</span><span id="sy-loot-text">0</span>
      </div>

      <div id="sy-kill-container">
        <span>☠</span><span id="sy-kill-counter">0</span>
      </div>
    `;

    this._root = root;
    this._crosshairDot = root.querySelector('#sy-crosshair-dot');
    this._crosshairLines = Array.from(root.querySelectorAll('.sy-crosshair-line')) as HTMLElement[];
    this._healthFill = root.querySelector('#sy-health-fill');
    this._healthText = root.querySelector('#sy-health-text');
    this._ammoText = root.querySelector('#sy-ammo-text');
    this._lootText = root.querySelector('#sy-loot-text');
    this._killCounter = root.querySelector('#sy-kill-counter');
    this._matchTimer = root.querySelector('#sy-match-timer');
    this._extractionContainer = root.querySelector('#sy-extraction-container');
    this._extractionFill = root.querySelector('#sy-extraction-fill');
    this._extractionText = root.querySelector('#sy-extraction-text');
    this._waypointArrow = root.querySelector('#sy-waypoint-arrow');
    this._waypointChevron = root.querySelector('.sy-waypoint-chevron');
    this._waypointDist = root.querySelector('.sy-waypoint-dist');
    this._vignette = root.querySelector('#sy-damage-vignette');
    this._clickPrompt = root.querySelector('#sy-click-prompt');
    this._exitBtn = root.querySelector('#sy-exit-btn');
    this._exitBtn?.addEventListener('click', () => this.onExitRequested?.());

    return container;
  }

  /** Tear down the DOM overlay. */
  dispose(): void {
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
    const container = document.getElementById('scrapyard-canvas-container');
    if (container) container.remove();
  }

  showDamageVignette(): void {
    this._vignetteTimer = 0.3;
    if (this._vignette) this._vignette.style.opacity = '0.6';
  }

  showHitMarker(): void {
    this._hitMarkerTimer = 0.15;
    this._crosshairDot?.classList.add('sy-hit-flash');
  }

  update(dt: number): void {
    if (!this._root) return;

    // Click prompt visibility — show only when pointer NOT locked.
    if (this._clickPrompt) {
      this._clickPrompt.style.display = this._player.isPointerLocked ? 'none' : '';
    }

    // Health
    const hpPct = (this._player.hp / Math.max(1, this._player.maxHP)) * 100;
    if (this._healthFill) {
      this._healthFill.style.width = hpPct + '%';
      this._healthFill.style.backgroundColor =
        hpPct < 30 ? '#ff3333' : hpPct < 60 ? '#ffaa00' : '#00ffaa';
    }
    if (this._healthText) {
      this._healthText.textContent = `${Math.ceil(this._player.hp)} / ${this._player.maxHP}`;
    }

    // Ammo
    if (this._ammoText) {
      if (this._weapon.isReloading) {
        this._ammoText.textContent = 'RELOADING…';
        this._ammoText.style.color = '#ffaa00';
      } else {
        this._ammoText.textContent = `${this._weapon.ammo} / ${this._weapon.magSize}`;
        this._ammoText.style.color = this._weapon.ammo <= 6 ? '#ff3333' : '#00ffcc';
      }
    }

    // Loot (animated counter)
    const target = this.unbankedLoot;
    if (this._lootDisplay < target) {
      this._lootDisplay += Math.max(1, (target - this._lootDisplay) * dt * 8);
      if (this._lootDisplay > target) this._lootDisplay = target;
    } else {
      this._lootDisplay = target;
    }
    if (this._lootText) this._lootText.textContent = `${Math.floor(this._lootDisplay)}`;

    // Kill counter
    if (this._killCounter) this._killCounter.textContent = `${this.killCount}`;

    // Crosshair spread
    const spread = this._weapon.getCurrentSpread();
    const spreadPx = Math.min(spread * 1500, 40);
    for (const line of this._crosshairLines) {
      const dir = (line.dataset as DOMStringMap).dir;
      const base = 6;
      if (dir === 'top') line.style.transform = `translateY(${-(base + spreadPx)}px)`;
      else if (dir === 'bottom') line.style.transform = `translateY(${base + spreadPx}px)`;
      else if (dir === 'left') line.style.transform = `translateX(${-(base + spreadPx)}px)`;
      else if (dir === 'right') line.style.transform = `translateX(${base + spreadPx}px)`;
    }

    // Extraction timer
    if (this._extractionContainer && this._extractionFill && this._extractionText) {
      if (this._extraction.isPlayerInZone || this._extraction.timer > 0) {
        this._extractionContainer.classList.remove('sy-hidden');
        const pct = this._extraction.getProgress() * 100;
        this._extractionFill.style.width = pct + '%';
        const remaining = Math.max(0, SCRAPYARD_EXTRACT_TIME - this._extraction.timer);
        this._extractionText.textContent = `EXTRACTING ${remaining.toFixed(1)}s`;
      } else {
        this._extractionContainer.classList.add('sy-hidden');
      }
    }

    // Waypoint
    this._updateWaypoint();

    // Match timer
    if (this._matchTimer) this._matchTimer.textContent = formatTime(this.matchTime);

    // Damage vignette fade
    if (this._vignetteTimer > 0) {
      this._vignetteTimer -= dt;
      if (this._vignette) this._vignette.style.opacity = `${Math.max(0, this._vignetteTimer / 0.3)}`;
    }

    // Hit marker fade
    if (this._hitMarkerTimer > 0) {
      this._hitMarkerTimer -= dt;
      if (this._hitMarkerTimer <= 0) this._crosshairDot?.classList.remove('sy-hit-flash');
    }
  }

  private _updateWaypoint(): void {
    if (!this._waypointArrow || !this._waypointChevron || !this._waypointDist) return;
    const ext = this._extraction.getPosition();
    const p = this._player.position;
    const dx = ext.x - p.x;
    const dz = ext.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    this._camera.getWorldDirection(this._camDir);
    const angle = Math.atan2(dx, dz) - Math.atan2(this._camDir.x, this._camDir.z);
    this._waypointChevron.style.transform = `rotate(${-angle}rad)`;
    this._waypointDist.textContent = `${Math.floor(dist)}m`;
    this._waypointArrow.style.opacity = dist < 5 ? '0.3' : '1';
  }

  /** Inline-fallback CSS in case the bundler import didn't fire (defensive). */
  private _injectInlineCss(): void {
    // The CSS file is imported via ScrapyardScene.ts as a side-effect, so we
    // rely on Vite's CSS bundler to inject it. If not present, the user can
    // import the file manually in main.ts. This stub keeps things forgiving.
  }
}
