/**
 * ScrapyardParticles.ts
 * Pooled billboard particles + canvas-texture damage numbers for the 3D
 * Scrapyard mode.
 */

import * as THREE from 'three';
import { scrapyardQuality } from './ScrapyardQuality';

class Particle {
  mesh: THREE.Mesh;
  velocity = new THREE.Vector3();
  life = 0;
  maxLife = 0;
  active = false;

  constructor() {
    const geo = new THREE.PlaneGeometry(0.2, 0.2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
  }
}

class DamageNumber {
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  sprite: THREE.Sprite;
  velocity = new THREE.Vector3();
  life = 0;
  active = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 64;
    this.ctx2d = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(1.0, 0.5, 1);
    this.sprite.visible = false;
  }

  setText(value: number | string, isCrit = false): void {
    const ctx = this.ctx2d;
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = isCrit ? '900 34px Arial' : '800 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = isCrit ? '#ffd761' : '#2dfdff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = isCrit ? '#ffd761' : '#f3fbff';
    ctx.fillText(value.toString(), 64, 32);
    ctx.shadowBlur = 0;
    this.texture.needsUpdate = true;
  }
}

export class ScrapyardParticles {
  private _particles: Particle[] = [];
  private _damageNumbers: DamageNumber[] = [];
  private _scene: THREE.Scene;
  private _camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this._scene = scene;
    this._camera = camera;
  }

  init(): void {
    const maxP = scrapyardQuality.get('maxParticles');
    const maxDN = scrapyardQuality.get('maxDamageNumbers');
    for (let i = 0; i < maxP; i++) {
      const p = new Particle();
      this._scene.add(p.mesh);
      this._particles.push(p);
    }
    for (let i = 0; i < maxDN; i++) {
      const dn = new DamageNumber();
      this._scene.add(dn.sprite);
      this._damageNumbers.push(dn);
    }
  }

  reset(): void {
    for (const p of this._particles) { p.active = false; p.mesh.visible = false; }
    for (const dn of this._damageNumbers) { dn.active = false; dn.sprite.visible = false; }
  }

  spawnImpact(position: THREE.Vector3, color: number, count = 5): void {
    for (let i = 0; i < count; i++) {
      const p = this._getParticle();
      if (!p) return;
      p.mesh.position.copy(position);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      p.mesh.visible = true;
      p.active = true;
      p.life = 0;
      p.maxLife = 0.3 + Math.random() * 0.2;
      p.velocity.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6);
      const s = 0.08 + Math.random() * 0.12;
      p.mesh.scale.set(s / 0.2, s / 0.2, 1);
    }
  }

  spawnDeathBurst(position: THREE.Vector3): void { this.spawnImpact(position, 0xff2222, 10); }
  spawnLootPop(position: THREE.Vector3): void { this.spawnImpact(position, 0xffaa00, 4); }

  spawnDamageNumber(position: THREE.Vector3, damage: number, killed = false): void {
    const dn = this._getDamageNumber();
    if (!dn) return;
    dn.sprite.position.copy(position);
    dn.sprite.position.y += 0.5;
    dn.sprite.visible = true;
    dn.active = true;
    dn.life = 0;
    dn.velocity.set((Math.random() - 0.5) * 0.5, 2.5, (Math.random() - 0.5) * 0.5);
    dn.setText(damage, killed);
    dn.sprite.scale.set(killed ? 1.5 : 1.0, killed ? 0.75 : 0.5, 1);
  }

  update(dt: number): void {
    for (const p of this._particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.active = false; p.mesh.visible = false; continue; }
      p.mesh.position.x += p.velocity.x * dt;
      p.mesh.position.y += p.velocity.y * dt;
      p.mesh.position.z += p.velocity.z * dt;
      p.velocity.y -= 9.8 * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - (p.life / p.maxLife);
      p.mesh.quaternion.copy(this._camera.quaternion);
    }
    for (const dn of this._damageNumbers) {
      if (!dn.active) continue;
      dn.life += dt;
      if (dn.life >= 0.8) { dn.active = false; dn.sprite.visible = false; continue; }
      dn.sprite.position.x += dn.velocity.x * dt;
      dn.sprite.position.y += dn.velocity.y * dt;
      dn.sprite.position.z += dn.velocity.z * dt;
      dn.velocity.y *= Math.exp(-3 * dt);
      const t = dn.life / 0.8;
      (dn.sprite.material as THREE.SpriteMaterial).opacity = 1 - t * t;
    }
  }

  private _getParticle(): Particle | null {
    for (const p of this._particles) if (!p.active) return p;
    return null;
  }

  private _getDamageNumber(): DamageNumber | null {
    for (const dn of this._damageNumbers) if (!dn.active) return dn;
    return null;
  }
}
