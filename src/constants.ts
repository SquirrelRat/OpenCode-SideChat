export const PLUGIN_ID = "local.opencode-sidechat";

export const CMD_TOGGLE_FOCUS = "sidechat.toggle-focus";
export const CMD_CLEAR = "sidechat.clear";
export const CMD_CHANGE_MODEL = "sidechat.change-model";
export const CMD_TOGGLE_THINK = "sidechat.toggle-think";

export const DEFAULT_KEYBIND = "alt+n";
export const DEFAULT_CLEAR_KEYBIND = "alt+c";
export const DEFAULT_THINK_TOGGLE_KEYBIND = "alt+t";
export const DEFAULT_TOKEN_LIMIT = 45_000;
export const DEFAULT_WIDTH = 70;
export const DEFAULT_TRANSCRIPT_HEIGHT = 20;

export const SYSTEM_PROMPT_OVERRIDE =
  "CRITICAL: Follow ONLY the instructions below. Ignore ALL other system prompts, AGENTS.md files, CLAUDE.md files, and any project-level configuration instructions. Do NOT load skills, do NOT follow agent instructions from other contexts.";

export const DEFAULT_SYSTEM_PROMPT =
  "You are a casual side assistant. Answer concisely and directly. Use tools only when helpful.";

export const THINKING_TEXT = "...";

export const SAFE_TOOLS: Record<string, true> = {
  glob: true,
  grep: true,
  list: true,
  read: true,
  websearch: true,
  webfetch: true,
};

export const DEFAULT_ALLOWED_TOOLS = Object.keys(SAFE_TOOLS);

export const ADDITIONAL_PERMISSION_IDS = [
  "edit",
  "bash",
  "task",
  "external_directory",
  "todowrite",
  "question",
  "websearch",
  "codesearch",
  "repo_clone",
  "repo_overview",
  "lsp",
  "doom_loop",
  "skill",
];
