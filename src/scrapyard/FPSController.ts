/**
 * FPSController.ts
 * First-person character controller with WASD, sprint, crouch, jump,
 * pointer lock, gravity, and AABB collision.
 * Tight arcade feel — no slippery movement, delta-time safe.
 */

import * as THREE from 'three';
import { FPSCamera } from './FPSCamera';
import type { ScrapyardRenderer } from './ScrapyardRenderer';

// Default stats (before upgrades)
const BASE = {
  maxHP: 100,
  moveSpeed: 6.4,
  sprintMultiplier: 1.42,
  crouchMultiplier: 0.62,
  crouchHeight: 1.22,
  standHeight: 1.62,
  acceleration: 42,
  deceleration: 34,
  height: 1.75,
  radius: 0.42,
  jumpVelocity: 6.4,
  gravity: 20,
  damageCooldownTime: 0.12,
} as const;

/** Smooth approach function — moves `current` toward `target` by at most `delta`. */
function approach(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(current + delta, target);
  if (current > target) return Math.max(current - delta, target);
  return target;
}

export class FPSController {
  // State
  hp: number = BASE.maxHP;
  maxHP: number = BASE.maxHP;
  alive = true;
  position = new THREE.Vector3(0, BASE.standHeight, 0);
  velocity = new THREE.Vector3();
  isSprinting = false;
  isCrouching = false;
  isMoving = false;
  grounded = true;
  moveSpeed: number = BASE.moveSpeed;

  // Pointer lock state
  private _pointerLocked = false;

  // Damage cooldown — prevents instant death from clustered enemies
  private _damageCooldown = 0;

  // Collision boxes (set from ArenaGenerator)
  colliders: THREE.Box3[] = [];

  // Input state
  private _keys = {
    w: false, a: false, s: false, d: false,
    shift: false, ctrl: false, c: false, space: false,
  };

  // Camera reference for direction calculations
  private _fpsCamera: FPSCamera;

  // Temp vectors (reuse to avoid allocation)
  private _moveDir = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _newPos = new THREE.Vector3();

  // Bound listeners for cleanup
  private _onKeyDownBound = (e: KeyboardEvent): void => this._onKeyDown(e);
  private _onKeyUpBound = (e: KeyboardEvent): void => this._onKeyUp(e);
  private _onPointerLockChangeBound = (): void => this._onPointerLockChange();
  private _onCanvasClickBound = (): void => this._onCanvasClick();
  private _canvas: HTMLCanvasElement | null = null;

  // Callback: invoked when the player dies
  onDeath: (() => void) | null = null;
  // Callback: invoked when the player takes damage
  onDamage: ((amount: number) => void) | null = null;

  constructor(fpsCamera: FPSCamera) {
    this._fpsCamera = fpsCamera;
  }

  /** Initialize input listeners and pointer lock. */
  init(renderer: ScrapyardRenderer): void {
    document.addEventListener('keydown', this._onKeyDownBound);
    document.addEventListener('keyup', this._onKeyUpBound);
    document.addEventListener('pointerlockchange', this._onPointerLockChangeBound);

    this._canvas = renderer.renderer?.domElement ?? null;
    if (this._canvas) {
      this._canvas.addEventListener('click', this._onCanvasClickBound);
    }
  }

  /** Reset for new match. */
  reset(spawnPos: THREE.Vector3): void {
    this.hp = this.maxHP;
    this.alive = true;
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.isSprinting = false;
    this.isCrouching = false;
    this.grounded = true;
    this._damageCooldown = 0;
    this._clearKeys();
  }

  /** Apply upgrade stats from the shared upgrade system. */
  applyUpgrades(stats: { maxHP?: number; moveSpeed?: number }): void {
    this.maxHP = BASE.maxHP + (stats.maxHP ?? 0);
    this.hp = this.maxHP;
    this.moveSpeed = BASE.moveSpeed + (stats.moveSpeed ?? 0);
  }

  /**
   * Take damage with cooldown protection.
   * Returns true if the player was killed.
   */
  takeDamage(amount: number): boolean {
    if (!this.alive || this._damageCooldown > 0) return false;

    this._damageCooldown = BASE.damageCooldownTime;
    this.hp = Math.max(0, this.hp - amount);
    this.onDamage?.(amount);

    if (this.hp <= 0) {
      this.alive = false;
      this.onDeath?.();
      return true;
    }
    return false;
  }

  /** Heal (capped at maxHP). */
  heal(amount: number): void {
    this.hp = Math.min(this.hp + amount, this.maxHP);
  }

  /** Update movement each frame. */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (!this.alive) return;

    // Tick damage cooldown
    this._damageCooldown = Math.max(0, this._damageCooldown - dt);

    // ── Determine movement direction ──
    this._moveDir.set(0, 0, 0);

    this._fpsCamera.getForward(this._forward);
    this._fpsCamera.getRight(this._right);

    if (this._keys.w) this._moveDir.add(this._forward);
    if (this._keys.s) this._moveDir.sub(this._forward);
    if (this._keys.d) this._moveDir.add(this._right);
    if (this._keys.a) this._moveDir.sub(this._right);

