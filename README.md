# OpenCode-SideChat

[![npm](https://img.shields.io/npm/v/opencode-sidechat)](https://www.npmjs.com/package/opencode-sidechat)

Floating side-chat panel for quick queries while your main session runs. Opens at the bottom-right corner of the TUI via `Alt+N`. Uses a separate agent with read-only tools and no access to main-session context.

https://github.com/user-attachments/assets/d4581f3d-a172-438e-9566-0ae3b40899e4

## Install

```sh
npm install -g opencode-sidechat
```
or

Add directly to your `~/.config/opencode/tui.json`:

```json
["opencode-sidechat"]
```

On first launch, the plugin creates `~/.config/opencode/sidechat.jsonc` with defaults. Edit that file to change settings.

## Usage

| Key | Action |
|---|---|
| `Alt+N` | Toggle panel |
| `Alt+C` | Clear chat / new session |
| `Alt+T` | Toggle thinking blocks |
| `Tab` | Change model |

Commands: `/side`, `/side-clear`, `/side-model`.

## Configuration

All settings live in `~/.config/opencode/sidechat.jsonc`:

```jsonc
{
  "model": "opencode/deepseek-v4-flash-free",
  "systemPrompt": "You are a casual side assistant. Answer concisely and directly.",
  "keybind": "alt+n",
  "clearKeybind": "alt+c",
  "thinkToggleKeybind": "alt+t",
  "allowedTools": ["glob", "grep", "list", "read", "webfetch", "websearch"],
  "width": 70,
  "transcriptHeight": 20,
  "tokenLimit": 45000,
  "think": {
    "defaultState": "collapsed",
    "showSummary": false
  }
}
```

## Security

The side agent is deny-by-default for tool access. Only tools listed in `allowedTools` are granted. The side agent cannot see your main session, its files, or its conversation history. It operates as an isolated session with a minimal system prompt.

## Build

```sh
npm install
npx tsc --noEmit      # typecheck
```

## Files

```
src/
├── index.tsx           # plugin entry, slot/event wiring
├── config.ts           # sidechat.jsonc read + defaults
├── constants.ts        # command names, tool allowlist
├── session.ts          # session lifecycle, model picker
├── types.ts            # config + state types
└── components/
    └── SideChat.tsx    # UI: transcript, input, hint bar
```
