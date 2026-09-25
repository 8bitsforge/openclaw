import { describe, expect, it } from "vitest";
import {
  clearObservedProviderUsageWindows,
  readObservedProviderUsageWindows,
  recordObservedProviderUsageWindows,
} from "./provider-usage.observed.js";

describe("provider-usage.observed", () => {
  it("serves the latest observation until each window resets", () => {
    recordObservedProviderUsageWindows("observed-latest-fixture", [
      { label: "5h", usedPercent: 10, resetAt: 1_000 },
      { label: "Week", usedPercent: 40, resetAt: 5_000 },
    ]);
    recordObservedProviderUsageWindows("observed-latest-fixture", [
      { label: "5h", usedPercent: 12, resetAt: 1_000 },
      { label: "Week", usedPercent: 41, resetAt: 5_000 },
    ]);

    expect(readObservedProviderUsageWindows("observed-latest-fixture", 500)).toEqual([
      { label: "5h", usedPercent: 12, resetAt: 1_000 },
      { label: "Week", usedPercent: 41, resetAt: 5_000 },
    ]);
    expect(readObservedProviderUsageWindows("observed-latest-fixture", 1_000)).toEqual([
      { label: "Week", usedPercent: 41, resetAt: 5_000 },
    ]);
    expect(readObservedProviderUsageWindows("observed-latest-fixture", 5_000)).toBeUndefined();
    expect(readObservedProviderUsageWindows("observed-latest-fixture", 0)).toBeUndefined();
  });

  it("does not record windows that could never expire", () => {
    recordObservedProviderUsageWindows("observed-no-reset-fixture", [
      { label: "5h", usedPercent: 10 },
    ]);

    expect(readObservedProviderUsageWindows("observed-no-reset-fixture", 0)).toBeUndefined();
  });

  it("drops every observation when cleared", () => {
    recordObservedProviderUsageWindows("observed-cleared-fixture", [
      { label: "5h", usedPercent: 10, resetAt: 1_000 },
    ]);

    clearObservedProviderUsageWindows();

    expect(readObservedProviderUsageWindows("observed-cleared-fixture", 0)).toBeUndefined();
  });

  it("keeps windows a newer partial observation does not mention", () => {
    recordObservedProviderUsageWindows("observed-partial-fixture", [
      { label: "5h", usedPercent: 10, resetAt: 1_000 },
      { label: "Week", usedPercent: 40, resetAt: 5_000 },
    ]);
    recordObservedProviderUsageWindows("observed-partial-fixture", [
      { label: "5h", usedPercent: 15, resetAt: 1_000 },
    ]);

    expect(readObservedProviderUsageWindows("observed-partial-fixture", 0)).toEqual([
      { label: "Week", usedPercent: 40, resetAt: 5_000 },
      { label: "5h", usedPercent: 15, resetAt: 1_000 },
    ]);
  });
});
