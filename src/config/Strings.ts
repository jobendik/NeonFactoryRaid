// All player-facing strings. Default English; secondary languages added in Phase 3.
// Keep this thin during Milestone 0 - additional keys are added as UI is built.

export const Strings = {
  bootOk: 'Boot OK',
  gameTitle: 'NEON FACTORY RAID',
  fps: 'FPS',
  comboLabel: 'COMBO',
  timerLabel: 'TIME',
} as const;

export type StringKey = keyof typeof Strings;
