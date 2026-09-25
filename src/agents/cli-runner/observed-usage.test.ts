import { afterEach, describe, expect, it } from "vitest";
import {
  CLAUDE_CODE_USAGE_PROVIDER,
  clearObservedProviderUsageWindows,
  readObservedProviderUsage,
} from "../../infra/provider-usage.observed.js";
import { buildPreparedCliRunContext } from "../cli-runner.test-helpers.js";
import { executePreparedCliRun as executePreparedCliRunImpl } from "./execute.js";
import {
  createManagedRun,
  createSuccessfulProcessExit,
  supervisorSpawnMock,
  wrapPreparedCliRunWithTestAdmission,
} from "./execute.test-support.js";
import { shouldRecordObservedClaudeUsage } from "./observed-usage.js";

const executePreparedCliRun = wrapPreparedCliRunWithTestAdmission(executePreparedCliRunImpl);

afterEach(() => {
  supervisorSpawnMock.mockReset();
  clearObservedProviderUsageWindows();
});

describe("Claude subscription windows observed from CLI turns", () => {
  it.each([
    ["the host Claude login", undefined, true],
    ["an OpenClaw-selected auth profile", "anthropic:work", false],
  ])(
    "records Claude subscription windows from a turn under %s: %s",
    async (_name, effectiveAuthProfileId, recorded) => {
      clearObservedProviderUsageWindows();
      supervisorSpawnMock.mockImplementationOnce(async (...args: unknown[]) => {
        const input = (args[0] ?? {}) as { onStdout?: (chunk: string) => void };
        input.onStdout?.(
          [
            JSON.stringify({ type: "init", session_id: "session-limits" }),
            JSON.stringify({
              type: "rate_limit_event",
              rate_limit_info: {
                status: "allowed",
                unifiedWindows: {
                  five_hour: { utilization: 0.03, resetsAt: 1790305200 },
                  seven_day: { utilization: 0.48, resetsAt: 1790784000 },
                },
              },
              session_id: "session-limits",
            }),
            JSON.stringify({ type: "result", session_id: "session-limits", result: "ok" }),
          ].join("\n") + "\n",
        );
        return createManagedRun(createSuccessfulProcessExit());
      });
      const context = buildPreparedCliRunContext({});
      context.effectiveAuthProfileId = effectiveAuthProfileId;

      const result = await executePreparedCliRun(context);

      expect(result.text).toBe("ok");
      expect(readObservedProviderUsage(CLAUDE_CODE_USAGE_PROVIDER, 0)?.windows).toEqual(
        recorded
          ? [
              { label: "5h", usedPercent: 3, resetAt: 1790305200_000 },
              { label: "Week", usedPercent: 48, resetAt: 1790784000_000 },
            ]
          : undefined,
      );
    },
  );

  it("records Claude subscription windows only for the Gateway host's own login", () => {
    const hostRun = {
      backendId: "claude-cli",
      effectiveAuthProfileId: undefined,
      nodePlacement: null,
      runEnv: {},
      gatewayClaudeConfigDir: undefined,
    };
    expect(shouldRecordObservedClaudeUsage(hostRun)).toBe(true);
    expect(shouldRecordObservedClaudeUsage({ ...hostRun, backendId: "local-cli" })).toBe(false);
    expect(
      shouldRecordObservedClaudeUsage({
        ...hostRun,
        nodePlacement: {} as NonNullable<
          Parameters<typeof shouldRecordObservedClaudeUsage>[0]["nodePlacement"]
        >,
      }),
    ).toBe(false);
    expect(
      shouldRecordObservedClaudeUsage({
        ...hostRun,
        runEnv: { CLAUDE_CONFIG_DIR: "/srv/other-claude" },
      }),
    ).toBe(false);
    expect(
      shouldRecordObservedClaudeUsage({ ...hostRun, runEnv: { CLAUDE_CODE_OAUTH_TOKEN: "x" } }),
    ).toBe(false);
  });
});
