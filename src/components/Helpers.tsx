/** @jsxImportSource @opentui/solid */
import type { JSX } from "solid-js";
import type { ThinkConfig } from "../types";

// Module-level pure functions (no closures, no need to recreate per render)

function formatKeybind(kb: string | false): string | false {
  if (kb === false) return false;
  return kb
    .split(/[+]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("+");
}

function getDateGroup(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (d > weekAgo) return "This week";
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

function getToolEmoji(tool: string): string {
  const map: Record<string, string> = {
    read: "📁",
    grep: "🔍",
    glob: "📂",
    list: "📋",
    websearch: "🌐",
    webfetch: "🌍",
  };
  return map[tool] ?? "🔧";
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✅";
    case "running":
    case "pending":
      return "⏳";
    case "error":
      return "❌";
    default:
      return "❓";
  }
}

function formatDuration(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

function renderThinking(
  r: { id: string; text: string },
  thinkCollapsed: boolean,
  thinkConfig: ThinkConfig,
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent,
): JSX.Element {
  if (!thinkCollapsed) {
    return (
      <box flexDirection="column">
        <text fg={theme.textMuted}>{"▼ thinking:"}</text>
        <text fg={theme.textMuted}>{r.text}</text>
      </box>
    );
  }

  const label = thinkConfig.showSummary
    ? "▶ thinking: " + r.text.slice(0, 60).replace(/\n/g, " ") + (r.text.length > 60 ? "..." : "")
    : "▶ thinking (" + r.text.length + " chars)";

  return <text fg={theme.textMuted}>{label}</text>;
}

function renderToolCall(
  tc: {
    tool: string;
    title?: string;
    status: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
    duration?: number;
    callID: string;
  },
  expandedToolCalls: Set<string>,
  toggleToolCall: (callID: string) => void,
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent,
): JSX.Element {
  const isExpanded = expandedToolCalls.has(tc.callID);
  const prefix = isExpanded ? "▼" : "▶";
  const emoji = getToolEmoji(tc.tool);
  const icon = getStatusIcon(tc.status);
  const duration = formatDuration(tc.duration);
  const title = tc.title ?? tc.tool;

  return (
    <box flexDirection="column">
      <text fg={theme.textMuted} {...{ onClick: () => toggleToolCall(tc.callID) } as any}>
        {`${prefix} ${emoji} ${title} ${icon} ${duration}`}
      </text>
      {isExpanded && (
        <box paddingLeft={2} flexDirection="column">
          {tc.input && Object.keys(tc.input).length > 0 && (
            <>
              <text fg={theme.secondary}>{"input:"}</text>
              {Object.entries(tc.input).map(([k, v]) => (
                <text fg={theme.textMuted}>{`  ${k}: ${String(v)}`}</text>
              ))}
            </>
          )}
          {tc.output && (
            <>
              <text fg={theme.secondary}>{"output:"}</text>
              <text fg={theme.textMuted}>{tc.output.slice(0, 500)}</text>
            </>
          )}
          {tc.error && <text fg={theme.error}>{`error: ${tc.error}`}</text>}
        </box>
      )}
    </box>
  );
}

export {
  formatKeybind,
  getDateGroup,
  getToolEmoji,
  getStatusIcon,
  formatDuration,
  renderThinking,
  renderToolCall,
};
