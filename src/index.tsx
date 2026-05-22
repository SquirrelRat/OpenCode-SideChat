/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal, Show, ErrorBoundary } from "solid-js";
import { createStore } from "solid-js/store";
import { loadConfig } from "./config";
import { SideChat } from "./components/SideChat";
import {
  CMD_TOGGLE_FOCUS,
  CMD_CLEAR,
  CMD_CHANGE_MODEL,
  CMD_TOGGLE_THINK,
  CMD_TOGGLE_HISTORY,
  CMD_DELETE,
  CMD_STOP,
  CMD_HISTORY_UP,
  CMD_HISTORY_DOWN,
  CMD_HISTORY_SELECT,
  CMD_RELOAD_CONFIG,
  PLUGIN_ID,
} from "./constants";
import { loadHistory, saveEntry, deleteEntry, buildHistoryEntry } from "./history";
import {
  getAvailableToolIDs,
  resolveAllowedTools,
  buildToolSelection,
  buildPermissionRules,
  buildSideSystemPrompt,
  resolveModel,
  formatPreference,
  openModelPicker,
  getErrorMessage,
} from "./session";
import type { SideDialogState, ModelPreference, HistoryEntry } from "./types";

const PROMPT_TIMEOUT_MS = 120_000;

const tui: TuiPlugin = async (api, _options) => {
  const [config, setConfig] = createSignal(loadConfig());
  const keybind = config().keybind;
  const clearKeybind = config().clearKeybind;
  const thinkToggleKeybind = config().thinkToggleKeybind;
  const historyKeybind = config().historyKeybind;
  const deleteKeybind = config().deleteKeybind;
  const modelKeybind = config().modelKeybind;

  const [store, setStore] = createStore({
    entries: [] as SideDialogState["entries"],
    loading: false,
    error: undefined as string | undefined,
    tokenCount: 0,
    streamingAnswer: "",
    tempSessionID: undefined as string | undefined,
    selectedModel: undefined as ModelPreference,
    visible: false,
    thinkCollapsed: config().think.defaultState === "collapsed",
    historyMode: false,
    historyEntries: [] as HistoryEntry[],
    selectedHistoryId: undefined as string | undefined,
    deleteConfirmPending: false,
    focusedHistoryIndex: -1,
  });

  let overlayInput: { focus: () => void } | undefined;
  let previousFocus: import("@opentui/core").Renderable | null = null;
  let unsubscribers: Array<() => void> = [];
  let sessionInitPromise: Promise<string | undefined> | undefined;
  let clearing = false;
  let promptTimeout: ReturnType<typeof setTimeout> | undefined;
  let cachedToolIDs: string[] | undefined;
  let cachedPromptResult:
    | { system: string; tools: Record<string, boolean>; permission: any[] }
    | undefined;
  let generation = 0;

  const getModelName = () =>
    formatPreference(
      store.selectedModel ?? resolveModel(config().model, store.entries, api).model,
    );

  const clearListeners = () => {
    while (unsubscribers.length > 0) {
      try { unsubscribers.pop()?.(); } catch (err) { console.error("[SideChat] listener cleanup:", err); }
    }
  };

  const refreshSession = () => {
    const sid = store.tempSessionID;
    if (!sid) return;
    try {
      const messages = api.state.session.messages(sid);
      const entries: SideDialogState["entries"] = [];
      let tokenCount = 0;
      for (const info of messages) {
        entries.push({ info, parts: [...(api.state.part(info.id) ?? [])] });
        if ("tokens" in info && info.tokens) {
          tokenCount += (info.tokens.input ?? 0) + (info.tokens.output ?? 0);
        }
      }
      const MAX_STORED_ENTRIES = 100;
      setStore({ entries: entries.slice(-MAX_STORED_ENTRIES), tokenCount });
    } catch (err) {
      console.error("[SideChat] refreshSession failed:", err);
    }
  };

  const buildSystemPrompt = async () => {
    if (!cachedToolIDs) {
      cachedToolIDs = await getAvailableToolIDs(api);
    }
    const toolIDs = cachedToolIDs;
    const resolvedTools = resolveAllowedTools(config().allowedTools, toolIDs);
    const result = {
      system: buildSideSystemPrompt(config().systemPrompt, resolvedTools),
      toolIDs,
      resolvedTools,
      tools: buildToolSelection(toolIDs, resolvedTools),
      permission: buildPermissionRules(toolIDs, resolvedTools),
    };
    cachedPromptResult = { system: result.system, tools: result.tools, permission: result.permission };
    return result;
  };

  const initSession = async (): Promise<string | undefined> => {
    clearListeners();

    try {
      const { permission } = await buildSystemPrompt();

      const created = await api.client.session.create(
        {
          title: "side chat",
          directory: api.state.path.directory,
          permission,
        },
        { throwOnError: true },
      );

      const sid = created.data.id;
      const myGen = generation;
      // Guard: don't set session ID if a clear happened during init
      if (myGen !== generation) return undefined;
      setStore("tempSessionID", sid);

      unsubscribers.push(
        api.event.on("session.idle", (event) => {
          if (event.properties.sessionID !== sid) return;
          if (promptTimeout) { clearTimeout(promptTimeout); promptTimeout = undefined; }
          refreshSession();
          setStore("loading", false);
          setStore("streamingAnswer", "");
        }),
      );

      unsubscribers.push(
        api.event.on("message.updated", (event) => {
          if (event.properties.sessionID !== sid) return;
          refreshSession();
        }),
      );

      unsubscribers.push(
        api.event.on("message.part.delta", (event) => {
          if (
            event.properties.sessionID !== sid ||
            event.properties.field !== "text" ||
            !store.loading
          ) return;
          setStore("streamingAnswer", (prev) => prev + event.properties.delta);
        }),
      );

      unsubscribers.push(
        api.event.on("message.part.updated", (event) => {
          if (event.properties.sessionID !== sid) return;
          refreshSession();
        }),
      );

      unsubscribers.push(
        api.event.on("session.error", (event) => {
          if (event.properties.sessionID !== sid) return;
          if (promptTimeout) { clearTimeout(promptTimeout); promptTimeout = undefined; }
          setStore({error: getErrorMessage(event.properties.error), loading: false});
        }),
      );

      setStore("error", undefined);
      return sid;
    } catch (cause) {
      const msg = getErrorMessage(cause);
      setStore("error", msg);
      sessionInitPromise = undefined;
      return undefined;
    }
  };

  const ensureSession = (): Promise<string | undefined> => {
    if (store.tempSessionID) return Promise.resolve(store.tempSessionID);
    if (!sessionInitPromise) sessionInitPromise = initSession();
    return sessionInitPromise;
  };

  const destroySession = async () => {
    const sid = store.tempSessionID;
    if (!sid) return;
    setStore("tempSessionID", undefined);
    sessionInitPromise = undefined;
    clearListeners();
    try {
      await api.client.session.abort(
        { sessionID: sid },
        { throwOnError: true },
      );
    } catch (err) { console.error("[SideChat] session abort:", err); }
    try {
      await api.client.session.delete(
        { sessionID: sid },
      );
    } catch {
      // Session may already be gone after abort — expected
    }
  };

  const handleSubmit = (text: string): boolean => {
    if (store.loading) return false;

    const myGen = generation;

    setStore({error: undefined, loading: true});
    setStore("streamingAnswer", "");

    if (promptTimeout) clearTimeout(promptTimeout);
    promptTimeout = setTimeout(() => {
      if (generation !== myGen) return;
      if (store.loading) setStore({loading: false, error: "Request timed out."});
    }, PROMPT_TIMEOUT_MS);

    void ensureSession().then((sid) => {
      if (generation !== myGen) return;
      if (!sid) {
        setStore({error: "Failed to create session.", loading: false});
        if (promptTimeout) { clearTimeout(promptTimeout); promptTimeout = undefined; }
        return;
      }

      void (async () => {
        try {
          const { system, tools } = cachedPromptResult ?? await buildSystemPrompt();
          if (generation !== myGen) return;
          const resolved =
            store.selectedModel ??
            resolveModel(config().model, store.entries, api).model;

          await api.client.session.promptAsync(
            {
              sessionID: sid,
              system,
              tools,
              parts: [{ type: "text", text }],
              ...(resolved?.model ? { model: resolved.model } : {}),
              ...(resolved?.variant ? { variant: resolved.variant } : {}),
            },
            { throwOnError: true },
          );
        } catch (cause) {
          if (generation !== myGen) return;
          if (promptTimeout) { clearTimeout(promptTimeout); promptTimeout = undefined; }
          setStore({error: getErrorMessage(cause), loading: false});
        }
      })();
    });

    return true;
  };

  const handleClear = async () => {
    if (clearing) return;
    clearing = true;
    generation++;
    clearListeners();
    if (promptTimeout) { clearTimeout(promptTimeout); promptTimeout = undefined; }
    try {
      const entry = buildHistoryEntry(store, getModelName());
      if (entry) await saveEntry(entry);
      await destroySession();
      setStore({
        entries: [],
        loading: false,
        error: undefined,
        tokenCount: 0,
      });
      setStore("streamingAnswer", "");
      sessionInitPromise = undefined;
      cachedToolIDs = undefined;
      cachedPromptResult = undefined;
      setStore("thinkCollapsed", config().think.defaultState === "collapsed");
      if (store.visible) {
        setTimeout(() => overlayInput?.focus(), 0);
      }
    } finally {
      clearing = false;
    }
  };

  const handleToggle = async () => {
    const currentRoute = api.route.current;
    if (currentRoute.name !== "session" && !store.visible) return;
    const wasVisible = store.visible;
    if (!wasVisible) {
      previousFocus = api.renderer.currentFocusedRenderable;
    }
    setStore("visible", !wasVisible);
    if (wasVisible && store.entries.length > 0) {
      const entry = buildHistoryEntry(store, getModelName());
      if (entry) await saveEntry(entry);
    }
    if (wasVisible && previousFocus) {
      const restore = previousFocus;
      previousFocus = null;
      setTimeout(() => {
        try { restore.focus(); } catch {}
      }, 50);
    } else if (!wasVisible) {
      setTimeout(() => overlayInput?.focus(), 50);
    }
  };

  const handleToggleThink = () => {
    setStore("thinkCollapsed", (prev) => !prev);
  };

  const handleToggleHistory = async () => {
    const next = !store.historyMode;
    if (next) {
      setStore("historyEntries", await loadHistory());
      setStore("selectedHistoryId", undefined);
      // Auto-show overlay if entering history mode from palette while hidden
      if (!store.visible) setStore("visible", true);
    } else {
      // Restore focus to input when exiting history mode
      setTimeout(() => overlayInput?.focus(), 50);
    }
    setStore("historyMode", next);
  };

  const handleSelectHistoryEntry = (id: string | undefined) => {
    setStore("selectedHistoryId", id);
  };

  const handleDeleteHistoryEntry = async (id: string) => {
    if (!store.deleteConfirmPending) {
      setStore("deleteConfirmPending", true);
      setTimeout(() => setStore("deleteConfirmPending", false), 3000);
      return;
    }
    setStore("deleteConfirmPending", false);
    await deleteEntry(id);
    setStore("historyEntries", await loadHistory());
    setStore("focusedHistoryIndex", -1);
    if (store.selectedHistoryId === id) {
      setStore("selectedHistoryId", undefined);
    }
  };

  const handleStopGeneration = async () => {
    if (!store.loading) return;
    const sid = store.tempSessionID;
    if (!sid) return;
    try {
      await api.client.session.abort({ sessionID: sid }, { throwOnError: true });
    } catch (err) { console.error("[SideChat] stop generation:", err); }
    setStore("loading", false);
    setStore("streamingAnswer", "");
  };

  const handleHistoryUp = () => {
    const entries = store.historyEntries;
    if (entries.length === 0) return;
    setStore("focusedHistoryIndex", (prev) => {
      if (prev <= 0) return entries.length - 1; // wrap to bottom
      return prev - 1;
    });
  };

  const handleHistoryDown = () => {
    const entries = store.historyEntries;
    if (entries.length === 0) return;
    setStore("focusedHistoryIndex", (prev) => {
      if (prev < 0 || prev >= entries.length - 1) return 0; // wrap to top
      return prev + 1;
    });
  };

  const handleReloadConfig = () => {
    try {
      setConfig(loadConfig());
      // Clear caches so next prompt rebuilds system prompt/tools
      cachedToolIDs = undefined;
      cachedPromptResult = undefined;
      api.ui.toast({ variant: "success", message: "SideChat config reloaded." });
    } catch (err) {
      api.ui.toast({ variant: "error", message: "SideChat config reload failed." });
    }
  };

  const handleChangeModel = () => {
    const currentRoute = api.route.current;
    if (currentRoute.name !== "session") return;
    openModelPicker(api, config(), store.selectedModel, (model) => {
      setStore("selectedModel", model);
    });
  };

  api.lifecycle.onDispose(async () => {
    clearListeners();
    const entry = buildHistoryEntry(store, getModelName());
    if (entry) await saveEntry(entry);
    void destroySession();
  });

  api.slots.register({
    slots: {
      app: () => (
        <Show when={store.visible}>
          <ErrorBoundary fallback={(err) => <text>{String(err)}</text>}>
            <SideChat
              api={api}
              modelName={getModelName()}
              state={store}
              streamingAnswer={store.streamingAnswer}
              width={config().width}
              tokenLimit={config().tokenLimit}
              thinkCollapsed={store.thinkCollapsed}
              thinkConfig={config().think}
              keybind={config().keybind}
              clearKeybind={config().clearKeybind}
              thinkToggleKeybind={config().thinkToggleKeybind}
              historyKeybind={config().historyKeybind}
              deleteKeybind={config().deleteKeybind}
              modelKeybind={config().modelKeybind}
              deleteConfirmPending={store.deleteConfirmPending}
              onStopGeneration={handleStopGeneration}
              focusedHistoryIndex={store.focusedHistoryIndex}
              position={config().position}
              onInput={(node) => { overlayInput = node; }}
              onChangeModel={handleChangeModel}
              onSubmit={handleSubmit}
              onClear={() => void handleClear()}
              onToggleThink={handleToggleThink}
              historyMode={store.historyMode}
              historyEntries={store.historyEntries}
              selectedHistoryId={store.selectedHistoryId}
              onToggleHistory={handleToggleHistory}
              onSelectHistoryEntry={handleSelectHistoryEntry}
              onDeleteHistoryEntry={handleDeleteHistoryEntry}
            />
          </ErrorBoundary>
        </Show>
      ),
    },
  });

  api.keymap.registerLayer({
    commands: [
      {
        namespace: "palette",
        name: CMD_TOGGLE_FOCUS,
        title: "side",
        desc: "Open/side chat overlay",
        category: "Plugin",
        slashName: "side",
        enabled: () => api.route.current.name === "session" || store.visible,
        run: () => handleToggle(),
      },
      {
        namespace: "palette",
        name: CMD_CLEAR,
        title: "side clear",
        desc: "Clear the side chat conversation",
        category: "Plugin",
        slashName: "side-clear",
        enabled: () => api.route.current.name === "session",
        run: () => void handleClear(),
      },
      {
        namespace: "palette",
        name: CMD_CHANGE_MODEL,
        title: "side model",
        desc: "Change the side chat model",
        category: "Plugin",
        slashName: "side-model",
        enabled: () => api.route.current.name === "session",
        run: () => handleChangeModel(),
      },
      {
        namespace: "palette",
        name: CMD_TOGGLE_HISTORY,
        title: "side history",
        desc: "View side chat history",
        category: "Plugin",
        slashName: "side-history",
        enabled: () => api.route.current.name === "session" || store.visible,
        run: () => handleToggleHistory(),
      },
      {
        namespace: "palette",
        name: CMD_RELOAD_CONFIG,
        title: "side reload",
        desc: "Reload side chat configuration",
        category: "Plugin",
        slashName: "side-reload",
        enabled: () => api.route.current.name === "session",
        run: () => handleReloadConfig(),
      },
    ],
    bindings: [
      ...(keybind !== false
        ? [{
            key: keybind,
            cmd: CMD_TOGGLE_FOCUS,
            desc: "Toggle side chat",
          }]
        : []),
      ...(historyKeybind !== false
        ? [{
            key: historyKeybind,
            cmd: CMD_TOGGLE_HISTORY,
            desc: "Toggle side chat history",
          }]
        : []),
    ],
  });

  api.keymap.registerLayer({
    priority: 1000,
    enabled: () => store.visible,
    commands: [
      { name: CMD_CLEAR, run: () => void handleClear() },
      { name: CMD_CHANGE_MODEL, run: () => handleChangeModel() },
      { name: CMD_TOGGLE_THINK, run: () => handleToggleThink() },
      { name: CMD_TOGGLE_HISTORY, run: () => handleToggleHistory() },
      { name: CMD_DELETE, run: () => { if (store.selectedHistoryId) handleDeleteHistoryEntry(store.selectedHistoryId); } },
      { name: CMD_HISTORY_UP, run: () => { if (store.historyMode) handleHistoryUp(); } },
      { name: CMD_HISTORY_DOWN, run: () => { if (store.historyMode) handleHistoryDown(); } },

    ],
    bindings: [
      ...(clearKeybind !== false
        ? [{ key: clearKeybind, cmd: CMD_CLEAR }]
        : []),
      ...(thinkToggleKeybind !== false
        ? [{ key: thinkToggleKeybind, cmd: CMD_TOGGLE_THINK }]
        : []),
      ...(modelKeybind !== false
        ? [{ key: modelKeybind, cmd: CMD_CHANGE_MODEL }]
        : []),
      ...(deleteKeybind !== false
        ? [{
            key: deleteKeybind,
            cmd: CMD_DELETE,
            desc: "Delete history entry",
          }]
        : []),
      { key: "up", cmd: CMD_HISTORY_UP },
      { key: "down", cmd: CMD_HISTORY_DOWN },
    ],
  });

  api.keymap.registerLayer({
    priority: 1000,
    enabled: () => store.visible && store.loading,
    commands: [
      { name: CMD_STOP, run: () => handleStopGeneration() },
    ],
    bindings: [
      { key: "escape", cmd: CMD_STOP },
    ],
  });

  api.keymap.registerLayer({
    priority: 1000,
    enabled: () => store.visible && store.historyMode,
    commands: [
      { name: CMD_HISTORY_SELECT, run: () => {
          const idx = store.focusedHistoryIndex;
          if (idx < 0) return;
          const entries = store.historyEntries;
          if (idx >= entries.length) return;
          setStore("selectedHistoryId", entries[idx].id);
        }
      },
    ],
    bindings: [
      { key: "space", cmd: CMD_HISTORY_SELECT },
      { key: "enter", cmd: CMD_HISTORY_SELECT },
    ],
  });


};

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
};

export default plugin;
