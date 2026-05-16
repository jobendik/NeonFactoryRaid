/**
 * ScrapyardEnemySystem.ts
 * Object-pooled 3D enemies (Rusher + Shooter) with AI, separation,
 * projectiles, sphere raycast with headshot detection.
 */

import * as THREE from 'three';
import type { FPSController } from './FPSController';
import type { ScrapyardAudio } from './ScrapyardAudio';
import type { ScrapyardParticles } from './ScrapyardParticles';
import { scrapyardQuality } from './ScrapyardQuality';

export type EnemyType = 'RUSHER' | 'SHOOTER';

interface EnemyTypeData {
  speed: number;
  hp: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  color: number;
  emissive: number;
  scale: number;
  lootMin: number;
  lootMax: number;
}

const ENEMY_TYPES: Record<EnemyType, EnemyTypeData> = {
  RUSHER: {
    speed: 5, hp: 40, damage: 12, attackRange: 1.8, attackCooldown: 1.0,
    color: 0xff2222, emissive: 0xff0000, scale: 0.7, lootMin: 1, lootMax: 2,
  },
  SHOOTER: {
    speed: 2.5, hp: 60, damage: 8, attackRange: 15, attackCooldown: 2.0,
    color: 0xff4444, emissive: 0xcc0000, scale: 0.85, lootMin: 2, lootMax: 3,
  },
};

export class Enemy {
  mesh: THREE.Mesh;
  eye: THREE.Mesh;
  projectile: THREE.Mesh | null = null;
  active = false;
  hp = 0;
  maxHP = 0;
  type: EnemyType = 'RUSHER';
  attackTimer = 0;
  speed = 0;
  damage = 0;
  radius = 0.56;
  projActive = false;
  projVelocity = new THREE.Vector3();
  _dir = new THREE.Vector3();

  constructor() {
    const geo = new THREE.BoxGeometry(0.8, 1.4, 0.6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff2222, roughness: 0.5, metalness: 0.3,
      emissive: 0xff0000, emissiveIntensity: 0.4,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;

    const eyeGeo = new THREE.BoxGeometry(0.5, 0.1, 0.05);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.eye = new THREE.Mesh(eyeGeo, eyeMat);
    this.eye.position.set(0, 0.35, 0.31);
    this.mesh.add(this.eye);
  }
}

export interface EnemyRaycastHit {
  enemy: Enemy;
  point: THREE.Vector3;
  headshot: boolean;
}

export class ScrapyardEnemySystem {
  private _scene: THREE.Scene;
  private _player: FPSController;
  private _audio: ScrapyardAudio;
  private _particles: ScrapyardParticles;
  private _pool: Enemy[] = [];
  private _spawnPoints: THREE.Vector3[] = [];
  private _spawnTimer = 0;
  private _spawnInterval = 3.0;
  private _difficultyTimer = 0;
  private _waveCount = 0;
  private _sepVec = new THREE.Vector3();
  private _projDir = new THREE.Vector3();
  private _hitTargets: THREE.Mesh[] = [];
  private _rayHitPoint = new THREE.Vector3();

  // Callbacks
  onKill: ((enemy: Enemy) => void) | null = null;
  onLootDrop: ((pos: THREE.Vector3, count: number) => void) | null = null;

  constructor(scene: THREE.Scene, player: FPSController, audio: ScrapyardAudio, particles: ScrapyardParticles) {
    this._scene = scene;
    this._player = player;
    this._audio = audio;
    this._particles = particles;
  }

  init(): void {
    const max = scrapyardQuality.get('maxEnemies');
    for (let i = 0; i < max; i++) {
      const e = new Enemy();
      this._scene.add(e.mesh);

      const projGeo = new THREE.SphereGeometry(0.12, 6, 6);
      const projMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
      e.projectile = new THREE.Mesh(projGeo, projMat);
      e.projectile.visible = false;
      this._scene.add(e.projectile);

      this._pool.push(e);
    }
  }

  reset(spawnPoints: THREE.Vector3[]): void {
    this.clearAll();
    this._spawnPoints = spawnPoints;
    this._spawnTimer = 1.5;
    this._spawnInterval = 3.0;
    this._difficultyTimer = 0;
    this._waveCount = 0;
  }

  clearAll(): void {
    for (const e of this._pool) {
      e.active = false;
      e.mesh.visible = false;
      e.projActive = false;
      if (e.projectile) e.projectile.visible = false;
    }
  }

  update(dt: number): void {
    if (!this._player.alive) return;

    this._difficultyTimer += dt;
    if (this._difficultyTimer > 15) {
      this._difficultyTimer = 0;
      this._spawnInterval = Math.max(0.8, this._spawnInterval - 0.3);
    }

    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = this._spawnInterval;
      const type: EnemyType = Math.random() < 0.6 ? 'RUSHER' : 'SHOOTER';
      this._spawnEnemy(type);
      this._waveCount++;
      if (this._waveCount > 5 && Math.random() < 0.4) this._spawnEnemy('RUSHER');
    }

    const playerPos = this._player.position;

