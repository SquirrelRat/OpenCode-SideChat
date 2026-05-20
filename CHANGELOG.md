# Changelog

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
