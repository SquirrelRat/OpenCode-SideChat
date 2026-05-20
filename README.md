# OpenCode-SideChat

Floating side-chat panel for quick queries while your main session runs.
Opens at the configured position (default bottom-right) via `Alt+N`. Uses a separate
agent with read-only tools and no access to main-session context.

https://github.com/user-attachments/assets/9c27927e-6d53-487c-a87e-8912d89b3461

## Install

```bash
npm install -g opencode-sidechat
```

Or add to `~/.config/opencode/tui.json`: `["opencode-sidechat"]`

## Usage

| Keybind | Action |
|---------|--------|
| `Alt+N` | Toggle panel |
| `Alt+C` | Clear chat / new session |
| `Alt+T` | Toggle thinking blocks |
| `Alt+H` | Toggle history viewer |
| `Alt+D` | Delete selected history entry (in history view) |
| `Tab` | Change model |

Clickable items in the footer: **Clear**, **Thinking**, **Model**, **History** — also work via their respective keybinds.

## History

SideChat saves your session to disk when you close the panel or clear the chat.
Press `Alt+H` to browse past sessions grouped by date. Click a session to view
the full read-only transcript. Press `Alt+D` or click **Delete** to remove a session.
History is capped at 50 entries (FIFO).

## Configuration

Settings in `~/.config/opencode/sidechat.jsonc`:

```jsonc
{
  "model": null,                     // Model override (null = use default)
  "systemPrompt": "...",             // System prompt for side agent
  "keybind": "alt+n",                // Toggle panel keybind
  "clearKeybind": "alt+c",           // Clear chat keybind
  "thinkToggleKeybind": "alt+t",     // Toggle thinking keybind
  "allowedTools": ["...", "..."],    // Allowed tool IDs
  "width": 70,                       // Panel width (columns)
  "transcriptHeight": 20,            // Transcript height (rows)
  "tokenLimit": 45000,               // Max tokens per session
  "position": "bottom-right",        // Panel position: bottom-right, bottom-left, top-left, top-right
  "think": {
    "defaultState": "collapsed",     // "collapsed" or "expanded"
    "showSummary": false
  }
}
```

### Position options

- `"bottom-right"` — anchored to bottom-right corner (default)
- `"bottom-left"` — anchored to bottom-left corner
- `"top-left"` — anchored to top-left corner
- `"top-right"` — anchored to top-right corner

## Security

Side agent is deny-by-default for tool access. Only tools in
`allowedTools` are granted. Isolated session with minimal system prompt.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
