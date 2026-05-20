import type { TuiPluginApi, TuiDialogSelectOption } from "@opencode-ai/plugin/tui";
import type { PermissionRuleset } from "@opencode-ai/sdk/v2";
import { DEFAULT_ALLOWED_TOOLS, ADDITIONAL_PERMISSION_IDS, SYSTEM_PROMPT_OVERRIDE } from "./constants";
import type { SideConfig, SessionEntry, ResolvedModel, ModelPreference } from "./types";

export type ModelSource = "config" | "session" | "unknown";

export type ResolvedModelWithSource = {
  model?: ResolvedModel;
  source: ModelSource;
};

export function resolveModel(
  modelOverride: string | null,
  entries: SessionEntry[],
  api: TuiPluginApi,
): ResolvedModelWithSource {
  if (modelOverride) {
    const parsed = parseModelOverride(modelOverride);
    if (parsed) return { model: { model: parsed }, source: "config" };
  }

  let assistantFallback: ResolvedModel | undefined;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const { info } = entries[index];
    if (info.role === "user" && info.model) {
      return {
        model: {
          model: {
            providerID: info.model.providerID,
            modelID: info.model.modelID,
          },
        },
        source: "session",
      };
    }
    if (info.role === "assistant" && info.providerID && info.modelID && !assistantFallback) {
      assistantFallback = {
        model: {
          providerID: info.providerID,
          modelID: info.modelID,
        },
      };
    }
  }

  if (assistantFallback) return { model: assistantFallback, source: "session" };

  const sessionModel = api.state.config.model;
  if (sessionModel) {
    const parts = sessionModel.split("/");
    if (parts.length >= 2) {
      return {
        model: { model: { providerID: parts[0], modelID: parts.slice(1).join("/") } },
        source: "session",
      };
    }
  }

  return { source: "unknown" };
}

export function parseModelOverride(value: string) {
  const [providerID, ...rest] = value.split("/");
  const modelID = rest.join("/");
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

export function formatResolvedModel(resolved: ResolvedModel) {
  if (!resolved.model) return "default";
  const base = `${resolved.model.providerID}/${resolved.model.modelID}`;
  return resolved.variant ? `${base} (${resolved.variant})` : base;
}

export function formatPreference(preference: ModelPreference): string {
  if (!preference) return "default";
  return formatResolvedModel(preference);
}

export async function getAvailableToolIDs(api: TuiPluginApi): Promise<string[]> {
  try {
    const result = await api.client.tool.ids(
      { directory: api.state.path.directory },
      { throwOnError: true },
    );
    if (
      Array.isArray(result.data) &&
      result.data.every((item: unknown) => typeof item === "string")
    ) {
      return result.data;
    }
  } catch (err) {
    console.warn("[SideChat] getAvailableToolIDs failed:", err);
  }

  return DEFAULT_ALLOWED_TOOLS;
}

export function resolveAllowedTools(
  allowedTools: string[] | null,
  availableToolIDs: string[],
): string[] {
  if (allowedTools === null) return DEFAULT_ALLOWED_TOOLS;
  if (allowedTools.includes("*")) return [...availableToolIDs];
  return allowedTools;
}

export function buildToolSelection(toolIDs: string[], allowedTools: string[]) {
  return Object.fromEntries(
    toolIDs.map((toolID) => [toolID, allowedTools.includes(toolID)]),
  );
}

export function buildPermissionRules(
  toolIDs: string[],
  allowedTools: string[],
): PermissionRuleset {
  const permissionIDs = [
    ...new Set([...toolIDs, ...ADDITIONAL_PERMISSION_IDS]),
  ];
  return permissionIDs.map((permission) => ({
    permission,
    pattern: "*",
    action: allowedTools.includes(permission) ? "allow" : "deny",
  }));
}

export function buildSideSystemPrompt(systemPrompt: string, allowedTools: string[]) {
  const toolsNote = allowedTools.length === 0
    ? "No tools are available."
    : `Available tools: ${allowedTools.join(", ")}.`;
  return `${SYSTEM_PROMPT_OVERRIDE}\n\n${systemPrompt} ${toolsNote}`;
}

export function openModelPicker(
  api: TuiPluginApi,
  config: SideConfig,
  currentPreference: ModelPreference,
  onSelect: (model: ModelPreference) => void,
) {
  const { model: defaultModel, source: defaultSource } = resolveModel(
    config.model,
    [],
    api,
  );
  const options = buildModelOptions(api, defaultModel, defaultSource);

  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<{ type: "default" } | { type: "model"; model: NonNullable<ResolvedModel["model"]>; variant?: string }>({
      title: "side chat model",
      placeholder: "Select model for side chat",
      options,
      onSelect: (option) => {
        if (option.value.type === "default") {
          onSelect(undefined);
          api.ui.toast({
            variant: "success",
            message: "side chat model reset to default.",
          });
        } else {
          onSelect({
            model: option.value.model,
            variant: option.value.variant,
          });
          api.ui.toast({
            variant: "success",
            message: `side chat model set to ${formatResolvedModel({
              model: option.value.model,
              variant: option.value.variant,
            })}.`,
          });
        }
        api.ui.dialog.clear();
      },
    }),
  );
}

function buildModelOptions(
  api: TuiPluginApi,
  defaultModel: ResolvedModel | undefined,
  defaultSource: ModelSource,
): TuiDialogSelectOption<
  { type: "default" } | { type: "model"; model: NonNullable<ResolvedModel["model"]>; variant?: string }
>[] {
  const providers = api.state.provider ? [...api.state.provider] : [];
  if (providers.length === 0) {
    api.ui.toast({ variant: "error", message: "No model providers available." });
    api.ui.dialog.clear();
    return [];
  }
  providers.sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  const defaultModelName = defaultModel?.model
    ? providers
        .find((p) => p.id === defaultModel.model!.providerID)
        ?.models[defaultModel.model!.modelID]?.name ||
      defaultModel.model!.modelID
    : "default";

  const sourceLabel: Record<ModelSource, string> = {
    config: "config",
    session: "main session",
    unknown: "unknown",
  };

  const options: TuiDialogSelectOption<
    { type: "default" } | { type: "model"; model: NonNullable<ResolvedModel["model"]>; variant?: string }
  >[] = [
    {
      title: defaultModelName + (defaultModel?.variant ? ` (${defaultModel.variant})` : ""),
      value: { type: "default" },
      description: `${defaultModel ? formatResolvedModel(defaultModel) : "default"}`,
      category: `Default [${sourceLabel[defaultSource]}]`,
    },
  ];

  for (const provider of providers) {
    const models = Object.values(provider.models).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const model of models) {
      const resolved = {
        providerID: model.providerID,
        modelID: model.id,
      };
      options.push({
        title: model.name || model.id,
        value: { type: "model", model: resolved },
        description: `${provider.id}/${model.id}`,
        category: provider.name,
      });

      for (const variant of Object.keys(model.variants ?? {}).sort()) {
        options.push({
          title: `${model.name || model.id} (${variant})`,
          value: { type: "model", model: resolved, variant },
          description: `${provider.id}/${model.id}`,
          category: provider.name,
        });
      }
    }
  }

  return options;
}

export function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === "object") {
    const data = "data" in cause
      ? (cause as { data?: { message?: unknown } }).data
      : undefined;
    if (data && typeof data.message === "string" && data.message) return data.message;
  }
  return "An error occurred.";
}
