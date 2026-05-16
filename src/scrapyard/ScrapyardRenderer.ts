/**
 * ScrapyardRenderer.ts
 * Three.js renderer, scene, camera, lighting, and post-processing for the
 * 3D Scrapyard mode.
 *
 * LIGHTING FIX: Uses OutputPass after bloom to restore sRGB gamma correction.
 * Without this, the EffectComposer's linear render targets override the
 * renderer's outputColorSpace, making everything appear too dark.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { scrapyardQuality } from './ScrapyardQuality';

export class ScrapyardRenderer {
  scene: THREE.Scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera();
  renderer: THREE.WebGLRenderer | null = null;
  composer: EffectComposer | null = null;
  clock: THREE.Clock = new THREE.Clock();
  container: HTMLElement | null = null;

  private _onResizeBound = (): void => this._onResize();

  /** Initialize the Three.js renderer, scene, camera, and lighting. */
  init(container: HTMLElement): void {
    this.container = container;
    const settings = scrapyardQuality.settings;

    // ── Scene ──
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050914);
    this.scene.fog = new THREE.Fog(0x050914, 28, 72);

    // ── Camera ──
    this.camera = new THREE.PerspectiveCamera(
      72,
      container.clientWidth / container.clientHeight,
      0.05,
      160,
    );
    this.camera.position.set(0, 1.7, 0);

    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({
      antialias: settings.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioMax));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    if (settings.shadowsEnabled) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.appendChild(this.renderer.domElement);

    // ── Lighting (bright enough to see!) ──
    // Hemisphere: cool sky + warm ground
    const hemi = new THREE.HemisphereLight(0x5ffaff, 0x120315, 1.1);
    this.scene.add(hemi);

    // Strong directional key light
    const dirLight = new THREE.DirectionalLight(0x9eefff, 2.6);
    dirLight.position.set(-7, 12, 5);
    if (settings.shadowsEnabled) {
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(1024, 1024);
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 60;
      dirLight.shadow.camera.left = -25;
      dirLight.shadow.camera.right = 25;
      dirLight.shadow.camera.top = 25;
      dirLight.shadow.camera.bottom = -25;
    }
    this.scene.add(dirLight);

    // Central cyan point light for neon atmosphere
    const centerLight = new THREE.PointLight(0x2dfdff, 28, 22, 2);
    centerLight.position.set(0, 6, 0);
    this.scene.add(centerLight);

    // ── Post-processing (bloom + OutputPass for gamma) ──
    if (settings.bloomEnabled) {
      this.composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.35, // strength
        0.3,  // radius
        0.82, // threshold
      );
      this.composer.addPass(bloomPass);

      // OutputPass: restores tone mapping + sRGB gamma correction
      // that EffectComposer's linear render targets strip away.
      const outputPass = new OutputPass();
      this.composer.addPass(outputPass);
    }

    // ── Resize handling ──
    window.addEventListener('resize', this._onResizeBound);

    // Apply render scale
    if (settings.renderScale < 1) {
      this._applyRenderScale(settings.renderScale);
    }
  }

  /** Render one frame. */
  render(): void {
    if (this.composer) {
      this.composer.render();
    } else if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Get clamped delta time from Three.js clock. */
  getDelta(): number {
    return Math.min(this.clock.getDelta(), 0.05);
  }

  /** Add an object to the scene. */
  add(obj: THREE.Object3D): void {
    this.scene.add(obj);
  }

  /** Remove an object from the scene. */
  remove(obj: THREE.Object3D): void {
    this.scene.remove(obj);
  }

  /** Tear down the renderer, remove canvas, clean up listeners. */
  dispose(): void {
    window.removeEventListener('resize', this._onResizeBound);
    this.composer = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    // Dispose all scene objects
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    this.container = null;
  }

  // ── Private ──

  private _onResize(): void {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const scale = scrapyardQuality.settings.renderScale;
    this.renderer.setSize(w, h);

    if (scale < 1) {
      this._applyRenderScale(scale);
    }

    if (this.composer) {
      this.composer.setSize(w * scale, h * scale);
    }
  }

  private _applyRenderScale(scale: number): void {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w * scale, h * scale, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
  }
}