    this.isMoving = this._moveDir.lengthSq() > 0.001;
    if (this.isMoving) this._moveDir.normalize();

    // ── Speed modifiers ──
    let speed = this.moveSpeed;
    this.isCrouching = this._keys.ctrl || this._keys.c;
    this.isSprinting = this._keys.shift && this.isMoving && !this.isCrouching;

    if (this.isSprinting) speed *= BASE.sprintMultiplier;
    if (this.isCrouching) speed *= BASE.crouchMultiplier;

    // ── Horizontal acceleration ──
    const accel = this.isMoving ? BASE.acceleration : BASE.deceleration;
    const desiredX = this._moveDir.x * speed;
    const desiredZ = this._moveDir.z * speed;

    this.velocity.x = approach(this.velocity.x, desiredX, accel * dt);
    this.velocity.z = approach(this.velocity.z, desiredZ, accel * dt);

    // Kill tiny velocities
    if (Math.abs(this.velocity.x) + Math.abs(this.velocity.z) < 0.01) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // ── Jump + Gravity ──
    if (this.grounded && this._keys.space) {
      this.velocity.y = BASE.jumpVelocity;
      this.grounded = false;
    }
    this.velocity.y -= BASE.gravity * dt;

    // ── Move with collision ──
    this._newPos.copy(this.position);

    // Horizontal movement (resolve each axis independently for clean wall sliding)
    this._newPos.x += this.velocity.x * dt;
    this._resolveAxis(this._newPos, 'x');

    this._newPos.z += this.velocity.z * dt;
    this._resolveAxis(this._newPos, 'z');

    // Vertical movement
    this._newPos.y += this.velocity.y * dt;

    // Eye height target
    const eyeHeight = this.isCrouching ? BASE.crouchHeight : BASE.standHeight;

    if (this._newPos.y <= eyeHeight) {
      this._newPos.y = eyeHeight;
      this.velocity.y = 0;
      this.grounded = true;
    }

    this.position.copy(this._newPos);

    // ── Sync camera ──
    camera.position.copy(this.position);
  }

  /** Is pointer lock active? */
  get isPointerLocked(): boolean {
    return this._pointerLocked;
  }

  /** Set wall colliders from arena generator. */
  setColliders(colliders: THREE.Box3[]): void {
    this.colliders = colliders;
  }

  /** Remove event listeners. */
  dispose(): void {
    document.removeEventListener('keydown', this._onKeyDownBound);
    document.removeEventListener('keyup', this._onKeyUpBound);
    document.removeEventListener('pointerlockchange', this._onPointerLockChangeBound);
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onCanvasClickBound);
      this._canvas = null;
    }
    // Exit pointer lock if active
    if (this._pointerLocked) {
      document.exitPointerLock();
    }
  }

  // ── Private ──

  /** Resolve AABB collision per-axis (slide along walls). */
  private _resolveAxis(pos: THREE.Vector3, axis: 'x' | 'z'): void {
    const r = BASE.radius;
    for (const box of this.colliders) {
      if (pos.y > box.max.y + 0.05 || pos.y < box.min.y) continue;

      const closestX = Math.max(box.min.x, Math.min(pos.x, box.max.x));
      const closestZ = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;

      if (dx * dx + dz * dz < r * r) {
        if (axis === 'x') {
          pos.x = this.position.x;
          this.velocity.x = 0;
        } else {
          pos.z = this.position.z;
          this.velocity.z = 0;
        }
      }
    }
  }

  private _clearKeys(): void {
    this._keys.w = false;
    this._keys.a = false;
    this._keys.s = false;
    this._keys.d = false;
    this._keys.shift = false;
    this._keys.ctrl = false;
    this._keys.c = false;
    this._keys.space = false;
  }

  private _onKeyDown(e: KeyboardEvent): void {
    this._setKey(e.code, true);
    if (e.code === 'Space') e.preventDefault();
  }

  private _onKeyUp(e: KeyboardEvent): void {
    this._setKey(e.code, false);
  }

  private _setKey(code: string, value: boolean): void {
    switch (code) {
      case 'KeyW': this._keys.w = value; break;
      case 'KeyA': this._keys.a = value; break;
      case 'KeyS': this._keys.s = value; break;
      case 'KeyD': this._keys.d = value; break;
      case 'ShiftLeft': case 'ShiftRight': this._keys.shift = value; break;
      case 'ControlLeft': case 'ControlRight': this._keys.ctrl = value; break;
      case 'KeyC': this._keys.c = value; break;
      case 'Space': this._keys.space = value; break;
    }
  }

  private _onPointerLockChange(): void {
    this._pointerLocked = document.pointerLockElement === this._canvas;
    this._fpsCamera.isPointerLocked = this._pointerLocked;
  }

  private _onCanvasClick(): void {
    if (!this._pointerLocked && this._canvas) {
      this._canvas.requestPointerLock();
    }
  }
}
