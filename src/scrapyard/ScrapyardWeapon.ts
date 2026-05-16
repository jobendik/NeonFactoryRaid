/**
 * ScrapyardWeapon.ts
 * Single polished weapon ("Pulse Rifle"): hitscan raycast, reload, spread,
 * recoil, muzzle flash, headshots, damage numbers.
 */

import * as THREE from 'three';
import type { FPSController } from './FPSController';
import type { FPSCamera } from './FPSCamera';
import type { ScrapyardEnemySystem } from './ScrapyardEnemySystem';
import type { ScrapyardParticles } from './ScrapyardParticles';
import type { ScrapyardAudio } from './ScrapyardAudio';

interface WeaponHooks {
  onHitMarker?: () => void;
}

const BASE_WEAPON = {
  fireRate: 8,
  magSize: 24,
  reloadTime: 1.5,
  damage: 15,
  spreadBase: 0.015,
  spreadMove: 0.025,
  spreadFire: 0.008,
  recoilAmount: 0.02,
  range: 50,
} as const;

export class ScrapyardWeapon {
  ammo: number = BASE_WEAPON.magSize;
  magSize: number = BASE_WEAPON.magSize;
  isReloading = false;
  reloadTimer = 0;
  fireTimer = 0;
  damage: number = BASE_WEAPON.damage;
  spreadAccum = 0;

  private _camera: THREE.PerspectiveCamera;
  private _scene: THREE.Scene;
  private _player: FPSController;
  private _fpsCamera: FPSCamera;
  private _enemies: ScrapyardEnemySystem;
  private _particles: ScrapyardParticles;
  private _audio: ScrapyardAudio;
  private _wallMeshes: THREE.Mesh[];
  private _hooks: WeaponHooks;

  private _muzzleFlash: THREE.Mesh | null = null;
  private _muzzleFlashTimer = 0;
  private _gunModel: THREE.Group | null = null;
  private _firing = false;

  private _raycaster = new THREE.Raycaster();
  private _spreadDir = new THREE.Vector3();
  private _cameraWorldPos = new THREE.Vector3();

  private _onMouseDownBound = (e: MouseEvent): void => { if (e.button === 0) this._firing = true; };
  private _onMouseUpBound = (e: MouseEvent): void => { if (e.button === 0) this._firing = false; };
  private _onKeyDownBound = (e: KeyboardEvent): void => { if (e.code === 'KeyR') this._startReload(); };

  constructor(
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    player: FPSController,
    fpsCamera: FPSCamera,
    enemies: ScrapyardEnemySystem,
    particles: ScrapyardParticles,
    audio: ScrapyardAudio,
    wallMeshes: THREE.Mesh[],
    hooks: WeaponHooks = {},
  ) {
    this._camera = camera;
    this._scene = scene;
    this._player = player;
    this._fpsCamera = fpsCamera;
    this._enemies = enemies;
    this._particles = particles;
    this._audio = audio;
    this._wallMeshes = wallMeshes;
    this._hooks = hooks;
    this._raycaster.far = BASE_WEAPON.range;
  }

