/**
 * ScrapyardLoot.ts
 * Pooled glowing loot orbs with burst physics + magnetic vacuum pickup.
 */

import * as THREE from 'three';
import type { FPSController } from './FPSController';
import type { ScrapyardAudio } from './ScrapyardAudio';
import type { ScrapyardParticles } from './ScrapyardParticles';
import { scrapyardQuality } from './ScrapyardQuality';

const LOOT_VALUE_MIN = 5;
const LOOT_VALUE_MAX = 15;

class LootOrb {
  mesh: THREE.Mesh;
  active = false;
  value = 0;
  velocity = new THREE.Vector3();
  grounded = false;
  _bobPhase = Math.random() * Math.PI * 2;

  constructor() {
    const geo = new THREE.SphereGeometry(0.15, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff8800,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.5,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
  }
}

export class ScrapyardLoot {
  private _scene: THREE.Scene;
  private _player: FPSController;
  private _audio: ScrapyardAudio;
  private _particles: ScrapyardParticles;
  private _pool: LootOrb[] = [];
  magnetRadius = 3.0;
  private _collectRadius = 0.8;

  onCollect: ((value: number) => void) | null = null;

  constructor(scene: THREE.Scene, player: FPSController, audio: ScrapyardAudio, particles: ScrapyardParticles) {
    this._scene = scene;
    this._player = player;
    this._audio = audio;
    this._particles = particles;
  }

  init(): void {
    const max = scrapyardQuality.get('maxLoot');
    for (let i = 0; i < max; i++) {
      const orb = new LootOrb();
      this._scene.add(orb.mesh);
      this._pool.push(orb);
    }
  }

  reset(): void {
    this.clearAll();
    this.magnetRadius = 3.0;
  }

  clearAll(): void {
    for (const o of this._pool) {
      o.active = false;
      o.mesh.visible = false;
    }
  }

  /** Apply magnet radius from shared upgrades (radius in world units). */
  setMagnetRadius(radius: number): void {
    this.magnetRadius = Math.max(1.0, radius);
  }

  spawnLoot(pos: THREE.Vector3, count = 1): void {
    for (let i = 0; i < count; i++) {
      const orb = this._getInactive();
      if (!orb) return;
      orb.active = true;
      orb.grounded = false;
      orb.value = LOOT_VALUE_MIN + Math.floor(Math.random() * (LOOT_VALUE_MAX - LOOT_VALUE_MIN + 1));
      orb.mesh.position.copy(pos);
      orb.mesh.position.y += 0.5;
      orb.mesh.visible = true;
      orb.velocity.set(
        (Math.random() - 0.5) * 4,
        3 + Math.random() * 2,
        (Math.random() - 0.5) * 4,
      );
    }
  }

  update(dt: number): void {
    const playerPos = this._player.position;

    for (const orb of this._pool) {
      if (!orb.active) continue;

      if (!orb.grounded) {
        orb.velocity.y -= 15 * dt;
        orb.mesh.position.x += orb.velocity.x * dt;
        orb.mesh.position.y += orb.velocity.y * dt;
        orb.mesh.position.z += orb.velocity.z * dt;

        if (orb.mesh.position.y <= 0.15) {
          orb.mesh.position.y = 0.15;
          orb.grounded = true;
          orb.velocity.set(0, 0, 0);
        }
      }

      orb._bobPhase += dt * 3;
      const bob = Math.sin(orb._bobPhase) * 0.05;
      if (orb.grounded) orb.mesh.position.y = 0.15 + bob + 0.1;

      orb.mesh.rotation.y += dt * 2;

      const dx = playerPos.x - orb.mesh.position.x;
      const dz = playerPos.z - orb.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < this.magnetRadius) {
        const pullStrength = (1 - dist / this.magnetRadius) * 15;
        orb.mesh.position.x += (dx / dist) * pullStrength * dt;
        orb.mesh.position.z += (dz / dist) * pullStrength * dt;
      }

      if (dist < this._collectRadius) {
        orb.active = false;
        orb.mesh.visible = false;
        this.onCollect?.(orb.value);
        this._audio.lootPickup();
        this._particles.spawnLootPop(orb.mesh.position);
      }
    }
  }

  private _getInactive(): LootOrb | null {
    for (const o of this._pool) if (!o.active) return o;
    return null;
  }

  getActiveCount(): number {
    let c = 0;
    for (const o of this._pool) if (o.active) c++;
    return c;
  }
}