    for (const e of this._pool) {
      if (!e.active) continue;

      e._dir.subVectors(playerPos, e.mesh.position);
      e._dir.y = 0;
      const dist = e._dir.length();
      e._dir.normalize();

      e.mesh.lookAt(playerPos.x, e.mesh.position.y, playerPos.z);

      const typeData = ENEMY_TYPES[e.type];
      if (dist > typeData.attackRange * 0.8) {
        const sep = this._getSeparation(e);
        const moveX = (e._dir.x + sep.x * 0.3) * e.speed * dt;
        const moveZ = (e._dir.z + sep.z * 0.3) * e.speed * dt;
        e.mesh.position.x += moveX;
        e.mesh.position.z += moveZ;
      }

      e.attackTimer -= dt;
      if (e.attackTimer <= 0 && dist < typeData.attackRange) {
        e.attackTimer = typeData.attackCooldown;
        if (e.type === 'RUSHER') {
          this._player.takeDamage(e.damage);
          this._particles.spawnImpact(playerPos, 0xff0000, 3);
        } else if (e.type === 'SHOOTER' && !e.projActive) {
          this._fireProjectile(e);
        }
      }

      if (e.projActive && e.projectile) {
        e.projectile.position.x += e.projVelocity.x * dt;
        e.projectile.position.y += e.projVelocity.y * dt;
        e.projectile.position.z += e.projVelocity.z * dt;

        const projDist = e.projectile.position.distanceTo(playerPos);
        if (projDist < 0.6) {
          this._player.takeDamage(e.damage);
          this._particles.spawnImpact(playerPos, 0xff4400, 3);
          e.projActive = false;
          e.projectile.visible = false;
        }
        if (e.projectile.position.distanceTo(e.mesh.position) > 30) {
          e.projActive = false;
          e.projectile.visible = false;
        }
      }
    }
  }

  private _spawnEnemy(type: EnemyType): void {
    const e = this._getInactive();
    if (!e || this._spawnPoints.length === 0) return;

    const typeData = ENEMY_TYPES[type];
    const spawnIdx = Math.floor(Math.random() * this._spawnPoints.length);
    const spawnPos = this._spawnPoints[spawnIdx];

    e.active = true;
    e.type = type;
    e.hp = typeData.hp;
    e.maxHP = typeData.hp;
    e.speed = typeData.speed;
    e.damage = typeData.damage;
    e.attackTimer = typeData.attackCooldown * 0.5;
    e.mesh.position.set(spawnPos.x, 0.7, spawnPos.z);
    e.mesh.scale.setScalar(typeData.scale);
    const mat = e.mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(typeData.color);
    mat.emissive.setHex(typeData.emissive);
    e.mesh.visible = true;
  }

  private _fireProjectile(e: Enemy): void {
    if (!e.projectile) return;
    this._projDir.subVectors(this._player.position, e.mesh.position).normalize();
    e.projectile.position.copy(e.mesh.position);
    e.projectile.position.y += 0.5;
    e.projVelocity.copy(this._projDir).multiplyScalar(12);
    e.projActive = true;
    e.projectile.visible = true;
  }

  private _getSeparation(enemy: Enemy): THREE.Vector3 {
    const sep = this._sepVec;
    sep.set(0, 0, 0);
    let count = 0;
    for (const other of this._pool) {
      if (!other.active || other === enemy) continue;
      const d = enemy.mesh.position.distanceTo(other.mesh.position);
      if (d < 2.0 && d > 0.01) {
        sep.x += (enemy.mesh.position.x - other.mesh.position.x) / d;
        sep.z += (enemy.mesh.position.z - other.mesh.position.z) / d;
        count++;
      }
    }
    if (count > 0) { sep.x /= count; sep.z /= count; }
    return sep;
  }

  /** Deal damage to an enemy. Returns true if killed. */
  damageEnemy(enemy: Enemy, damage: number): boolean {
    if (!enemy || !enemy.active) return false;
    enemy.hp -= damage;
    const mat = enemy.mesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 1.5;
    setTimeout(() => { if (enemy.mesh) (enemy.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4; }, 80);

    if (enemy.hp <= 0) {
      this._killEnemy(enemy);
      return true;
    }
    return false;
  }

  private _killEnemy(enemy: Enemy): void {
    const pos = enemy.mesh.position.clone();
    enemy.active = false;
    enemy.mesh.visible = false;
    enemy.projActive = false;
    if (enemy.projectile) enemy.projectile.visible = false;

    this._audio.enemyDeath();
    this._particles.spawnDeathBurst(pos);
    this.onKill?.(enemy);

    const typeData = ENEMY_TYPES[enemy.type];
    const count = typeData.lootMin + Math.floor(Math.random() * (typeData.lootMax - typeData.lootMin + 1));
    this.onLootDrop?.(pos, count);
  }

  getHitTargets(): THREE.Mesh[] {
    this._hitTargets.length = 0;
    for (const e of this._pool) if (e.active) this._hitTargets.push(e.mesh);
    return this._hitTargets;
  }

  /**
   * Custom sphere raycast with headshot detection.
   * Returns the closest active enemy hit, or null.
   */
  raycastEnemy(origin: THREE.Vector3, dir: THREE.Vector3, range: number): EnemyRaycastHit | null {
    let best: EnemyRaycastHit | null = null;
    let bestT = range;

    for (const e of this._pool) {
      if (!e.active) continue;
      const center = e.mesh.position;
      const radius = e.radius;

      const ocx = center.x - origin.x;
      const ocy = center.y + 0.15 - origin.y;
      const ocz = center.z - origin.z;
      const t = ocx * dir.x + ocy * dir.y + ocz * dir.z;
      if (t < 0 || t > range || t > bestT) continue;

      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const dx = center.x - px;
      const dy = center.y + 0.25 - py;
      const dz = center.z - pz;
      const d2 = dx * dx + dy * dy + dz * dz;

      if (d2 <= radius * radius) {
        bestT = t;
        this._rayHitPoint.set(px, py, pz);
        best = {
          enemy: e,
          point: this._rayHitPoint.clone(),
          headshot: py > center.y + 0.72,
        };
      }
    }
    return best;
  }

  private _getInactive(): Enemy | null {
    for (const e of this._pool) if (!e.active) return e;
    return null;
  }

  getActiveCount(): number {
    let c = 0;
    for (const e of this._pool) if (e.active) c++;
    return c;
  }
}
