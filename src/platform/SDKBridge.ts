// CrazyGames SDK bridge - stub implementation per blueprint.md §18.2.
//
// All real SDK calls are deferred to Phase 3. In Phase 0-2 this module only:
//   - logs SDK lifecycle calls (so we can verify wiring at integration time)
//   - returns "reward granted" for rewarded ads (so reward flows work end-to-end locally)
//   - persists/loads via localStorage
//   - exposes a setMuted() entry point for §20.5 ("Honor CrazyGames SDK mute
//     events"). In Phase 3 the real SDK's mute callback wires into this.
//
// The interface here mirrors the production shape so the only change in Phase 3 will be
// replacing the method bodies, not the callsites.

import { AudioBus } from '../audio/AudioBus';

export interface RewardedAdResult {
  success: boolean;
  reason?: string;
}

export interface UserInfo {
  username: string;
}

const STORAGE_PREFIX = 'nfr:';

class SDKBridgeImpl {
  private readyResolved = false;

  async init(): Promise<void> {
    // Real SDK init happens in Phase 3. For now, mark as ready immediately.
    this.readyResolved = true;
  }

  // Called by the host platform when it wants the game muted (ads playing,
  // user backgrounded the tab, etc.). Routes to AudioBus's platform-mute
  // channel which is independent from the player's mute checkbox.
  setMuted(muted: boolean): void {
    AudioBus.setPlatformMute(muted);
  }

  loadingStart(): void {
    // SDK.game.loadingStart() - signals CrazyGames our preload is running.
  }

  loadingStop(): void {
    // SDK.game.loadingStop() - signals first playable frame ready.
  }

  gameplayStart(): void {
    // SDK.game.gameplayStart() - bracket every raid.
  }

  gameplayStop(): void {
    // SDK.game.gameplayStop() - matches gameplayStart.
  }

  async requestRewarded(): Promise<RewardedAdResult> {
    // Dev mode assumes reward granted so reward flows are testable without ads.
    return { success: true };
  }

  async requestMidgame(): Promise<void> {
    // Real SDK: SDK.ad.requestAd('midgame'). No-op locally.
  }

  happytime(): void {
    // Real SDK: SDK.game.happytime(). Hints platform to surface engagement nudges.
  }

  async saveData(key: string, data: unknown): Promise<void> {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
    } catch {
      // Quota exceeded or storage disabled - acceptable in dev, surfaced later.
    }
  }

  async loadData<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  getUser(): UserInfo {
    return { username: 'Player' };
  }

  isReady(): boolean {
    return this.readyResolved;
  }
}

export const SDKBridge = new SDKBridgeImpl();
