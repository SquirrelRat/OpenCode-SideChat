import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Message, Part } from "@opencode-ai/sdk/v2";

export type ThinkConfig = {
  defaultState: "collapsed" | "expanded";
  showSummary: boolean;
};

export type SideConfig = {
  model: string | null;
  systemPrompt: string;
  tokenLimit: number;
  keybind: string | false;
  clearKeybind: string | false;
  thinkToggleKeybind: string | false;
  allowedTools: string[] | null;
  width: number;
  transcriptHeight: number;
  position: string;
  think: ThinkConfig;
};

export type SessionEntry = {
  info: Message;
  parts: Part[];
};

export type ResolvedModel = {
  model?: {
    providerID: string;
    modelID: string;
  };
  variant?: string;
};

export type ModelPreference = ResolvedModel | undefined;

export type HistoryToolCall = {
  tool: string;
  title?: string;
  status: string;
  duration?: number;
};

export type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
  reasoning?: Array<{ id: string; text: string }>;
  tools?: HistoryToolCall[];
};

export type HistoryEntry = {
  id: string;
  created: number;
  updated: number;
  model: string;
  title: string;
  messages: HistoryMessage[];
};

export type SideDialogState = {
  entries: SessionEntry[];
  loading: boolean;
  error?: string;
  tokenCount: number;
};

export type OverlayState = {
  api: TuiPluginApi;
  modelName: string;
  state: SideDialogState;
  streamingAnswer: string;
  thinkCollapsed: boolean;
  thinkConfig: ThinkConfig;
  keybind: string | false;
  clearKeybind: string | false;
  thinkToggleKeybind: string | false;
  historyKeybind: string;
  deleteKeybind: string;
  position: string;
  onInput?: (input: { focus: () => void } | undefined) => void;
  onChangeModel: () => void;
  onSubmit: (value: string) => boolean;
  historyMode: boolean;
  historyEntries: HistoryEntry[];
  selectedHistoryId?: string;
  onToggleHistory: () => void;
  onSelectHistoryEntry: (id: string | undefined) => void;
  onDeleteHistoryEntry: (id: string) => void;
  onClear: () => void;
  onToggleThink: () => void;
};
