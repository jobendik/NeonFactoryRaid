/**
 * FPSCamera.ts
 * Mouse look, weapon bob, recoil kick, and screen shake for the
 * 3D Scrapyard FPS mode. All effects are framerate-independent.
 */

import * as THREE from 'three';

export class FPSCamera {
  // Mouse look
  private _yaw = 0;
  private _pitch = 0;
  sensitivity = 0.002;
  pitchLimit = Math.PI / 2 - 0.05; // ~85 degrees

  // Weapon bob
  private _bobTime = 0;
  private _bobAmount = new THREE.Vector3();
  bobFrequency = 10;
  bobAmplitudeY = 0.03;
  bobAmplitudeX = 0.015;

  // Recoil
  private _recoilPitch = 0;
  private _recoilTarget = 0;
  private _recoilRecovery = 8;

  // Screen shake
  private _shakeIntensity = 0;
  private _shakeDecay = 10;
  private _shakeOffset = new THREE.Vector3();

  // Euler for applying rotation
  private _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  // Bound listener reference for cleanup
  private _onMouseMoveBound = (e: MouseEvent): void => this._onMouseMove(e);

  // External reference: set before update() each frame
  isMoving = false;
  isSprinting = false;
  isPointerLocked = false;

  /** Initialize mouse move listener. */
  init(): void {
    document.addEventListener('mousemove', this._onMouseMoveBound);
  }

  /** Apply recoil kick (called by weapon on fire). */
  addRecoil(amount: number): void {
    this._recoilTarget += amount;
  }

  /** Apply screen shake (called on impacts, explosions). */
  addShake(intensity: number): void {
    this._shakeIntensity = Math.min(this._shakeIntensity + intensity, 1.0);
  }

  /** Update camera effects each frame. */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    // ── Recoil recovery ──
    if (this._recoilTarget > 0) {
      this._recoilPitch += (this._recoilTarget - this._recoilPitch) * (1 - Math.exp(-15 * dt));
      this._recoilTarget *= Math.exp(-this._recoilRecovery * dt);
      if (this._recoilTarget < 0.0005) this._recoilTarget = 0;
    }
    this._recoilPitch *= Math.exp(-this._recoilRecovery * dt);

    // ── Weapon bob ──
    if (this.isMoving) {
      const speedMult = this.isSprinting ? 1.5 : 1.0;
      this._bobTime += dt * this.bobFrequency * speedMult;
      this._bobAmount.y = Math.sin(this._bobTime * 2) * this.bobAmplitudeY;
      this._bobAmount.x = Math.sin(this._bobTime) * this.bobAmplitudeX;
    } else {
      this._bobAmount.multiplyScalar(Math.exp(-10 * dt));
      this._bobTime = 0;
    }

    // ── Screen shake ──
    if (this._shakeIntensity > 0.001) {
      this._shakeOffset.set(
        (Math.random() - 0.5) * 2 * this._shakeIntensity * 0.03,
        (Math.random() - 0.5) * 2 * this._shakeIntensity * 0.03,
        0,
      );
      this._shakeIntensity *= Math.exp(-this._shakeDecay * dt);
    } else {
      this._shakeOffset.set(0, 0, 0);
      this._shakeIntensity = 0;
    }

    // ── Apply rotation ──
    this._euler.set(this._pitch - this._recoilPitch, this._yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(this._euler);

    // ── Apply positional offsets ──
    camera.position.x += this._bobAmount.x + this._shakeOffset.x;
    camera.position.y += this._bobAmount.y + this._shakeOffset.y;
  }

  /** Get yaw for forward direction calculation. */
  getYaw(): number {
    return this._yaw;
  }

  /** Get camera's forward direction (yaw only, flattened to XZ). */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    out.set(-Math.sin(this._yaw), 0, -Math.cos(this._yaw)).normalize();
    return out;
  }

  /** Get camera's right direction (yaw only, flattened to XZ). */
  getRight(out: THREE.Vector3): THREE.Vector3 {
    out.set(-Math.cos(this._yaw), 0, Math.sin(this._yaw)).normalize();
    return out;
  }

  /** Reset camera state for new match. */
  reset(): void {
    this._yaw = 0;
    this._pitch = 0;
    this._recoilPitch = 0;
    this._recoilTarget = 0;
    this._shakeIntensity = 0;
    this._bobTime = 0;
    this._bobAmount.set(0, 0, 0);
    this._shakeOffset.set(0, 0, 0);
  }

  /** Set initial facing direction (yaw in radians). */
  setYaw(yaw: number): void {
    this._yaw = yaw;
  }

  /** Remove event listeners. */
  dispose(): void {
    document.removeEventListener('mousemove', this._onMouseMoveBound);
  }

  private _onMouseMove(e: MouseEvent): void {
    if (!this.isPointerLocked) return;
    this._yaw -= e.movementX * this.sensitivity;
    this._pitch -= e.movementY * this.sensitivity;
    this._pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this._pitch));
  }
}
