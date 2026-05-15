// Local daily-seed leaderboard. See blueprint.md §16.3.
//
// For Run C we ship a LOCAL-only board: the top scores stored in
// saveSystem.get().dailySeedHistory (capped at the most recent 30 days)
// rendered in a panel in FactoryScene.
//
// TODO(post-launch): swap submitScore for a real network backend (CrazyGames
// or a self-hosted endpoint). The async signature lets callers await the
// submission without changing flow once the network call lands. The local
// history stays as a fallback / personal-bests record.

import { saveSystem } from '../platform/SaveSystem';

export interface LeaderboardEntry {
  date: string;        // YYYY-MM-DD
  score: number;
  // True for the entry the local player just posted - the UI labels it "YOU".
  isYou: boolean;
}

const MAX_HISTORY = 30;
const MAX_DISPLAY = 10;

export const LeaderboardSystem = {
  // Marks the daily-seed slot used for `date`. Called at raid launch so a
  // fail/collapse still consumes the day's attempt.
  markAttempted(date: string): void {
    saveSystem.get().dailySeedAttempted = date;
  },

  // Records the player's score for `date`. Called only on successful
  // extract; the dailySeedHistory is what feeds the local leaderboard.
  submitScore: async (date: string, score: number): Promise<boolean> => {
    const save = saveSystem.get();
    save.dailySeedHistory = [
      { date, score },
      ...save.dailySeedHistory,
    ].slice(0, MAX_HISTORY);
    // TODO(post-launch): also POST to a real backend here.
    return true;
  },

  // Returns the top entries by score (descending). For the local-only build
  // this is just the saved history sorted; once a real backend lands, this
  // could be replaced by a remote fetch.
  getTopEntries(): LeaderboardEntry[] {
    const save = saveSystem.get();
    return save.dailySeedHistory
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DISPLAY)
      .map(e => ({ date: e.date, score: e.score, isYou: true }));
  },

  hasAttemptedToday(today: string): boolean {
    return saveSystem.get().dailySeedAttempted === today;
  },
};
