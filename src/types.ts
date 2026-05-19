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

export type SideDialogState = {
  entries: SessionEntry[];
  streamingAnswer: string;
  loading: boolean;
  error?: string;
  tokenCount: number;
};

export type OverlayState = {
  api: TuiPluginApi;
  modelName: string;
  state: SideDialogState;
  thinkCollapsed: boolean;
  thinkConfig: ThinkConfig;
  onInput?: (input: { focus: () => void } | undefined) => void;
  onChangeModel: () => void;
  onSubmit: (value: string) => boolean;
};
