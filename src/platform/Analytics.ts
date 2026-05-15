// Analytics - track() funnels for events listed in blueprint.md §25. Stub for Phase 0.
// Real endpoint wiring lands in Phase 3.

export const Analytics = {
  track(_event: string, _props?: Record<string, unknown>): void {
    // Intentional no-op until Phase 3. Calls are added at event sites in earlier milestones
    // so the data path is already plumbed when we go live.
  },
};
