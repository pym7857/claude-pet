# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
