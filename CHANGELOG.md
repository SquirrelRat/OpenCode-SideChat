# Changelog

## [1.1.0] - 2026-05-19

### Fixed

- Double-submission race condition on prompt submit
- Unbounded entries array growth causing memory leak
- Stale session init promise blocking all submits after first failure
- Crash on malformed model data from API
- Panel stuck visible when navigating away from session route
- Panel title now shows "OpenCode-SideChat" instead of "SideChat"
- Focus now restores to main session input when panel closes
- SideChat no longer reads and follows project AGENTS.md — context bleed fixed with system prompt override
- Empty catch blocks in refreshSession, clearListeners, destroySession now log errors instead of swallowing silently
- Loading state can hang forever — added 120s timeout with auto-recovery
- Unclosed block comment in config parser truncated remaining config
- Render crashes propagate to root — added ErrorBoundary wrapper around SideChat
- Empty model providers crash model picker — now shows error toast and returns early
- Streaming deltas race with session.idle — now guarded by loading state check
- Null parts from API crash refreshSession — added null guard
- Token count only counted assistant messages — now counts all messages

### Changed

- Streaming answer extracted to separate signal for better reactivity and fewer unnecessary re-renders
- handleClear no longer forces panel visible — respects current visibility state
- Tool IDs cached after first fetch instead of re-fetching per prompt
- Config parser handles unclosed block comments gracefully instead of truncating
