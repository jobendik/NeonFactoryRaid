import Phaser from 'phaser';
import { Balance } from '../config/Balance';
import { Enemy } from '../entities/Enemy';
import type { EnemyKind } from '../config/EnemyDefs';

// Spawn director per blueprint §7.2:
//   - Spawn cooldown ramps from 0.95s -> 0.24s as the raid progresses (intensity 0..1).
//   - Max simultaneous enemies = 7 + intensity * 25, capped at 32.
//   - Spawns 720px from the player on a random angle (off-screen on a 1280x720 canvas).
//
// Milestone 2 ships Grunt only. Weighted enemy roll lands in Milestone 5.

export interface PlayerPositionProvider {
  (): { x: number; y: number };
}

export class WaveDirector {
  private group: Phaser.GameObjects.Group;
  private getPlayerPos: PlayerPositionProvider;
  private spawnTimer = 0;
  private elapsed = 0;
  private active = false;

  constructor(group: Phaser.GameObjects.Group, getPlayerPos: PlayerPositionProvider) {
    this.group = group;
    this.getPlayerPos = getPlayerPos;
  }

  start(): void {
    this.active = true;
    this.elapsed = 0;
    this.spawnTimer = 0;
  }

  stop(): void {
    this.active = false;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    this.spawnTimer -= dt;

    const intensity = Math.min(1, this.elapsed / Balance.raid.normalDuration);
    const cap = Math.min(Balance.enemies.maxOnScreen, 7 + Math.floor(intensity * 25));

    if (this.spawnTimer > 0) return;
    if (this.countActive() >= cap) return;

    this.spawnOne();
    this.spawnTimer = Phaser.Math.Linear(
      Balance.enemies.spawnCooldownStart,
      Balance.enemies.spawnCooldownEnd,
      intensity,
    );
  }

  private pickKind(): EnemyKind {
    // M2: Grunt-only. Weighted roll across the §7.2 table lands in M5.
    return 'grunt';
  }

  private spawnOne(): void {
    const player = this.getPlayerPos();
    const angle = Math.random() * Math.PI * 2;
    const dist = Balance.enemies.spawnDistance;
    const wb = Balance.player.worldBounds;
    const margin = 24;
    const x = Phaser.Math.Clamp(player.x + Math.cos(angle) * dist, wb.minX + margin, wb.maxX - margin);
    const y = Phaser.Math.Clamp(player.y + Math.sin(angle) * dist, wb.minY + margin, wb.maxY - margin);

    const enemy = this.group.get(x, y) as Enemy | null;
    if (!enemy) return;
    enemy.spawn(x, y, this.pickKind());
  }

  private countActive(): number {
    let n = 0;
    for (const c of this.group.getChildren()) {
      if (c.active) n++;
    }
    return n;
  }
}
