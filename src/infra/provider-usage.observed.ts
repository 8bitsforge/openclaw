import type { UsageProviderId, UsageWindow } from "./provider-usage.types.js";

// Quota windows a CLI runtime reported while running a turn, for providers
// whose usage endpoint cannot be reached with the credentials OpenClaw holds.
// Claude Code owns its login, so the gateway only sees the subscription
// windows through the `rate_limit_event` it streams on every turn. The store is
// process-local and derived: a newer observation of a window replaces the older one,
// and a window stops being served once its reset time has passed. A window
// without a reset time could never expire, so it is not recorded.
const observedWindows = new Map<UsageProviderId, UsageWindow[]>();

/** Records the latest runtime-observed quota windows for a usage provider. */
export function recordObservedProviderUsageWindows(
  provider: UsageProviderId,
  windows: UsageWindow[],
): void {
  const expiring = windows.filter((window) => window.resetAt !== undefined);
  if (expiring.length === 0) {
    return;
  }
  // A record can carry a subset of windows; keep the others until they reset.
  const labels = new Set(expiring.map((window) => window.label));
  const kept = (observedWindows.get(provider) ?? []).filter((window) => !labels.has(window.label));
  observedWindows.set(provider, [...kept, ...expiring]);
}

/** Returns observed windows that have not reached their reset time. */
export function readObservedProviderUsageWindows(
  provider: UsageProviderId,
  now: number,
): UsageWindow[] | undefined {
  const windows = observedWindows.get(provider);
  if (!windows) {
    return undefined;
  }
  const current = windows.filter((window) => (window.resetAt ?? 0) > now);
  if (current.length === 0) {
    observedWindows.delete(provider);
    return undefined;
  }
  return current;
}

/** Drops every observation; the next CLI turn records fresh windows. */
export function clearObservedProviderUsageWindows(): void {
  observedWindows.clear();
}
