import { CLAUDE_SELECTED_AUTH_ENV_KEYS } from "./execute-logging.js";
import type { NodeClaudePlacement } from "./types.js";

// Credentials handed to Claude Code through its environment select an account
// other than the host login, just like an OpenClaw-selected profile.
const CLAUDE_RUN_AUTH_ENV_KEYS = [
  ...CLAUDE_SELECTED_AUTH_ENV_KEYS,
  "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
  "CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
];

/**
 * Claude Code streams the subscription windows of whatever login it runs
 * under. Only record them when that is the Gateway host's own Claude login: an
 * OpenClaw-selected profile, credentials in the run environment, a paired
 * node, or a per-run config directory can each belong to another account.
 */
export function shouldRecordObservedClaudeUsage(params: {
  backendId: string;
  effectiveAuthProfileId: string | undefined;
  nodePlacement: NodeClaudePlacement | null;
  runEnv: Record<string, string | undefined>;
  gatewayClaudeConfigDir: string | undefined;
}): boolean {
  return (
    params.backendId === "claude-cli" &&
    params.effectiveAuthProfileId === undefined &&
    params.nodePlacement === null &&
    !CLAUDE_RUN_AUTH_ENV_KEYS.some((key) => params.runEnv[key]) &&
    (params.runEnv.CLAUDE_CONFIG_DIR ?? "") === (params.gatewayClaudeConfigDir ?? "")
  );
}
