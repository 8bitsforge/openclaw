import type { UsageProviderId, UsageWindow } from "./provider-usage.types.js";

// Quota windows a CLI runtime reported while running a turn, for the login
// that runtime owns and OpenClaw never uses for usage requests.
// Claude Code owns its login, so the gateway only sees the subscription
// windows through the `rate_limit_event` it streams on every turn. The store is
// process-local and derived: a newer observation of a window replaces the older one,
// and a window stops being served once its reset time has passed. A window
// without a reset time could never expire, so it is not recorded.
const observedWindows = new Map<UsageProviderId, UsageWindow[]>();

/** Usage row for the subscription behind Claude Code's own login. */
export const CLAUDE_CODE_USAGE_PROVIDER: UsageProviderId = "claude-cli";
export const CLAUDE_CODE_USAGE_DISPLAY_NAME = "Claude Code";

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
