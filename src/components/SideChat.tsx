/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { THINKING_TEXT } from "../constants";
import type { OverlayState } from "../types";
import { RenderMarkdown } from "./Markdown";
import { RenderHistoryDetail, formatTime } from "./HistoryDetail";

const MAX_VISIBLE_MESSAGES = 20;
const HISTORY_TITLE_PADDING = 6; // account for padding + border around title

type RichToolState = {
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  time?: { start: number; end: number };
  callID?: string;
};

function formatKeybind(kb: string | false): string | false {
  if (kb === false) return false;
  return kb
    .split(/[+]/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
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

export function SideChat(props: OverlayState & { width: number; transcriptHeight: number; tokenLimit: number }) {
  const theme = createMemo(() => props.api.theme.current);
  let input: any;
  const [inputValue, setInputValue] = createSignal("");
  const [expandedToolCalls, setExpandedToolCalls] = createSignal<Set<string>>(new Set());

  const panelWidth = props.width;
  const contentWidth = props.width - 4;
  const terminalHeight = createMemo(() => props.api.renderer.height);
  const panelMaxHeight = createMemo(() => Math.floor(terminalHeight() * 0.6));

  const msgs = createMemo(() => {
    const messages = props.state.entries
      .map((entry) => {
        const textParts: string[] = [];
        const reasoning: Array<{ id: string; text: string }> = [];
        const tools: Array<{
          tool: string;
          title?: string;
          status: string;
          input?: Record<string, unknown>;
          output?: string;
          error?: string;
          duration?: number;
          callID: string;
        }> = [];

        for (const p of entry.parts) {
          if (p.type === "text") {
            if (p.text.trim()) textParts.push(p.text.trim());
          } else if (p.type === "reasoning") {
            if (p.text) reasoning.push({ id: p.id, text: p.text });
          } else if (p.type === "tool") {
            const ts = p.state;
            const rts = ts as RichToolState;
            tools.push({
              tool: p.tool,
              title: rts.title,
              status: ts.status,
              input: rts.input,
              output: ts.status === "completed" ? rts.output : undefined,
              error: ts.status === "error" ? rts.error : undefined,
              duration:
                rts.time?.start && rts.time?.end
                  ? (rts.time.end - rts.time.start)
                  : undefined,
              callID: (p as any).callID ?? p.id,
            });
          }
        }

        if (textParts.length === 0 && reasoning.length === 0 && tools.length === 0) return null;

        return {
          id: entry.info.id,
          role: entry.info.role as "user" | "assistant",
          text: textParts.join("\n"),
          reasoning,
          tools,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .slice(-MAX_VISIBLE_MESSAGES);

    if (props.state.loading && props.streamingAnswer) {
      const streaming = props.streamingAnswer.trim();
      const last = messages[messages.length - 1];
      const lastText = last?.role === "assistant" ? last.text : "";
      if (streaming && streaming !== lastText) {
        messages.push({
          id: "__streaming__",
          role: "assistant",
          text: streaming,
          reasoning: [],
          tools: [],
        });
      }
    }

    return messages;
  });

  const ctxLabel = createMemo(() => {
    const n = props.state.tokenCount ?? 0;
    if (n <= 0) return "";
    const current = n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
    const limit = props.tokenLimit >= 1000 ? (props.tokenLimit / 1000).toFixed(0) + "k" : String(props.tokenLimit);
    return current + "/" + limit + " ctx";
  });

  const shortModelName = createMemo(() => {
    const name = props.modelName;
    const parts = name.split("/");
    return parts.length >= 2 ? parts[parts.length - 1] : name;
  });

  const scrollboxHeight = createMemo(() => {
    const usedByHeader = 2;
    const usedByInput = 2; // 1-line input + padding
    const usedByFooter = 1;
    const border = 2;
    const minScrollbox = 3;
    return Math.max(minScrollbox, panelMaxHeight() - usedByHeader - usedByInput - usedByFooter - border);
  });

  const groupedHistory = createMemo(() => {
    const entries = props.historyEntries;
    const groups: Array<{ label: string; entries: typeof entries }> = [];
    let currentLabel = "";
    let currentGroup: typeof entries = [];
    for (const e of entries) {
      const label = getDateGroup(e.created);
      if (label !== currentLabel) {
        if (currentGroup.length > 0) {
          groups.push({ label: currentLabel, entries: currentGroup });
        }
        currentLabel = label;
        currentGroup = [];
      }
      currentGroup.push(e);
    }
    if (currentGroup.length > 0) {
      groups.push({ label: currentLabel, entries: currentGroup });
    }
    return groups;
  });

  const selectedHistoryEntry = createMemo(() => {
    const id = props.selectedHistoryId;
    if (!id) return undefined;
    return props.historyEntries.find((e) => e.id === id);
  });

  const getToolEmoji = (tool: string): string => {
    const map: Record<string, string> = {
      read: "📁",
      grep: "🔍",
      glob: "📂",
      list: "📋",
      websearch: "🌐",
      webfetch: "🌍",
    };
    return map[tool] ?? "🔧";
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case "completed": return "✅";
      case "running":
      case "pending": return "⏳";
      case "error": return "❌";
      default: return "❓";
    }
  };

  const formatDuration = (ms?: number): string => {
    if (ms == null) return "";
    if (ms < 1000) return ms + "ms";
    return (ms / 1000).toFixed(1) + "s";
  };

  const renderThinking = (r: { id: string; text: string }): JSX.Element => {
    if (!props.thinkCollapsed) {
      return (
        <box flexDirection="column">
          <text fg={theme().textMuted}>
            {"▼ thinking:"}
          </text>
          <text fg={theme().textMuted}>{r.text}</text>
        </box>
      );
    }

    const label = props.thinkConfig.showSummary
      ? "▶ thinking: " + r.text.slice(0, 60).replace(/\n/g, " ") + (r.text.length > 60 ? "..." : "")
      : "▶ thinking (" + r.text.length + " chars)";

    return <text fg={theme().textMuted}>{label}</text>;
  };

  const renderToolCall = (tc: {
    tool: string;
    title?: string;
    status: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
    duration?: number;
    callID: string;
  }) => {
    const isExpanded = expandedToolCalls().has(tc.callID);
    const toggle = () => {
      setExpandedToolCalls((prev) => {
        const next = new Set(prev);
        if (next.has(tc.callID)) next.delete(tc.callID);
        else next.add(tc.callID);
        return next;
      });
    };
    const prefix = isExpanded ? "▼" : "▶";
    const emoji = getToolEmoji(tc.tool);
    const icon = getStatusIcon(tc.status);
    const duration = formatDuration(tc.duration);
    const title = tc.title ?? tc.tool;

    return (
      <box flexDirection="column">
        <text fg={theme().textMuted} {...{ onClick: toggle } as any}>
          {`${prefix} ${emoji} ${title} ${icon} ${duration}`}
        </text>
        {isExpanded && (
          <box paddingLeft={2} flexDirection="column">
            {tc.input && Object.keys(tc.input).length > 0 && (
              <>
                <text fg={theme().secondary}>{"input:"}</text>
                {Object.entries(tc.input).map(([k, v]) => (
                  <text fg={theme().textMuted}>{`  ${k}: ${String(v)}`}</text>
                ))}
              </>
            )}
            {tc.output && (
              <>
                <text fg={theme().secondary}>{"output:"}</text>
                <text fg={theme().textMuted}>{tc.output.slice(0, 500)}</text>
              </>
            )}
            {tc.error && (
              <text fg={theme().error}>{`error: ${tc.error}`}</text>
            )}
          </box>
        )}
      </box>
    );
  };

  return (
    <box
      position="absolute"
      bottom={props.position === "bottom-right" || props.position === "bottom-left" ? 0 : undefined}
      top={props.position === "top-right" || props.position === "top-left" ? 0 : undefined}
      right={props.position === "bottom-right" || props.position === "top-right" ? 0 : undefined}
      left={props.position === "bottom-left" || props.position === "top-left" ? 0 : undefined}
      onMouseDown={() => input?.focus()}
    >
      <box
        width={panelWidth}
        height={panelMaxHeight()}
        flexDirection="column"
        border={true}
        borderColor={theme().borderActive}
        backgroundColor={theme().backgroundPanel}
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          paddingTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <box flexDirection="row" gap={1} alignItems="center">
            {props.historyMode ? (
              <Show
                when={props.selectedHistoryId}
                fallback={
                  <text fg={theme().secondary}>
                    <b>{"← History"}</b>
                  </text>
                }
              >
                <box onMouseDown={() => props.onSelectHistoryEntry(undefined)}>
                  <text fg={theme().secondary}>
                    <b>{"← Back"}</b>
                  </text>
                </box>
              </Show>
            ) : (
              <box paddingLeft={1} paddingRight={1} backgroundColor={theme().accent}>
                <text fg={theme().background}>
                  <b>{"OpenCode-SideChat"}</b>
                </text>
              </box>
            )}
          </box>
          <box flexDirection="row" gap={1} alignItems="center">
            <text fg={theme().textMuted}>{shortModelName()}</text>
            {ctxLabel() ? (
              <text fg={theme().textMuted}>{ctxLabel()}</text>
            ) : (
              <text>{"\u00A0"}</text>
            )}
          </box>
        </box>

        <box paddingLeft={1} paddingRight={1}>
          <scrollbox
            scrollY={true}
            stickyScroll={!props.historyMode}
            stickyStart={props.historyMode ? "top" : "bottom"}
            height={scrollboxHeight()}
            width={contentWidth}
          >
            <box flexDirection="column" gap={1} paddingTop={1} paddingBottom={1} width={contentWidth - 2}>
              {props.historyMode ? (
                <Show
                  when={props.selectedHistoryId}
                  fallback={
                    <box flexDirection="column" gap={1}>
                      <For each={groupedHistory()}>
                        {(group) => (
                          <box flexDirection="column" gap={0}>
                            <text fg={theme().textMuted}>
                              <b>{group.label}</b>
                            </text>
                            <For each={group.entries}>
                              {(entry) => (
                                <box
                                  flexDirection="column"
                                  paddingLeft={1}
                                  onMouseDown={() => props.onSelectHistoryEntry(entry.id)}
                                >
                                  <text fg={theme().text}>
                                    {entry.title.slice(0, contentWidth - HISTORY_TITLE_PADDING)}
                                  </text>
                                  <box flexDirection="row" gap={1}>
                                    <text fg={theme().textMuted}>
                                      {entry.model ? entry.model.split("/").pop() : "?"}
                                    </text>
                                    <text fg={theme().textMuted}>
                                      {formatTime(entry.created)}
                                    </text>
                                  </box>
                                </box>
                              )}
                            </For>
                          </box>
                        )}
                      </For>
                      {props.historyEntries.length === 0 && (
                        <text fg={theme().textMuted}>{"No history yet."}</text>
                      )}
                    </box>
                  }
                >
                  {/* History detail view — selected conversation */}
                  <RenderHistoryDetail
                    entry={selectedHistoryEntry()}
                    theme={theme()}
                    thinkCollapsed={props.thinkCollapsed}
                    thinkConfig={props.thinkConfig}
                    renderThinking={renderThinking}
                  />
                </Show>
              ) : (
                /* Normal chat view */
                <>
                  {msgs().length > 0 ? (
                    <For each={msgs()}>
                      {(msg) => (
                        <box flexDirection="column" gap={0}>
                          <text fg={msg.role === "assistant" ? theme().secondary : theme().text}>
                            <b>{msg.role === "assistant" ? "Agent:" : "You:"}</b>
                          </text>
                          {msg.reasoning.map((r) => renderThinking(r))}
                          {msg.tools?.map((tc) => renderToolCall(tc))}
                          {msg.text ? (
                            <box flexDirection="column">
                              <RenderMarkdown text={msg.text} theme={theme()} />
                            </box>
                          ) : (
                            <text>{"\u00A0"}</text>
                          )}
                        </box>
                      )}
                    </For>
                  ) : props.state.loading ? (
                    <text fg={theme().textMuted}>{THINKING_TEXT}</text>
                  ) : (
                    <text>{"\u00A0"}</text>
                  )}
                  {props.state.error ? (
                    <text fg={theme().error}>{"Error: " + String(props.state.error)}</text>
                  ) : (
                    <text>{"\u00A0"}</text>
                  )}
                </>
              )}
            </box>
          </scrollbox>
        </box>

        <Show when={!props.historyMode}>
          <box paddingLeft={1} paddingRight={1}>
            <input
              ref={(node) => { input = node; props.onInput?.(node); }}
              width={contentWidth}
              placeholder={props.state.loading ? "..." : ">"}
              textColor={theme().text}
              placeholderColor={theme().textMuted}
              backgroundColor={theme().backgroundElement}
              focusedTextColor={theme().text}
              cursorColor={theme().primary}
              focusedBackgroundColor={theme().backgroundElement}
              onInput={(value) => {
                setInputValue(value);
              }}
              onSubmit={() => {
                const submitted = (input?.value ?? inputValue()).trim();
                if (!submitted || props.state.loading) return;
                if (!props.onSubmit(submitted)) return;
                setInputValue("");
                if (input) input.value = "";
              }}
            />
          </box>
        </Show>

        {props.historyMode ? (
          <box
            flexDirection="row"
            gap={1}
            paddingTop={0}
            paddingBottom={1}
            paddingLeft={1}
            paddingRight={1}
            alignItems="center"
          >
            <text fg={theme().secondary}><b>{formatKeybind(props.historyKeybind)}</b></text>
            <box onMouseDown={props.onToggleHistory}>
              <text fg={theme().primary}>{"Back"}</text>
            </box>
            <text fg={theme().textMuted}>{"·"}</text>
            <text fg={theme().secondary}><b>{formatKeybind(props.deleteKeybind)}</b></text>
            <box onMouseDown={() => props.selectedHistoryId && props.onDeleteHistoryEntry(props.selectedHistoryId)}>
              <text fg={theme().primary}>{"Delete"}</text>
            </box>
          </box>
        ) : (
          <box
            flexDirection="row"
            gap={1}
            paddingTop={0}
            paddingBottom={1}
            paddingLeft={1}
            paddingRight={1}
            alignItems="center"
          >
            {formatKeybind(props.clearKeybind) && (
              <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onClear}>
                <text fg={theme().secondary}><b>{formatKeybind(props.clearKeybind)}</b></text>
                <text fg={theme().primary}>{"Clear"}</text>
                <text fg={theme().textMuted}>{"·"}</text>
              </box>
            )}
            {formatKeybind(props.thinkToggleKeybind) && (
              <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onToggleThink}>
                <text fg={theme().secondary}><b>{formatKeybind(props.thinkToggleKeybind)}</b></text>
                <text fg={theme().primary}>{"Thinking"}</text>
                <text fg={theme().textMuted}>{props.thinkCollapsed ? "" : "(on)"}</text>
                <text fg={theme().textMuted}>{"·"}</text>
              </box>
            )}
            <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onChangeModel}>
              <text fg={theme().secondary}><b>{"Tab"}</b></text>
              <text fg={theme().primary}>{"Model"}</text>
            </box>
            <text fg={theme().textMuted}>{"·"}</text>
            <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onToggleHistory}>
              <text fg={theme().secondary}><b>{formatKeybind(props.historyKeybind)}</b></text>
              <text fg={theme().primary}>{"History"}</text>
            </box>
          </box>
        )}
      </box>
    </box>
  );
}


