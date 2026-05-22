/** @jsxImportSource @opentui/solid */
import { formatKeybind } from "./Helpers";

type StatusBarProps = {
  loading: boolean;
  clearKeybind: string | false;
  thinkToggleKeybind: string | false;
  thinkCollapsed: boolean;
  modelKeybind: string | false;
  historyKeybind: string | false;
  onClear: () => void;
  onToggleThink: () => void;
  onChangeModel: () => void;
  onToggleHistory: () => void;
  onStopGeneration: () => void;
  // History mode props
  historyMode: boolean;
  deleteKeybind: string | false;
  deleteConfirmPending: boolean;
  selectedHistoryId?: string;
  onDeleteHistoryEntry: (id: string) => void;
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent;
};

function ChatFooter(props: {
  loading: boolean;
  clearKeybind: string | false;
  thinkToggleKeybind: string | false;
  thinkCollapsed: boolean;
  modelKeybind: string | false;
  historyKeybind: string | false;
  onClear: () => void;
  onToggleThink: () => void;
  onChangeModel: () => void;
  onToggleHistory: () => void;
  onStopGeneration: () => void;
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent;
}) {
  return (
    <box
      flexDirection="row"
      gap={1}
      paddingTop={0}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      alignItems="center"
    >
      {props.loading ? (
        <box flexDirection="row" gap={1} alignItems="center" onMouseDown={() => props.onStopGeneration()}>
          <text fg={props.theme.error}>
            <b>{"Esc"}</b>
          </text>
          <text fg={props.theme.primary}>{"Stop"}</text>
        </box>
      ) : (
        <>
          {formatKeybind(props.clearKeybind) && (
            <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onClear}>
              <text fg={props.theme.secondary}>
                <b>{formatKeybind(props.clearKeybind)}</b>
              </text>
              <text fg={props.theme.primary}>{"Clear"}</text>
            </box>
          )}
          <text fg={props.theme.textMuted}>{"·"}</text>
          {formatKeybind(props.thinkToggleKeybind) && (
            <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onToggleThink}>
              <text fg={props.theme.secondary}>
                <b>{formatKeybind(props.thinkToggleKeybind)}</b>
              </text>
              <text fg={props.theme.primary}>{"Thinking"}</text>
              <text fg={props.theme.textMuted}>{props.thinkCollapsed ? "" : "(on)"}</text>
            </box>
          )}
          <text fg={props.theme.textMuted}>{"·"}</text>
          {formatKeybind(props.modelKeybind) && (
            <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onChangeModel}>
              <text fg={props.theme.secondary}>
                <b>{formatKeybind(props.modelKeybind)}</b>
              </text>
              <text fg={props.theme.primary}>{"Model"}</text>
            </box>
          )}
          <text fg={props.theme.textMuted}>{"·"}</text>
        </>
      )}
      {formatKeybind(props.historyKeybind) && (
        <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onToggleHistory}>
          <text fg={props.theme.secondary}>
            <b>{formatKeybind(props.historyKeybind)}</b>
          </text>
          <text fg={props.theme.primary}>{"History"}</text>
        </box>
      )}
    </box>
  );
}

function HistoryFooter(props: {
  historyKeybind: string | false;
  deleteKeybind: string | false;
  deleteConfirmPending: boolean;
  selectedHistoryId?: string;
  onToggleHistory: () => void;
  onDeleteHistoryEntry: (id: string) => void;
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent;
}) {
  return (
    <box
      flexDirection="row"
      gap={1}
      paddingTop={0}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      alignItems="center"
    >
      {formatKeybind(props.historyKeybind) && (
        <box flexDirection="row" gap={1} alignItems="center" onMouseDown={props.onToggleHistory}>
          <text fg={props.theme.secondary}>
            <b>{formatKeybind(props.historyKeybind)}</b>
          </text>
          <text fg={props.theme.primary}>{"Back"}</text>
        </box>
      )}
      <text fg={props.theme.textMuted}>{"·"}</text>
      {props.deleteConfirmPending ? (
        <text fg={props.theme.error}>
          <b>{"Press again to delete"}</b>
        </text>
      ) : (
        <>
          {formatKeybind(props.deleteKeybind) && props.selectedHistoryId && (
            <box
              flexDirection="row"
              gap={1}
              alignItems="center"
              onMouseDown={() => props.onDeleteHistoryEntry(props.selectedHistoryId!)}
            >
              <text fg={props.theme.secondary}>
                <b>{formatKeybind(props.deleteKeybind)}</b>
              </text>
              <text fg={props.theme.primary}>{"Delete"}</text>
            </box>
          )}
        </>
      )}
    </box>
  );
}

export function StatusBar(props: StatusBarProps) {
  if (props.historyMode) {
    return (
      <HistoryFooter
        historyKeybind={props.historyKeybind}
        deleteKeybind={props.deleteKeybind}
        deleteConfirmPending={props.deleteConfirmPending}
        selectedHistoryId={props.selectedHistoryId}
        onToggleHistory={props.onToggleHistory}
        onDeleteHistoryEntry={props.onDeleteHistoryEntry}
        theme={props.theme}
      />
    );
  }
  return (
    <ChatFooter
      loading={props.loading}
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
      theme={props.theme}
    />
  );
}
