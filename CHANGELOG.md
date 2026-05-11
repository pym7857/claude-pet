# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- **Pet appeared to stay red even though all permission prompts had been answered.** Root cause was visual, not data — `PreToolUse` fires on every tool use including auto-allowed ones, producing very short `permission → tool-post` flicker pairs (tens of milliseconds). When Claude ran many auto-allowed tools back-to-back the flickers blurred into "always red" to the eye.

  Initial attempt at a 1.5s UI-side debounce wasn't enough: the renderer / main process only sample `state.json` every ~500 ms-1 s, so polling could catch `wait=true` two ticks in a row purely by luck (~25 % chance per burst) and the debounce window would erroneously elapse. The real fix is at the **hook layer**: `hooks/on-event.js` now writes a `waitingSince` timestamp into each session, capturing only the **transition** from `wait=false` to `wait=true` and resetting to `0` on any clear. The renderer and tray then compare `now - waitingSince` against `SURPRISED_DEBOUNCE_MS = 1500`, independent of polling cadence. Bursts of auto-allowed tools — where `wait=false` keeps slipping in between two `wait=true` transitions, even for microseconds — keep resetting `waitingSince` and never register visually. Real YES/NO prompts (wait time ≫ 1.5 s) still surface as expected.

### Added

- **"Copy diagnostic snapshot" menu item in the macOS tray menu.** One click collects `state.json`, `config.json`, and the last 50 lines of `events.log` into a single markdown blob and copies it to the clipboard. Designed for one-click bug reports when the pet behaves unexpectedly — no need for the user to manually run terminal commands. A macOS Notification confirms the copy.
- **Right-click the pet (or use the tray "Edit projects…" menu) to open a built-in projects editor.** The editor is a small BrowserWindow that lists the currently tracked folders, lets you pick new ones via the native macOS folder dialog, remove existing entries with one click, and saves back to `~/Library/Application Support/claude-pet/config.json`. Safety patterns applied to the save path: atomic write (`.tmp` + `rename`), automatic `.bak` snapshot before each save, schema preservation (only `projects` is touched; `petPosition` / `petSize` / `pollIntervalMs` are kept), post-write reload verification, and validation that drops non-string / empty / duplicate entries.

### Changed

- **Tray icon polling sped up from 1 s → 250 ms** (`TRAY_POLL_MS` in `main.js`). The renderer face was already snapping back within `pollIntervalMs` (default 500 ms), but the tray reflected `tool-post` clears up to a full second late, which felt sluggish when answering YES on a fast tool. CPU overhead is negligible — `state.json` is a few hundred bytes.
- **Unified `config.json` location across dev mode and the packaged `.app`.** Previously `lib/paths.js` resolved `USER_DATA_DIR` to the source folder in dev mode and to `~/Library/Application Support/claude-pet` only when packaged, which meant the source `config.json` (used by `npm start` + every hook) and the `.app` `config.json` (used by the packaged pet) could drift out of sync — projects added in one place wouldn't be respected in the other. `USER_DATA_DIR` is now hard-coded to `~/Library/Application Support/claude-pet` for every mode. One file, one edit. The source `config.json` is now unused (already `.gitignore`d, safe to delete).

### Fixed

- **Pet still got stuck on red even after the race-condition fix**, because the underlying cause turned out to be a *second*, separate bug: some Claude Code events (certain tool types, ESC-cancelled prompts, agent/MCP calls) leave a `permission` SET in `state.json` with no matching `tool-post` / `permission-denied` follow-up. timestamp comparison correctly says `lastSetAt > lastClearAt` → wait=true, so the pet stays red until the 10-minute stale window closes. Mitigation, added in `main.js` and `renderer/renderer.js`: a session is treated as waiting only if its `lastSetAt` is at most **60 seconds old** (new `WAIT_TIMEOUT_MS`). Real YES/NO prompts are typically answered well within that window; orphaned SETs auto-clear in ≤60 s instead of ≤10 min.

## [0.1.0] - 2026-05-11

### Fixed

- **Pet stuck on the surprised face after answering several permission prompts in a row** (`hooks/on-event.js`).
  When Claude fired multiple `PreToolUse` hooks at near-identical times (e.g. parallel tool calls), the `readState → modify → writeState` sequence in `on-event.js` had a classic read-modify-write race. A late-arriving `permission` write could overwrite the `tool-post` write that should have cleared the wait flag, leaving `waitingForUser: true` permanently — the pet kept showing the red exclamation mark even though every prompt had been answered. Two changes:
    1. **`mkdir`-based spinlock** around the state mutation (POSIX `mkdir` is atomic), so concurrent hooks now serialise on `state.json.lock`. Includes a 5-second stale-lock cleanup so a crashed hook can't permanently block everyone.
    2. **Timestamp-based wait computation**: each session now tracks `lastSetAt` and `lastClearAt` and derives `waitingForUser = lastSetAt > lastClearAt`. `Math.max` guarantees both values are monotonically non-decreasing. Even if the OS reorders process completion, the final state depends on hook *fire time*, not write order.

  Verified with a stress test: 5 `permission` events followed by 5 `tool-post` events (10 ms apart, all on the same session) → `wait=false` in 5/5 runs. Worst-case "everything fired in the same millisecond" still produces a consistent result (no corruption); only the tie-breaking outcome varies, which doesn't occur in real Claude Code traffic.

- **`.app` hook re-registration command from `README.md` didn't work** (`package.json`).
  `electron-builder` defaults to packing app code into `Resources/app.asar`, but the README told users to run:
  ```
  node /Applications/claude-pet.app/Contents/Resources/app/scripts/install-hooks.js
  ```
  That path doesn't exist after the build because the code is inside the `.asar` archive. Added `"asar": false` to the `build` block so the path stays valid. Discovered while sanity-testing a fresh `git clone` flow.

### Changed

- **Default `petPosition` is now `bottom-left`** (was `bottom-right`). Updated `config.example.json`, the `main.js` fallback, and the `positionFor` switch default. Existing user configs (`config.json` in dev mode, `~/Library/Application Support/claude-pet/config.json` for the `.app`) are not migrated automatically — change them by hand if you want the new default.
