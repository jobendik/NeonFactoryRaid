// Analytics — routes through the CrazyGames SDK analytics API when present
// so launch isn't blind. The blueprint §25 lists every event; all call sites
// were already plumbed in M0-M25 — this module is the delivery layer.
//
// When the SDK is not available (local dev), events go to console.debug so
// developers can see the funnel firing during testing without a network
// dependency. Production builds with the SDK loaded send events to
// CrazyGames' dashboard.

interface CrazyGamesAnalyticsAPI {
  // v3 SDK methods may return a Promise that rejects in 'disabled' env
  // (localhost / un-whitelisted domain). We treat the return as possibly-promise
  // so the wrapper can swallow both sync throws and async rejections.
  trackEvent?(name: string, props?: Record<string, unknown>): void | Promise<unknown>;
  // The SDK historically also accepts a single 'event' object.
  event?(name: string, props?: Record<string, unknown>): void | Promise<unknown>;
}

interface CrazyGamesSDKWithAnalytics {
  analytics?: CrazyGamesAnalyticsAPI;
}

function getAnalyticsAPI(): CrazyGamesAnalyticsAPI | null {
  if (typeof window === 'undefined') return null;
  try {
    const cg = (window as unknown as { CrazyGames?: { SDK?: CrazyGamesSDKWithAnalytics } })
      .CrazyGames;
    return cg?.SDK?.analytics ?? null;
  } catch {
    // The CrazyGames SDK v3 `analytics` getter throws (rather than returning
    // null/undefined) when accessed from an un-whitelisted domain or localhost.
    // Swallow the error and treat the API as unavailable so callers fall back
    // to the console.debug path instead of crashing.
    return null;
  }
}

// Privacy: never send PII. The blueprint event list (§25.1) is all
// gameplay-state derived — no usernames, no IP, no device fingerprints.
// Numeric counters and short string ids only.
function sanitize(props?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.length > 64) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out;
}

// Swallow both sync throws and async rejections from the SDK. In 'disabled'
// environments the SDK rejects every call with GeneralError('sdkDisabled');
// without this guard the dangling rejected promise would surface as an
// unhandled rejection attributed to whatever async caller invoked us.
function safeInvoke(fn: () => void | Promise<unknown>): boolean {
  try {
    const r = fn();
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      (r as Promise<unknown>).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export const Analytics = {
  track(event: string, props?: Record<string, unknown>): void {
    const cleaned = sanitize(props);
    const api = getAnalyticsAPI();
    if (api?.trackEvent && safeInvoke(() => api.trackEvent!(event, cleaned))) return;
    if (api?.event && safeInvoke(() => api.event!(event, cleaned))) return;
    // Dev fallback. console.debug is non-noisy by default in browser DevTools.
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[analytics]', event, cleaned ?? '');
    }
  },
};
