/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";
import { extractParts } from "../parts";
import type { OverlayState } from "../types";
import { ChatTranscript } from "./ChatTranscript";
import { HistoryList } from "./HistoryList";
import { ChatInput } from "./ChatInput";
import { StatusBar } from "./StatusBar";

const MAX_VISIBLE_MESSAGES = 20;

export function SideChat(props: OverlayState & { width: number; tokenLimit: number }) {
  const theme = createMemo(() => props.api.theme.current);
  const [expandedToolCalls, setExpandedToolCalls] = createSignal<Set<string>>(new Set());
  let sideChatInput: any;

  // Reactive widths
  const panelWidth = createMemo(() => props.width);
  const contentWidth = createMemo(() => props.width - 4);
  const terminalHeight = createMemo(() => props.api.renderer.height);
  const panelMaxHeight = createMemo(() => Math.floor(terminalHeight() * 0.6));

  const scrollboxHeight = createMemo(() => {
    const usedByHeader = 2;
    const usedByInput = 2;
    const usedByFooter = 1;
    const border = 2;
    const minScrollbox = 3;
    return Math.max(minScrollbox, panelMaxHeight() - usedByHeader - usedByInput - usedByFooter - border);
  });

  const msgs = createMemo(() => {
    const messages = props.state.entries
      .map((entry) => {
        const { texts, reasoning, tools } = extractParts(entry.parts);

        if (texts.length === 0 && reasoning.length === 0 && tools.length === 0) return null;

        return {
          id: entry.info.id,
          role: entry.info.role as "user" | "assistant",
          text: texts.join("\n"),
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

  const toggleToolCall = (callID: string) => {
    setExpandedToolCalls((prev) => {
      const next = new Set(prev);
      if (next.has(callID)) next.delete(callID);
      else next.add(callID);
      return next;
    });
  };

  // Render thinking prop for HistoryList/HistoryDetail
  const renderThinking = (r: { id: string; text: string }): JSX.Element => {
    if (!props.thinkCollapsed) {
      return (
        <box flexDirection="column">
          <text fg={theme().textMuted}>{"▼ thinking:"}</text>
          <text fg={theme().textMuted}>{r.text}</text>
        </box>
      );
    }

    const label = props.thinkConfig.showSummary
      ? "▶ thinking: " + r.text.slice(0, 60).replace(/\n/g, " ") + (r.text.length > 60 ? "..." : "")
      : "▶ thinking (" + r.text.length + " chars)";

    return <text fg={theme().textMuted}>{label}</text>;
  };

  return (
    <box
      position="absolute"
      bottom={props.position === "bottom-right" || props.position === "bottom-left" ? 0 : undefined}
      top={props.position === "top-right" || props.position === "top-left" ? 0 : undefined}
      right={props.position === "bottom-right" || props.position === "top-right" ? 0 : undefined}
      left={props.position === "bottom-left" || props.position === "top-left" ? 0 : undefined}
      onMouseDown={() => sideChatInput?.focus()}
    >
      <box
        width={panelWidth()}
        height={panelMaxHeight()}
        flexDirection="column"
        border={true}
        borderColor={theme().borderActive}
        backgroundColor={theme().backgroundPanel}
      >
        {/* Header */}
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

        {/* Content */}
        <box paddingLeft={1} paddingRight={1}>
          <scrollbox
            scrollY={!props.historyMode}
            stickyScroll={!props.historyMode}
            stickyStart={props.historyMode ? "top" : "bottom"}
            height={scrollboxHeight()}
            width={contentWidth()}
          >
            <box flexDirection="column" gap={1} paddingTop={1} paddingBottom={1} width={contentWidth() - 2}>
              {props.historyMode ? (
                <HistoryList
                  entries={props.historyEntries}
                  selectedId={props.selectedHistoryId}
                  focusedIndex={props.focusedHistoryIndex}
                  onSelect={props.onSelectHistoryEntry}
                  onDelete={props.onDeleteHistoryEntry}
                  onToggleHistory={props.onToggleHistory}
                  thinkCollapsed={props.thinkCollapsed}
                  thinkConfig={props.thinkConfig}
                  deleteKeybind={props.deleteKeybind}
                  deleteConfirmPending={props.deleteConfirmPending}
                  historyKeybind={props.historyKeybind}
                  theme={theme()}
                  contentWidth={contentWidth()}
                  renderThinking={renderThinking}
                />
              ) : (
                <ChatTranscript
                  messages={msgs()}
                  loading={props.state.loading}
                  error={props.state.error}
                  thinkCollapsed={props.thinkCollapsed}
                  thinkConfig={props.thinkConfig}
                  theme={theme()}
                  expandedToolCalls={expandedToolCalls()}
                  toggleToolCall={toggleToolCall}
                />
              )}
            </box>
          </scrollbox>
        </box>

        {/* Input */}
        <Show when={!props.historyMode}>
          <ChatInput
            loading={props.state.loading}
            width={contentWidth()}
            theme={theme()}
            onSubmit={props.onSubmit}
            onInput={(node) => { sideChatInput = node; props.onInput?.(node); }}
          />
        </Show>

        {/* Footer */}
        <StatusBar
          loading={props.state.loading}
          clearKeybind={props.clearKeybind}
          thinkToggleKeybind={props.thinkToggleKeybind}
          thinkCollapsed={props.thinkCollapsed}
          modelKeybind={props.modelKeybind}
          historyKeybind={props.historyKeybind}
          onClear={props.onClear}
          onToggleThink={props.onToggleThink}
          onChangeModel={props.onChangeModel}
          onToggleHistory={props.onToggleHistory}
          onStopGeneration={props.onStopGeneration}
          historyMode={props.historyMode}
          deleteKeybind={props.deleteKeybind}
          deleteConfirmPending={props.deleteConfirmPending}
          selectedHistoryId={props.selectedHistoryId}
          onDeleteHistoryEntry={props.onDeleteHistoryEntry}
          theme={theme()}
        />
      </box>
    </box>
  );
}
