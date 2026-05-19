/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal, Show } from "solid-js";
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

const SIDE_AGENT = "general";

const tui: TuiPlugin = async (api, _options) => {
  const config = loadConfig();
  const keybind = config.keybind;
  const clearKeybind = config.clearKeybind;
  const thinkToggleKeybind = config.thinkToggleKeybind;

  const [state, setState] = createSignal<SideDialogState>({
    entries: [],
    streamingAnswer: "",
    loading: false,
    error: undefined,
    tokenCount: 0,
  }, { equals: false });

  const [tempSessionID, setTempSessionID] = createSignal<string | undefined>(undefined);
  const [selectedModel, setSelectedModel] = createSignal<ModelPreference>(undefined);
  const [visible, setVisible] = createSignal(false);
  const [thinkCollapsed, setThinkCollapsed] = createSignal(config.think.defaultState === "collapsed");

  let overlayInput: { focus: () => void } | undefined;
  let unsubscribers: Array<() => void> = [];
  let sessionInitPromise: Promise<string | undefined> | undefined;

  const getModelName = () =>
    formatPreference(
      selectedModel() ?? resolveModel(config.model, state().entries, api).model,
    );

  const clearListeners = () => {
    while (unsubscribers.length > 0) {
      try { unsubscribers.pop()?.(); } catch {}
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
        entries.push({ info, parts: [...api.state.part(info.id)] });
        if (info.role === "assistant") {
          tokenCount += (info.tokens?.input ?? 0) + (info.tokens?.output ?? 0);
        }
      }
      setState((s) => ({ ...s, entries, tokenCount }));
    } catch {}
  };

  const buildSystemPrompt = async () => {
    const toolIDs = await getAvailableToolIDs(api);
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
          agent: SIDE_AGENT,
          permission,
        },
        { throwOnError: true },
      );

      const sid = created.data.id;
      setTempSessionID(sid);

      unsubscribers.push(
        api.event.on("session.idle", (event) => {
          if (event.properties.sessionID !== sid) return;
          refreshSession();
          setState((s) => ({
            ...s,
            loading: false,
            streamingAnswer: "",
          }));
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
            event.properties.field !== "text"
          ) return;
          setState((s) => ({
            ...s,
            streamingAnswer: s.streamingAnswer + event.properties.delta,
          }));
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
          setState((s) => ({
            ...s,
            error: getErrorMessage(event.properties.error),
            loading: false,
          }));
        }),
      );

      setState((s) => ({ ...s, sessionReady: true, error: undefined }));
      return sid;
    } catch (cause) {
      const msg = getErrorMessage(cause);
      setState((s) => ({ ...s, error: msg, sessionReady: false }));
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
    } catch {}
    try {
      await api.client.session.delete(
        { sessionID: sid },
        { throwOnError: true },
      );
    } catch {}
  };

  const handleSubmit = (text: string): boolean => {
    if (state().loading) return false;

    void ensureSession().then((sid) => {
      if (!sid) {
        setState((s) => ({
          ...s,
          error: "Failed to create session.",
          loading: false,
        }));
        return;
      }

      setState((s) => ({
        ...s,
        error: undefined,
        loading: true,
        streamingAnswer: "",
      }));

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
              agent: SIDE_AGENT,
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
      streamingAnswer: "",
      loading: false,
      error: undefined,
      tokenCount: 0,
    });
    sessionInitPromise = undefined;
    setThinkCollapsed(config.think.defaultState === "collapsed");
    await ensureSession();
    setVisible(true);
    setTimeout(() => overlayInput?.focus(), 0);
  };

  const handleToggle = () => {
    const currentRoute = api.route.current;
    if (currentRoute.name !== "session") return;
    setVisible((prev) => {
      if (!prev) setTimeout(() => overlayInput?.focus(), 0);
      return !prev;
    });
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
          <SideChat
            api={api}
            modelName={getModelName()}
            state={state()}
            width={config.width}
            transcriptHeight={config.transcriptHeight}
            tokenLimit={config.tokenLimit}
            thinkCollapsed={thinkCollapsed()}
            thinkConfig={config.think}
            onInput={(node) => { overlayInput = node; }}
            onChangeModel={handleChangeModel}
            onSubmit={handleSubmit}
          />
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
        enabled: () => api.route.current.name === "session",
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
