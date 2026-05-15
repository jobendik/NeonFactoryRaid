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
  factoryStubTitle: 'FACTORY',
  factoryStubSub: 'Factory hub — Milestone 8',
  factoryDeploy: 'DEPLOY',
} as const;

export type StringKey = keyof typeof Strings;
