/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { HistoryEntry, ThinkConfig } from "../types";
import { formatTime, RenderHistoryDetail } from "./HistoryDetail";
import { formatKeybind, getDateGroup, renderThinking as renderThinkingRaw } from "./Helpers";

const HISTORY_TITLE_PADDING = 6;

type HistoryListProps = {
  entries: HistoryEntry[];
  selectedId?: string;
  focusedIndex: number;
  onSelect: (id: string | undefined) => void;
  onDelete: (id: string) => void;
  onToggleHistory: () => void;
  thinkCollapsed: boolean;
  thinkConfig: ThinkConfig;
  deleteKeybind: string | false;
  deleteConfirmPending: boolean;
  historyKeybind: string | false;
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent;
  contentWidth: number;
  renderThinking: (r: { id: string; text: string }) => JSX.Element;
};

export function HistoryList(props: HistoryListProps) {
  const grouped = createMemo(() => {
    const entries = props.entries;
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

  const selectedEntry = createMemo(() => {
    const id = props.selectedId;
    if (!id) return undefined;
    return props.entries.find((e) => e.id === id);
  });

  return (
    <Show when={props.selectedId && selectedEntry()} fallback={
      <box flexDirection="column" gap={1}>
        <For each={grouped()}>
          {(group) => (
            <box flexDirection="column" gap={0}>
              <text fg={props.theme.textMuted}>
                <b>{group.label}</b>
              </text>
              <For each={group.entries}>
                {(entry, index) => {
                  // Compute flat index for this entry
                  let flatIdx = 0;
                  for (const g of grouped()) {
                    if (g === group) {
                      flatIdx += index();
                      break;
                    }
                    flatIdx += g.entries.length;
                  }
                  return (
                    <box
                      flexDirection="column"
                      paddingLeft={1}
                      backgroundColor={flatIdx === props.focusedIndex ? props.theme.backgroundElement : undefined}
                      onMouseDown={() => props.onSelect(entry.id)}
                    >
                      <text fg={flatIdx === props.focusedIndex ? props.theme.primary : props.theme.text}>
                        {entry.title.slice(0, props.contentWidth - HISTORY_TITLE_PADDING)}
                      </text>
                      <box flexDirection="row" gap={1}>
                        <text fg={props.theme.textMuted}>
                          {entry.model ? entry.model.split("/").pop() : "?"}
                        </text>
                        <text fg={props.theme.textMuted}>{formatTime(entry.created)}</text>
                      </box>
                    </box>
                  );
                }}
              </For>
            </box>
          )}
        </For>
        {props.entries.length === 0 && (
          <text fg={props.theme.textMuted}>{"No history yet."}</text>
        )}
      </box>
    }>
      <RenderHistoryDetail
        entry={selectedEntry()}
        theme={props.theme}
        thinkCollapsed={props.thinkCollapsed}
        thinkConfig={props.thinkConfig}
        renderThinking={props.renderThinking}
      />
    </Show>
  );
}
