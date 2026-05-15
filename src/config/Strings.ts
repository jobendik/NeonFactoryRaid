// All player-facing strings. Default English; secondary languages added in Phase 3.
// Keep this thin during Milestone 0 - additional keys are added as UI is built.

export const Strings = {
  bootOk: 'Boot OK',
  gameTitle: 'NEON FACTORY RAID',
  fps: 'FPS',
  comboLabel: 'COMBO',
  timerLabel: 'TIME',
  extractionOpened: 'EXTRACTION OPEN',
  extractionHold: 'HOLD',
  summaryExtracted: 'EXTRACTION COMPLETE',
  summaryFailed: 'RAID FAILED',
  summaryCollapsed: 'TIME COLLAPSED',
  summaryScrap: 'SCRAP',
  summaryCores: 'CORES',
  summaryFactory: 'FACTORY',
  summaryRedeploy: 'ONE MORE RAID',
  summaryDoubleLoot: 'DOUBLE LOOT  [M20]',
  summaryPenalty: '-50% UNBANKED LOOT',
  greedLabel: 'GREED',
  hpLabel: 'HP',
  factoryStubTitle: 'FACTORY',
  factoryStubSub: 'Factory hub — Milestone 8',
  factoryDeploy: 'DEPLOY',
  factorySpm: 'SPM',
  factoryDeployHint: 'STAND ON PAD TO DEPLOY',
  // FTUE captions per blueprint §5.2 - max 4 words each.
  ftueMove: 'MOVE',
  ftueDash: 'DASH',
  ftuePowerup: 'POWER UP!',
  ftueExtract: 'EXTRACT',
  ftueTutorialBanner: 'TUTORIAL',
  ftueDeployPrompt: 'DEPLOY',
  // Tutorial summary single-button label per §5.2 ("Single button: UPGRADE").
  summaryUpgrade: 'UPGRADE',
} as const;

export type StringKey = keyof typeof Strings;
