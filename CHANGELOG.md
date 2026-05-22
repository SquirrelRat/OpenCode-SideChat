# Changelog

## [1.3.0] — 2026-05-22

### Added
- Configurable keybinds for history toggle, delete, and model switch — `historyKeybind`, `deleteKeybind`, `modelKeybind` in `sidechat.jsonc`
- Stop generation — Escape keybind aborts streaming; stop button shown in footer when loading
- Arrow key (up/down) navigation for history list — wraps around; Space/Enter selects focused entry
- Delete confirmation — double-press within 3s; footer shows "Confirm delete"
- Config hot-reload — `side reload` palette command (`/side-reload`) reloads all config values
- History entry validation on load — corrupted entries silently skipped with console warning
- Shared `extractParts()` utility — deduplicated Part parsing across modules
- New internal commands: `CMD_STOP`, `CMD_HISTORY_UP`, `CMD_HISTORY_DOWN`, `CMD_HISTORY_SELECT`, `CMD_RELOAD_CONFIG`

### Fixed
- Race condition — clear vs in-flight submit (generation counter guards stale responses)
- Race condition — `saveEntry` TOCTOU (write queue serializes history writes)
- Race condition — stale event listeners in `handleClear` (`clearListeners()` before `destroySession`)
- Race condition — stale `initSession` (guarded by generation check)
- `promptTimeout` leaked on error — now cleared
- Reactive widths in SideChat — `contentWidth`/`panelWidth` use `createMemo` instead of `const`
- HistoryDetail theme reactivity — `props.theme` used directly instead of captured const
- `getErrorMessage` handles string throws (not just Error objects)
- Async `mkdir` in history.ts — was using sync `fs.mkdirSync` in async functions
- Panel click focuses real input — was overwriting overlayInput with mock object
- Enter key blocked on main prompt — Enter binding removed from panel-visible layer
- HistoryList `<Show>` wrapping for reactive click-to-select — top-level `if` ran only once

### Changed
- SideChat.tsx reduced from 513 to 246 lines — extracted 5 sub-components: ChatTranscript, HistoryList, ChatInput, StatusBar, Helpers
- State management consolidated — 11 ad-hoc signals into single `createStore` in index.tsx
- All 6 keybinds now documented in default config comment; omitted from generated output (defaults from constants)
- Config position validated against whitelist — invalid values fall back to `"bottom-right"`
- `transcriptHeight` dead config option removed
- `getToolEmoji`, `getStatusIcon`, `formatDuration` moved to module level as pure functions

### Config
- New keybinds: `historyKeybind` (default `Alt+H`), `deleteKeybind` (default `Alt+D`), `modelKeybind` (default `Alt+M`)
- New palette command: `/side-reload` for config hot-reload

## [1.2.1] — 2026-05-20

### Fixed
- Session cleanup reverted — keep session alive across toggle close so conversation persists; session only destroyed on explicit `Alt+C` or plugin dispose. OpenCode SDK has no hidden session API, so side sessions appear in the global sessions list while the panel is open (cleaned up on clear/dispose).

## [1.2.0] — 2026-05-20

### Added
- History persistence system — side sessions saved to `~/.local/share/opencode-sidechat/history.json` (50-entry FIFO)
- History viewer — `Alt+H` toggles history list with date-grouped entries; click to view read-only transcript
- Inline tool-call rendering — collapsible one-liners (emoji + tool name + title + status + duration) expandable to show params and truncated output
- Panel position config — `position` option in `sidechat.jsonc`: `"bottom-right"` (default), `"bottom-left"`, `"top-left"`, `"top-right"`
- All footer items clickable — Clear, Thinking, Model, History, Back, and Delete now respond to mouse clicks
- Delete keybind — `Alt+D` deletes the currently viewed history entry (replaces non-functional `Del`)
- Empty `<text>` placeholders replaced with non-breaking spaces to preserve layout

### Fixed
- Session destroyed on panel toggle close — now preserved across open/close cycles; only explicit `Alt+C` or plugin dispose destroys it
- Session leak on rapid `Alt+C` spam — added `clearing` guard flag preventing concurrent clear execution
- Duplicate history entries on repeated toggle — `saveEntry` now updates in-place by session ID and preserves original `created` timestamp
- `[object Object]` instead of typed message — `ContentChangeEvent` was an empty object; switched to reading `.value` from the input ref directly
- Input not growing with new lines — fixed by the same `ContentChangeEvent` fix; textarea now correctly counts `\n` for height
- Panel height frozen on terminal resize — `terminalHeight` and `panelMaxHeight` converted from `const` to `createMemo()` for reactivity
- Theme frozen on swap — `theme` converted to `createMemo()` so it reacts to theme changes
- History selector unresponsive — `onMouseDown` moved from `<text>` (not handled by OpenTUI) to parent `<box>`
- Input handling — reverted multi-line textarea to single-line `<input>` for reliable Enter-to-send behavior
- History entry selection on click — changed from non-functional `onClick` to `onMouseDown` on `<box>`
- Session re-open after close — `sessionInitPromise` now reset on session destroy so next open creates a fresh session
- All `as any` casts in tool-call state processing — replaced with proper `RichToolState` type with single boundary assertion
- `inputValue` not reactive — converted from mutable `let` to Solid `createSignal`
- Stale `historyMode`, `historyEntries`, `selectedHistoryId` fields in `SideDialogState` type — removed (managed as separate signals)
- `provider` field always empty in history entries — removed unused parameter and field from `HistoryEntry`
- History file I/O blocking TUI — `loadHistory`, `saveEntry`, `deleteEntry` migrated from `fs.*Sync` to `fs.promises`
- Empty `catch {}` in `getAvailableToolIDs` — now logs `console.warn`
- Default model tied to one provider — changed from `"opencode/deepseek-v4-flash-free"` to `null`
- `renderThinking` return typed as `any` — changed to explicit `JSX.Element`
- Magic number `6` in history title truncation — extracted to named `HISTORY_TITLE_PADDING` constant
- Cached tool IDs never invalidated — cleared on `handleClear` to reflect runtime tool changes
- History footer displayed `alt+h` instead of `Alt+H` — now uses `formatKeybind()` consistently
- History footer showed hardcoded `"Del"` — now uses `formatKeybind(deleteKeybind)` matching actual keybind

### Changed
- SideChat.tsx reduced from 758 to 507 lines — extracted `RenderMarkdown`, `renderInlineMarkdown`, `searchSpecialChar` to new `Markdown.tsx`; extracted `RenderHistoryDetail` and `formatTime` to new `HistoryDetail.tsx`
- All keybind labels use `formatKeybind()` for consistent display formatting
- `handleToggleHistory` no longer loads history when exiting history mode (correct direction check)
- `handleClear` now invalidates `cachedToolIDs` and `cachedPromptResult`
- `OverlayState` widened — `onSelectHistoryEntry` accepts `string | undefined` for deselection

### Config
- New `position` option — `"bottom-right"` / `"bottom-left"` / `"top-left"` / `"top-right"`
- Default `model` changed to `null` (was `"opencode/deepseek-v4-flash-free"`)
