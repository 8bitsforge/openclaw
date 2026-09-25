import type { UsageProviderId, UsageWindow } from "./provider-usage.types.js";

// Quota windows a CLI runtime reported while running a turn, for the login
// that runtime owns and OpenClaw never uses for usage requests.
// Claude Code owns its login, so the gateway only sees the subscription
// windows through the `rate_limit_event` it streams on every turn. The store is
// process-local and derived: a newer observation of a window replaces the older one,
// and a window stops being served once its reset time has passed. A window
// without a reset time, or with one beyond the longest quota period, could never
// expire in practice, so it is not recorded.
type ObservedWindow = { window: UsageWindow; observedAt: number };

const observedWindows = new Map<UsageProviderId, ObservedWindow[]>();

// The longest subscription window is a week; allow a day of clock slack.
const MAX_OBSERVED_RESET_HORIZON_MS = 8 * 24 * 60 * 60 * 1000;

/** Usage row for the subscription behind Claude Code's own login. */
export const CLAUDE_CODE_USAGE_PROVIDER: UsageProviderId = "claude-cli";
export const CLAUDE_CODE_USAGE_DISPLAY_NAME = "Claude Code";

/** Windows a runtime reported, and when the oldest of them was reported. */
export type ObservedProviderUsage = { windows: UsageWindow[]; observedAt: number };

/** Records the latest runtime-observed quota windows for a usage provider. */
export function recordObservedProviderUsageWindows(
  provider: UsageProviderId,
  windows: UsageWindow[],
  observedAt: number = Date.now(),
): void {
  const expiring = windows.filter(
    (window) =>
      window.resetAt !== undefined && window.resetAt <= observedAt + MAX_OBSERVED_RESET_HORIZON_MS,
  );
  if (expiring.length === 0) {
    return;
  }
  // A record can carry a subset of windows; keep the others until they reset.
  const labels = new Set(expiring.map((window) => window.label));
  const kept = (observedWindows.get(provider) ?? []).filter(
    (entry) => !labels.has(entry.window.label),
  );
  observedWindows.set(provider, [...kept, ...expiring.map((window) => ({ window, observedAt }))]);
}

/** Returns observed windows that have not reached their reset time. */
export function readObservedProviderUsage(
  provider: UsageProviderId,
  now: number,
): ObservedProviderUsage | undefined {
  const entries = observedWindows.get(provider);
  if (!entries) {
    return undefined;
  }
  const current = entries.filter((entry) => (entry.window.resetAt ?? 0) > now);
  if (current.length === 0) {
    observedWindows.delete(provider);
    return undefined;
  }
  // Report the oldest observation so a stale window is never presented as fresh.
  return {
    windows: current.map((entry) => entry.window),
    observedAt: Math.min(...current.map((entry) => entry.observedAt)),
  };
}

/** Drops every observation; the next CLI turn records fresh windows. */
export function clearObservedProviderUsageWindows(): void {
  observedWindows.clear();
}
