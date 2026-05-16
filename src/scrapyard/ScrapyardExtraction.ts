/**
 * ScrapyardExtraction.ts
 * Extraction zone with beacon, ring, and timer that pauses when the player
 * leaves the zone.
 */

import * as THREE from 'three';
import type { FPSController } from './FPSController';
import type { ScrapyardAudio } from './ScrapyardAudio';

export const SCRAPYARD_EXTRACT_TIME = 10;
const ZONE_RADIUS = 3;

export class ScrapyardExtraction {
  private _scene: THREE.Scene;
  private _player: FPSController;
  private _audio: ScrapyardAudio;
  private _group: THREE.Group = new THREE.Group();
  private _zoneMesh: THREE.Mesh | null = null;
  private _beaconMesh: THREE.Mesh | null = null;
  private _beaconLight: THREE.PointLight | null = null;
  private _position = new THREE.Vector3();
  timer = 0;
  isPlayerInZone = false;
  private _beepTimer = 0;
  private _pulsePhase = 0;
  private _added = false;

  // Called when the extraction timer completes.
  onExtract: (() => void) | null = null;
  // Called when player enters/leaves the zone (for HUD).
  onZoneChange: ((inside: boolean) => void) | null = null;

  constructor(scene: THREE.Scene, player: FPSController, audio: ScrapyardAudio) {
    this._scene = scene;
    this._player = player;
    this._audio = audio;
  }

  init(): void {
    const ringGeo = new THREE.RingGeometry(ZONE_RADIUS - 0.3, ZONE_RADIUS, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this._zoneMesh = new THREE.Mesh(ringGeo, ringMat);
    this._zoneMesh.rotation.x = -Math.PI / 2;
    this._zoneMesh.position.y = 0.02;
    this._group.add(this._zoneMesh);

    const fillGeo = new THREE.CircleGeometry(ZONE_RADIUS - 0.3, 32);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.01;
    this._group.add(fill);

    const beaconGeo = new THREE.BoxGeometry(0.1, 30, 0.1);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.3,
    });
    this._beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    this._beaconMesh.position.y = 15;
    this._group.add(this._beaconMesh);

    this._beaconLight = new THREE.PointLight(0x00ff88, 2, 12);
    this._beaconLight.position.y = 1;
    this._group.add(this._beaconLight);

    this._group.visible = false;
    this._scene.add(this._group);
    this._added = true;
  }

  reset(extractionPos: THREE.Vector3): void {
    this.timer = 0;
    this.isPlayerInZone = false;
    this._beepTimer = 0;
    this._pulsePhase = 0;
    this._position.copy(extractionPos);
    this._group.position.set(extractionPos.x, 0, extractionPos.z);
    this._group.visible = true;
  }

  clear(): void {
    this._group.visible = false;
    this.timer = 0;
    this.isPlayerInZone = false;
  }

  update(dt: number): void {
    if (!this._group.visible || !this._player.alive) return;

    const dx = this._player.position.x - this._position.x;
    const dz = this._player.position.z - this._position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const wasInZone = this.isPlayerInZone;
    this.isPlayerInZone = dist < ZONE_RADIUS;

    if (this.isPlayerInZone) {
      if (!wasInZone) this.onZoneChange?.(true);
      this.timer += dt;

      this._beepTimer += dt;
      if (this._beepTimer >= 1.0) {
        this._beepTimer -= 1.0;
        this._audio.extractionBeep();
      }

      if (this.timer >= SCRAPYARD_EXTRACT_TIME) {
        this.onExtract?.();
        return;
      }
    } else {
      if (wasInZone) this.onZoneChange?.(false);
    }

    this._pulsePhase += dt * 3;
    const pulse = 0.3 + Math.sin(this._pulsePhase) * 0.2;
    if (this._zoneMesh) (this._zoneMesh.material as THREE.MeshBasicMaterial).opacity = this.isPlayerInZone ? 0.7 : pulse;
    if (this._beaconMesh) (this._beaconMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(this._pulsePhase * 0.5) * 0.1;
    if (this._beaconLight) this._beaconLight.intensity = this.isPlayerInZone ? 3 : 1.5 + Math.sin(this._pulsePhase) * 0.5;
  }

  dispose(): void {
    if (this._added) this._scene.remove(this._group);
    this._group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
        else m.material.dispose();
      }
    });
    this._added = false;
  }

  getProgress(): number {
    return Math.min(this.timer / SCRAPYARD_EXTRACT_TIME, 1);
  }

  getPosition(): THREE.Vector3 {
    return this._position;
  }

  getRadius(): number {
    return ZONE_RADIUS;
  }
}
