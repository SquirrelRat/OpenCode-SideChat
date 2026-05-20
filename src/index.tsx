/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal, Show, ErrorBoundary } from "solid-js";
import { loadConfig } from "./config";
import { SideChat } from "./components/SideChat";
import {
  CMD_TOGGLE_FOCUS,
  CMD_CLEAR,
  CMD_CHANGE_MODEL,
  CMD_TOGGLE_THINK,
  PLUGIN_ID,
} from "./constants";
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
import type { SideDialogState, ModelPreference } from "./types";

const PROMPT_TIMEOUT_MS = 120_000;

const tui: TuiPlugin = async (api, _options) => {
  const config = loadConfig();
  const keybind = config.keybind;
  const clearKeybind = config.clearKeybind;
  const thinkToggleKeybind = config.thinkToggleKeybind;

  const [state, setState] = createSignal<SideDialogState>({
    entries: [],
    loading: false,
    error: undefined,
    tokenCount: 0,
  });
  const [streamingAnswer, setStreamingAnswer] = createSignal("", { equals: false });

  const [tempSessionID, setTempSessionID] = createSignal<string | undefined>(undefined);
  const [selectedModel, setSelectedModel] = createSignal<ModelPreference>(undefined);
  const [visible, setVisible] = createSignal(false);
  const [thinkCollapsed, setThinkCollapsed] = createSignal(config.think.defaultState === "collapsed");

  let overlayInput: { focus: () => void } | undefined;
  let previousFocus: import("@opentui/core").Renderable | null = null;
  let unsubscribers: Array<() => void> = [];
  let sessionInitPromise: Promise<string | undefined> | undefined;
  let promptTimeout: ReturnType<typeof setTimeout> | undefined;
  let cachedToolIDs: string[] | undefined;

  const getModelName = () =>
    formatPreference(
      selectedModel() ?? resolveModel(config.model, state().entries, api).model,
    );

  const clearListeners = () => {
    while (unsubscribers.length > 0) {
      try { unsubscribers.pop()?.(); } catch (err) { console.error("[SideChat] listener cleanup:", err); }
    }
  };

  const refreshSession = () => {
    const sid = tempSessionID();
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
      setState((s) => ({ ...s, entries: entries.slice(-MAX_STORED_ENTRIES), tokenCount }));
    } catch (err) {
      console.error("[SideChat] refreshSession failed:", err);
    }
  };

  const buildSystemPrompt = async () => {
    if (!cachedToolIDs) {
      cachedToolIDs = await getAvailableToolIDs(api);
    }
    const toolIDs = cachedToolIDs;
    const resolvedTools = resolveAllowedTools(config.allowedTools, toolIDs);
    return {
      system: buildSideSystemPrompt(config.systemPrompt, resolvedTools),
      toolIDs,
      resolvedTools,
      tools: buildToolSelection(toolIDs, resolvedTools),
      permission: buildPermissionRules(toolIDs, resolvedTools),
    };
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
      setTempSessionID(sid);

      unsubscribers.push(
        api.event.on("session.idle", (event) => {
          if (event.properties.sessionID !== sid) return;
          if (promptTimeout) { clearTimeout(promptTimeout); promptTimeout = undefined; }
          refreshSession();
          setState((s) => ({
            ...s,
            loading: false,
          }));
          setStreamingAnswer("");
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
            !state().loading
          ) return;
          setStreamingAnswer((prev) => prev + event.properties.delta);
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
          setState((s) => ({
            ...s,
            error: getErrorMessage(event.properties.error),
            loading: false,
          }));
        }),
      );

      setState((s) => ({ ...s, error: undefined }));
      return sid;
    } catch (cause) {
      const msg = getErrorMessage(cause);
      setState((s) => ({ ...s, error: msg }));
      sessionInitPromise = undefined;
      return undefined;
    }
  };

  const ensureSession = (): Promise<string | undefined> => {
    if (tempSessionID()) return Promise.resolve(tempSessionID());
    if (!sessionInitPromise) sessionInitPromise = initSession();
    return sessionInitPromise;
  };

  const destroySession = async () => {
    const sid = tempSessionID();
    if (!sid) return;
    setTempSessionID(undefined);
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
        { throwOnError: true },
      );
    } catch (err) { console.error("[SideChat] session delete:", err); }
  };

  const handleSubmit = (text: string): boolean => {
    if (state().loading) return false;

    setState((s) => ({
      ...s,
      error: undefined,
      loading: true,
    }));
    setStreamingAnswer("");

    if (promptTimeout) clearTimeout(promptTimeout);
    promptTimeout = setTimeout(() => {
      setState((s) => s.loading ? { ...s, loading: false, error: "Request timed out." } : s);
    }, PROMPT_TIMEOUT_MS);

    void ensureSession().then((sid) => {
      if (!sid) {
        setState((s) => ({
          ...s,
          error: "Failed to create session.",
          loading: false,
        }));
        return;
      }

      void (async () => {
        try {
          const { system, tools } = await buildSystemPrompt();
          const resolved =
            selectedModel() ??
            resolveModel(config.model, state().entries, api).model;

          await api.client.session.promptAsync(
            {
              sessionID: sid,
              system,
              tools,
              parts: [{ type: "text", text }],
              ...(resolved.model ? { model: resolved.model } : {}),
              ...(resolved.variant ? { variant: resolved.variant } : {}),
            },
            { throwOnError: true },
          );
        } catch (cause) {
          setState((s) => ({
            ...s,
            error: getErrorMessage(cause),
            loading: false,
          }));
        }
      })();
    });

    return true;
  };

  const handleClear = async () => {
    await destroySession();
    setState({
      entries: [],
      loading: false,
      error: undefined,
      tokenCount: 0,
    });
    setStreamingAnswer("");
    sessionInitPromise = undefined;
    setThinkCollapsed(config.think.defaultState === "collapsed");
    await ensureSession();
    if (visible()) {
      setTimeout(() => overlayInput?.focus(), 0);
    }
  };

  const handleToggle = () => {
    const currentRoute = api.route.current;
    if (currentRoute.name !== "session" && !visible()) return;
    const wasVisible = visible();
    if (!wasVisible) {
      previousFocus = api.renderer.currentFocusedRenderable;
    }
    setVisible(!wasVisible);
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
    setThinkCollapsed((prev) => !prev);
  };

  const handleChangeModel = () => {
    const currentRoute = api.route.current;
    if (currentRoute.name !== "session") return;
    openModelPicker(api, config, selectedModel(), (model) => {
      setSelectedModel(model);
    });
  };

  api.lifecycle.onDispose(() => {
    clearListeners();
    void destroySession();
  });

  api.slots.register({
    slots: {
      app: () => (
        <Show when={visible()}>
          <ErrorBoundary fallback={(err) => <text>{String(err)}</text>}>
            <SideChat
              api={api}
              modelName={getModelName()}
              state={state()}
              streamingAnswer={streamingAnswer()}
              width={config.width}
              transcriptHeight={config.transcriptHeight}
              tokenLimit={config.tokenLimit}
              thinkCollapsed={thinkCollapsed()}
              thinkConfig={config.think}
              onInput={(node) => { overlayInput = node; }}
              onChangeModel={handleChangeModel}
              onSubmit={handleSubmit}
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
        enabled: () => api.route.current.name === "session" || visible(),
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
    ],
    bindings: [
      ...(keybind !== false
        ? [{
            key: keybind,
            cmd: CMD_TOGGLE_FOCUS,
            desc: "Toggle side chat",
          }]
        : []),
    ],
  });

  api.keymap.registerLayer({
    priority: 1000,
    enabled: () => visible(),
    commands: [
      { name: CMD_CLEAR, run: () => void handleClear() },
      { name: CMD_CHANGE_MODEL, run: () => handleChangeModel() },
      { name: CMD_TOGGLE_THINK, run: () => handleToggleThink() },
    ],
    bindings: [
      ...(clearKeybind !== false
        ? [{ key: clearKeybind, cmd: CMD_CLEAR }]
        : []),
      ...(thinkToggleKeybind !== false
        ? [{ key: thinkToggleKeybind, cmd: CMD_TOGGLE_THINK }]
        : []),
      { key: "tab", cmd: CMD_CHANGE_MODEL },
    ],
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
};

export default plugin;