  init(): void {
    document.addEventListener('mousedown', this._onMouseDownBound);
    document.addEventListener('mouseup', this._onMouseUpBound);
    document.addEventListener('keydown', this._onKeyDownBound);

    const gunGroup = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.35);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3, metalness: 0.8 });
    gunGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

    const barrelGeo = new THREE.BoxGeometry(0.03, 0.03, 0.2);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.2, metalness: 0.9 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 0.01, -0.25);
    gunGroup.add(barrel);

    const accentGeo = new THREE.BoxGeometry(0.065, 0.015, 0.25);
    const accentMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.set(0, -0.04, -0.02);
    gunGroup.add(accent);

    gunGroup.position.set(0.22, -0.18, -0.4);
    gunGroup.rotation.set(0, 0.05, 0);
    this._gunModel = gunGroup;
    this._camera.add(gunGroup);

    const flashGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this._muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this._muzzleFlash.renderOrder = 999;
    this._muzzleFlash.position.set(0, 0.01, -0.45);
    gunGroup.add(this._muzzleFlash);

    // Attach camera to scene so the gun (child of camera) renders.
    this._scene.add(this._camera);
  }

  reset(): void {
    this.ammo = this.magSize;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.spreadAccum = 0;
    this._firing = false;
    if (this._muzzleFlash) (this._muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  applyUpgrades(stats: { weaponDamage?: number }): void {
    this.damage = BASE_WEAPON.damage + (stats.weaponDamage ?? 0);
  }

  update(dt: number): void {
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = this.magSize;
        this.isReloading = false;
      }
    }

    if (this.fireTimer > 0) this.fireTimer -= dt;

    this.spreadAccum *= Math.exp(-8 * dt);
    if (this.spreadAccum < 0.0001) this.spreadAccum = 0;

    if (
      this._firing &&
      !this.isReloading &&
      this.fireTimer <= 0 &&
      this._player.isPointerLocked &&
      this._player.alive
    ) {
      this._fire();
    }

    if (this._muzzleFlashTimer > 0 && this._muzzleFlash) {
      this._muzzleFlashTimer -= dt;
      (this._muzzleFlash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this._muzzleFlashTimer / 0.05);
    }
  }

  private _fire(): void {
    if (this.ammo <= 0) {
      this._startReload();
      return;
    }

    this.ammo--;
    this.fireTimer = 1 / BASE_WEAPON.fireRate;

    this._audio.shoot();
    this._fpsCamera.addRecoil(BASE_WEAPON.recoilAmount);
    this._fpsCamera.addShake(0.05);

    this.spreadAccum += BASE_WEAPON.spreadFire;

    if (this._muzzleFlash) {
      this._muzzleFlashTimer = 0.05;
      (this._muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 1;
      this._muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    }

    let totalSpread = BASE_WEAPON.spreadBase + this.spreadAccum;
    if (this._player.isMoving) totalSpread += BASE_WEAPON.spreadMove;

    this._camera.getWorldDirection(this._spreadDir);
    const heat = this._player.isMoving ? 1.65 : 1;
    this._spreadDir.x += (Math.random() - 0.5) * totalSpread * heat;
    this._spreadDir.y += (Math.random() - 0.5) * totalSpread * heat;
    this._spreadDir.z += (Math.random() - 0.5) * totalSpread * heat;
    this._spreadDir.normalize();

    this._camera.getWorldPosition(this._cameraWorldPos);

    const hit = this._enemies.raycastEnemy(this._cameraWorldPos, this._spreadDir, 58);

    if (hit) {
      const dmg = Math.round(this.damage * (hit.headshot ? 1.75 : 1));
      const killed = this._enemies.damageEnemy(hit.enemy, dmg);

      this._audio.hitMarker();
      this._hooks.onHitMarker?.();

      this._particles.spawnImpact(
        hit.point,
        hit.headshot ? 0xffd761 : 0xff315a,
        hit.headshot ? 12 : 8,
      );
      this._particles.spawnDamageNumber(hit.point, dmg, killed || hit.headshot);
    } else {
      this._raycaster.set(this._cameraWorldPos, this._spreadDir);
      const wallHits = this._raycaster.intersectObjects(this._wallMeshes, false);
      if (wallHits.length > 0) {
        this._particles.spawnImpact(wallHits[0].point, 0x2dfdff, 3);
      }
    }

    if (this.ammo <= 0) this._startReload();
  }

  private _startReload(): void {
    if (this.isReloading || this.ammo === this.magSize) return;
    this.isReloading = true;
    this.reloadTimer = BASE_WEAPON.reloadTime;
    this._audio.reload();
  }

  /** Current spread (radians) for crosshair UI. */
  getCurrentSpread(): number {
    let spread = BASE_WEAPON.spreadBase + this.spreadAccum;
    if (this._player.isMoving) spread += BASE_WEAPON.spreadMove;
    return spread;
  }

  dispose(): void {
    document.removeEventListener('mousedown', this._onMouseDownBound);
    document.removeEventListener('mouseup', this._onMouseUpBound);
    document.removeEventListener('keydown', this._onKeyDownBound);
    if (this._gunModel) {
      this._camera.remove(this._gunModel);
      this._gunModel.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material.dispose();
        }
      });
      this._gunModel = null;
    }
  }
}
