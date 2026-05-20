/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import type { JSX } from "solid-js";
import type { HistoryEntry, ThinkConfig } from "../types";
import { RenderMarkdown } from "./Markdown";

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  if (isYesterday) return "yesterday " + time;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

export function RenderHistoryDetail(props: {
  entry: HistoryEntry | undefined;
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent;
  thinkCollapsed: boolean;
  thinkConfig: ThinkConfig;
  renderThinking: (r: { id: string; text: string }) => JSX.Element;
}) {
  const t = props.theme;
  if (!props.entry) return <text fg={t.textMuted}>{"Conversation not found."}</text>;

  const title = props.entry.title.slice(0, 60);

  return (
    <box flexDirection="column" gap={0}>
      <text fg={t.secondary}>
        <b>{title}</b>
      </text>
      <text fg={t.textMuted}>
        {props.entry.model} · {formatTime(props.entry.created)}
      </text>
      <box flexDirection="column" gap={1} paddingTop={1}>
        <For each={props.entry.messages}>
          {(msg) => (
            <box flexDirection="column" gap={0}>
              <text fg={msg.role === "assistant" ? t.secondary : t.text}>
                <b>{msg.role === "assistant" ? "Agent:" : "You:"}</b>
              </text>
              {msg.reasoning?.map((r) => props.renderThinking(r))}
              {msg.tools?.map((tc) => (
                <text fg={t.textMuted}>
                  {`📁 ${tc.tool} ${tc.status === "completed" ? "✅" : "❌"}`}
                </text>
              ))}
              {msg.text ? (
                <box flexDirection="column">
                  <RenderMarkdown text={msg.text} theme={t} />
                </box>
              ) : (
                <text>{"\u00A0"}</text>
              )}
            </box>
          )}
        </For>
      </box>
    </box>
  );
}
