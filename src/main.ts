import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { RaidScene } from './scenes/RaidScene';
import { HUDScene } from './scenes/HUDScene';
import { Balance } from './config/Balance';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: Balance.rendering.backgroundColor,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: Balance.rendering.width,
    height: Balance.rendering.height,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  render: {
    pixelArt: false,
    antialias: true,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, RaidScene, HUDScene],
};

new Phaser.Game(config);
