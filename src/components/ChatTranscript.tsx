/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import { THINKING_TEXT } from "../constants";
import type { ThinkConfig } from "../types";
import { renderThinking, renderToolCall } from "./Helpers";
import { RenderMarkdown } from "./Markdown";

type ChatTranscriptProps = {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    reasoning: Array<{ id: string; text: string }>;
    tools: Array<{
      tool: string;
      title?: string;
      status: string;
      input?: Record<string, unknown>;
      output?: string;
      error?: string;
      duration?: number;
      callID: string;
    }>;
  }>;
  loading: boolean;
  error?: string;
  thinkCollapsed: boolean;
  thinkConfig: ThinkConfig;
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent;
  expandedToolCalls: Set<string>;
  toggleToolCall: (id: string) => void;
};

export function ChatTranscript(props: ChatTranscriptProps) {
  return (
    <>
      {props.messages.length > 0 ? (
        <For each={props.messages}>
          {(msg) => (
            <box flexDirection="column" gap={0}>
              <text fg={msg.role === "assistant" ? props.theme.secondary : props.theme.text}>
                <b>{msg.role === "assistant" ? "Agent:" : "You:"}</b>
              </text>
              {msg.reasoning.map((r) => renderThinking(r, props.thinkCollapsed, props.thinkConfig, props.theme))}
              {msg.tools?.map((tc) => renderToolCall(tc, props.expandedToolCalls, props.toggleToolCall, props.theme))}
              {msg.text ? (
                <box flexDirection="column">
                  <RenderMarkdown text={msg.text} theme={props.theme} />
                </box>
              ) : (
                <text>{"\u00A0"}</text>
              )}
            </box>
          )}
        </For>
      ) : props.loading ? (
        <text fg={props.theme.textMuted}>{THINKING_TEXT}</text>
      ) : (
        <text>{"\u00A0"}</text>
      )}
      {props.error ? (
        <text fg={props.theme.error}>{"Error: " + String(props.error)}</text>
      ) : (
        <text>{"\u00A0"}</text>
      )}
    </>
  );
}
