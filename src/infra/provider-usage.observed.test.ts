import { describe, expect, it } from "vitest";
import {
  clearObservedProviderUsageWindows,
  observedProviderUsageWindowSetVersion,
  readObservedProviderUsage,
  recordObservedProviderUsageWindows,
} from "./provider-usage.observed.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("provider-usage.observed", () => {
  it("serves the latest observation until each window resets", () => {
    recordObservedProviderUsageWindows(
      "observed-latest-fixture",
      [
        { label: "5h", usedPercent: 10, resetAt: 1_000 },
        { label: "Week", usedPercent: 40, resetAt: 5_000 },
      ],
      100,
    );
    recordObservedProviderUsageWindows(
      "observed-latest-fixture",
      [
        { label: "5h", usedPercent: 12, resetAt: 1_000 },
        { label: "Week", usedPercent: 41, resetAt: 5_000 },
      ],
      200,
    );

    expect(readObservedProviderUsage("observed-latest-fixture", 500)).toEqual({
      windows: [
        { label: "5h", usedPercent: 12, resetAt: 1_000 },
        { label: "Week", usedPercent: 41, resetAt: 5_000 },
      ],
      observedAt: 200,
    });
    expect(readObservedProviderUsage("observed-latest-fixture", 1_000)).toEqual({
      windows: [{ label: "Week", usedPercent: 41, resetAt: 5_000 }],
      observedAt: 200,
    });
    expect(readObservedProviderUsage("observed-latest-fixture", 5_000)).toBeUndefined();
    expect(readObservedProviderUsage("observed-latest-fixture", 0)).toBeUndefined();
  });

  it("does not record windows that could never expire", () => {
    recordObservedProviderUsageWindows("observed-no-reset-fixture", [
      { label: "5h", usedPercent: 10 },
    ]);

    expect(readObservedProviderUsage("observed-no-reset-fixture", 0)).toBeUndefined();
  });

  it("does not record reset times beyond the longest quota period", () => {
    const observedAt = 1_000_000;
    recordObservedProviderUsageWindows(
      "observed-horizon-fixture",
      [
        { label: "5h", usedPercent: 10, resetAt: observedAt + 5 * 60 * 60 * 1000 },
        { label: "Week", usedPercent: 40, resetAt: observedAt + 400 * DAY_MS },
      ],
      observedAt,
    );

    expect(readObservedProviderUsage("observed-horizon-fixture", observedAt)).toEqual({
      windows: [{ label: "5h", usedPercent: 10, resetAt: observedAt + 5 * 60 * 60 * 1000 }],
      observedAt,
    });
  });

  it("drops every observation when cleared", () => {
    recordObservedProviderUsageWindows("observed-cleared-fixture", [
      { label: "5h", usedPercent: 10, resetAt: 1_000 },
    ]);

    clearObservedProviderUsageWindows();

    expect(readObservedProviderUsage("observed-cleared-fixture", 0)).toBeUndefined();
  });

  it("keeps windows a newer partial observation does not mention, reporting the oldest time", () => {
    recordObservedProviderUsageWindows(
      "observed-partial-fixture",
      [
        { label: "5h", usedPercent: 10, resetAt: 1_000 },
        { label: "Week", usedPercent: 40, resetAt: 5_000 },
      ],
      100,
    );
    recordObservedProviderUsageWindows(
      "observed-partial-fixture",
      [{ label: "5h", usedPercent: 15, resetAt: 1_000 }],
      300,
    );

    expect(readObservedProviderUsage("observed-partial-fixture", 0)).toEqual({
      windows: [
        { label: "Week", usedPercent: 40, resetAt: 5_000 },
        { label: "5h", usedPercent: 15, resetAt: 1_000 },
      ],
      observedAt: 100,
    });
    expect(readObservedProviderUsage("observed-partial-fixture", 1_000)).toEqual({
      windows: [{ label: "Week", usedPercent: 40, resetAt: 5_000 }],
      observedAt: 100,
    });
  });

  it("changes the window-set version only when a provider gains a window", () => {
    const provider = "observed-version-fixture";
    const window = (label: string, usedPercent: number, resetAt: number) => ({
      label,
      usedPercent,
      resetAt,
    });
    const start = observedProviderUsageWindowSetVersion();

    recordObservedProviderUsageWindows(provider, [window("5h", 10, 1_000)], 100);
    expect(observedProviderUsageWindowSetVersion()).toBe(start + 1);

    // A newer reading of a window already observed keeps the version.
    recordObservedProviderUsageWindows(provider, [window("5h", 12, 1_000)], 200);
    expect(observedProviderUsageWindowSetVersion()).toBe(start + 1);

    recordObservedProviderUsageWindows(provider, [window("Week", 40, 5_000)], 300);
    expect(observedProviderUsageWindowSetVersion()).toBe(start + 2);

    // After a reset the next window is new again.
    recordObservedProviderUsageWindows(provider, [window("5h", 1, 19_000)], 1_000);
    expect(observedProviderUsageWindowSetVersion()).toBe(start + 3);

    // Windows that would not be recorded do not change it.
    recordObservedProviderUsageWindows(provider, [{ label: "Month", usedPercent: 5 }], 1_100);
    expect(observedProviderUsageWindowSetVersion()).toBe(start + 3);
  });
});
