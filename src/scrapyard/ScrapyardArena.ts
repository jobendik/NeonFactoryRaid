/**
 * ScrapyardArena.ts
 * Procedural neon arena with floor, perimeter walls, cover blocks, loot
 * crates, extraction zone, and enemy spawn points.
 */

import * as THREE from 'three';

const ARENA_SIZE = 48;
const HALF = ARENA_SIZE / 2;
const WALL_HEIGHT = 2.5;

export class ScrapyardArena {
  private _scene: THREE.Scene;
  private _group: THREE.Group = new THREE.Group();
  private _colliders: THREE.Box3[] = [];
  private _wallMeshes: THREE.Mesh[] = [];
  private _spawnPoints: THREE.Vector3[] = [];
  private _cratePositions: THREE.Vector3[] = [];
  private _extractionPos = new THREE.Vector3();
  private _playerSpawn = new THREE.Vector3(0, 1.7, 0);
  private _generated = false;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
  }

  generate(): void {
    this.clear();

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x071226, roughness: 0.82, metalness: 0.18 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE, 0.6, ARENA_SIZE), floorMat);
    floor.position.y = -0.35;
    floor.receiveShadow = true;
    this._group.add(floor);

    const grid = new THREE.GridHelper(ARENA_SIZE, 24, 0x174d67, 0x0b2839);
    grid.position.y = 0.012;
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.34;
    this._group.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0c1b35, emissive: 0x021826, roughness: 0.7,
    });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x2dfdff });

    const walls: { p: [number, number, number]; s: [number, number, number] }[] = [
      { p: [0, WALL_HEIGHT / 2, -HALF - 0.5], s: [ARENA_SIZE + 1, WALL_HEIGHT, 1] },
      { p: [0, WALL_HEIGHT / 2, HALF + 0.5], s: [ARENA_SIZE + 1, WALL_HEIGHT, 1] },
      { p: [-HALF - 0.5, WALL_HEIGHT / 2, 0], s: [1, WALL_HEIGHT, ARENA_SIZE + 1] },
      { p: [HALF + 0.5, WALL_HEIGHT / 2, 0], s: [1, WALL_HEIGHT, ARENA_SIZE + 1] },
    ];

    for (const w of walls) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.s), wallMat.clone());
      mesh.position.set(...w.p);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._group.add(mesh);
      this._wallMeshes.push(mesh);

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(w.s[0] + 0.03, 0.08, w.s[2] + 0.03),
        neonMat,
      );
      strip.position.set(w.p[0], WALL_HEIGHT + 0.06, w.p[2]);
      this._group.add(strip);

      const box = new THREE.Box3();
      box.min.set(w.p[0] - w.s[0] / 2, 0, w.p[2] - w.s[2] / 2);
      box.max.set(w.p[0] + w.s[0] / 2, WALL_HEIGHT, w.p[2] + w.s[2] / 2);
      this._colliders.push(box);
    }

    const coverMat = new THREE.MeshStandardMaterial({
      color: 0x10254a, emissive: 0x06112c, roughness: 0.58, metalness: 0.16,
    });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x2dfdff, transparent: true, opacity: 0.85 });

    const coverBlocks: number[][] = [
      [-9, 0.8, -8, 5, 1.6, 2.2],
      [8, 0.9, -7, 2.4, 1.8, 5.2],
      [-12, 0.65, 8, 3.8, 1.3, 3.8],
      [10, 1.1, 9, 6.8, 2.2, 1.8],
      [0, 0.75, 0, 4, 1.5, 4],
      [-18, 0.6, -1, 2.5, 1.2, 5],
      [18, 0.6, 1, 2.5, 1.2, 5],
      [1, 0.55, 17, 7, 1.1, 2],
      [-6, 0.8, -18, 2, 1.6, 1.5],
      [6, 0.8, -18, 2, 1.6, 1.5],
    ];

    for (const b of coverBlocks) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b[3], b[4], b[5]), coverMat.clone());
      mesh.position.set(b[0], b[1], b[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._group.add(mesh);
      this._wallMeshes.push(mesh);

      const top = new THREE.Mesh(new THREE.BoxGeometry(b[3] + 0.06, 0.035, b[5] + 0.06), edgeMat);
      top.position.set(b[0], b[1] + b[4] / 2 + 0.035, b[2]);
      this._group.add(top);

      const box = new THREE.Box3();
      box.min.set(b[0] - b[3] / 2, 0, b[2] - b[5] / 2);
      box.max.set(b[0] + b[3] / 2, b[1] + b[4] / 2, b[2] + b[5] / 2);
      this._colliders.push(box);
    }

    const crateSpots = [
      { x: -9, z: 0 }, { x: 9, z: 0 },
      { x: 0, z: 14 }, { x: 0, z: -14 },
      { x: -15, z: -15 }, { x: 15, z: 15 },
    ];
    for (const c of crateSpots) {
      this._buildCrate(c.x, c.z);
      this._cratePositions.push(new THREE.Vector3(c.x, 0.4, c.z));
    }

    this._buildExtractionZone(17, -16);

    this._spawnPoints = [
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(20, 0, -19),
      new THREE.Vector3(-21, 0, 18),
      new THREE.Vector3(20, 0, 20),
      new THREE.Vector3(0, 0, -22),
      new THREE.Vector3(-23, 0, 0),
    ];

    this._playerSpawn.set(0, 1.7, 12);
    this._extractionPos.set(17, 0, -16);

    this._scene.add(this._group);
    this._generated = true;
  }

  private _buildExtractionZone(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.03, z);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.15, 0.07, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd761, transparent: true, opacity: 0.88 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(3.05, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd761, transparent: true, opacity: 0.11, side: THREE.DoubleSide }),
    );
    disk.rotation.x = -Math.PI / 2;
    group.add(disk);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 6.5, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd761, transparent: true, opacity: 0.22 }),
    );
    beacon.position.y = 3.2;
    group.add(beacon);

    const light = new THREE.PointLight(0xffd761, 18, 18, 2);
    light.position.y = 2.2;
    group.add(light);

    this._group.add(group);
  }

  private _buildCrate(x: number, z: number): void {
    const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x332200,
      roughness: 0.3,
      metalness: 0.6,
      emissive: 0xff8800,
      emissiveIntensity: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.4, z);
    mesh.castShadow = true;
    this._group.add(mesh);

    const box = new THREE.Box3();
    box.min.set(x - 0.4, 0, z - 0.4);
    box.max.set(x + 0.4, 0.8, z + 0.4);
    this._colliders.push(box);
  }

  clear(): void {
    if (this._generated) this._scene.remove(this._group);
    this._group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
        else m.material.dispose();
      }
    });
    this._group = new THREE.Group();
    this._colliders = [];
    this._wallMeshes = [];
    this._spawnPoints = [];
    this._cratePositions = [];
    this._generated = false;
  }

  getColliders(): THREE.Box3[] { return this._colliders; }
  getWallMeshes(): THREE.Mesh[] { return this._wallMeshes; }
  getSpawnPoints(): THREE.Vector3[] { return this._spawnPoints; }
  getExtractionPosition(): THREE.Vector3 { return this._extractionPos.clone(); }
  getPlayerSpawn(): THREE.Vector3 { return this._playerSpawn.clone(); }
  getCratePositions(): THREE.Vector3[] { return this._cratePositions; }
}
