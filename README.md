# claude-pet

A tiny desktop pet that lives in the corner of your screen and reacts to Claude Code events.
When Claude is waiting for your YES/NO answer on an inline permission prompt, the pet snaps to a surprised face, **bounces up and down**, and a red **`!`** pops up next to its head — so you can tell from across the room that Claude needs you.

## The pet

| Idle | Waiting for you (bouncing + `!`) |
|:-:|:-:|
| ![normal](docs/face-normal.png) | ![surprised](docs/face-surprised.png) |
| Sits quietly while Claude is working. | Bounces continuously with a red exclamation mark until you respond. |

The pet is rendered as a 32×32 pixel-art face inside a rounded 160×160 frame and stays on top of all windows. It's hidden from the Dock and only appears in the menu-bar tray.

## How it reacts to Claude Code events

The pet listens for Claude Code hooks (see [Claude Code hooks docs](https://code.claude.com/docs/en/hooks)) and only reacts for sessions whose `cwd` is in your tracked-project allowlist.

| Hook event | Pet behavior |
|---|---|
| `PermissionRequest` — Claude is asking you to allow a tool (e.g. *"Allow this bash command? [1 Yes / 2 No]"*) | **Surprised face** + bounce animation + red `!` |
| `Notification` — fallback signal (used in some Claude Code configurations) | **Surprised face** + bounce + `!` |
| `UserPromptSubmit` — you sent Claude a new prompt | Back to normal |
| `PostToolUse` — the tool finished running | Back to normal |
| `PermissionDenied` — auto-denied without prompting you | Back to normal |
| `Stop` / `StopFailure` — Claude finished its response (or was interrupted) | Back to normal |
| `PostToolUseFailure` — the tool ran but threw an error | Back to normal |

The surprised animation is purely CSS — a 0.55s `translateY` keyframe loop on the face plus a rotate/scale wiggle on the `!`. Stops the moment any "back to normal" event fires.

## Two ways to run it

### A. Dev mode (no packaging)

```bash
git clone https://github.com/pym7857/claude-pet.git
cd claude-pet
npm install
node scripts/install-hooks.js     # register Claude Code hooks
npm start                         # launch the pet (first run creates config.json)
```

Edit `config.json` (created from `config.example.json`) and add the absolute paths of projects you want to track:

```json
{
  "projects": ["/Users/me/Desktop/my-project"],
  "petPosition": "bottom-right",
  "petSize": 160,
  "pollIntervalMs": 500
}
```

### B. Packaged `.app` + auto-start at login

After installing dependencies and (optionally) registering hooks from source:

```bash
npm install
npm run dist                                            # build dist/mac-arm64/claude-pet.app

mv dist/mac-arm64/claude-pet.app /Applications/         # move to a stable location

# re-register hooks so they point at the .app (not the source folder)
node /Applications/claude-pet.app/Contents/Resources/app/scripts/install-hooks.js

npm run autostart:install                               # install macOS LaunchAgent
```

After this:
- The pet launches immediately.
- Every login the pet starts automatically — no terminal, no `npm start`.
- Your config lives at `~/Library/Application Support/claude-pet/config.json` (the source `config.json` is only used in dev mode).
- To open the config quickly:
  ```bash
  open -e "$HOME/Library/Application Support/claude-pet/config.json"
  ```

Remove auto-start:

```bash
npm run autostart:uninstall
```

Remove hooks:

```bash
node scripts/install-hooks.js --uninstall
```

> **Code signing note:** The `.app` is not signed (no Apple Developer ID). The first time you double-click it from Finder, macOS Gatekeeper may complain. Right-click → **Open** to bypass it once.

## Configuration reference (`config.json`)

| Key | Default | Meaning |
|---|---|---|
| `projects` | `[]` | Absolute paths to track. Subdirectories of any listed path also match. Empty = nothing is tracked, pet stays idle. |
| `petPosition` | `"bottom-right"` | One of `bottom-right`, `bottom-left`, `top-right`, `top-left`. |
| `petSize` | `160` | Pet window size in pixels. |
| `pollIntervalMs` | `500` | How often the renderer re-reads the hook state file. |

Changes to `config.json` take effect within `pollIntervalMs` — no restart needed for `projects` updates.

## Interactions

- **Hover** — slides up a panel showing the list of tracked projects (the last two path segments, full path as native tooltip).
- **Drag** — click and drag anywhere on the pet to move it. Position resets to `petPosition` on next launch.
- **Tray icon** — *Show / Hide / Quit* menu from the macOS menu bar.

## Replacing the pixel art

Drop your own PNGs into `renderer/assets/`:

- `normal.png` — idle face
- `surprised.png` — waiting-for-you face

Any square size works; CSS uses `image-rendering: pixelated` so pixel art stays crisp at any scale. If you want to also update the `.app` icon, drop a 1024×1024 PNG at `build/icon.png` and rebuild with `npm run dist`.

To regenerate the bundled pixel art from the ASCII art in `scripts/gen-assets.js`:

```bash
npm run gen-assets
```

## How it works

```
Claude Code event  →  hook command (~/.claude/settings.json)
                      → node hooks/on-event.js <eventArg>
                      → checks cwd against config.json projects whitelist
                      → writes ~/.claude/hooks/claude-pet/state.json

Electron renderer  →  polls state.json every 500 ms
                      → switches face / triggers bounce + `!`
```

Two important paths:

| Mode | `config.json` location |
|---|---|
| Dev (`npm start`) | inside the source folder |
| Packaged (`.app`) | `~/Library/Application Support/claude-pet/` |

The `.app` ships with `config.example.json` and copies it on first launch. The same file is used by the hook handler when invoked from inside the packaged bundle — so `npm start` and the `.app` never fight over the same file.

## Project layout

```
claude-pet/
├── main.js                     # Electron main process
├── preload.js                  # contextBridge: state/config/drag IPC
├── config.example.json         # template — copied to config.json on first launch
├── lib/
│   └── paths.js                # dev vs packaged path resolution
├── renderer/
│   ├── index.html
│   ├── styles.css              # frame, bounce keyframes, tooltip, exclamation
│   ├── renderer.js             # state polling, mood switching, project list
│   └── assets/
│       ├── normal.png
│       └── surprised.png
├── hooks/
│   └── on-event.js             # Claude Code hook handler (cwd filter)
├── scripts/
│   ├── gen-assets.js           # zero-dep PNG generator for faces + icon
│   ├── install-hooks.js        # add/remove our hooks in ~/.claude/settings.json
│   └── autostart.js            # macOS LaunchAgent install/uninstall
├── build/
│   └── icon.png                # 1024×1024 icon for the .app bundle
└── docs/
    ├── face-normal.png         # used in this README
    └── face-surprised.png
```

## npm scripts

| Command | What it does |
|---|---|
| `npm start` | Run the pet in dev mode. |
| `npm run dev` | Same as `start` but opens DevTools. |
| `npm run gen-assets` | Regenerate all pixel-art PNGs from the ASCII art. |
| `npm run install-hooks` | Register Claude Code hooks. |
| `npm run uninstall-hooks` | Remove registered hooks. |
| `npm run reset-state` | Delete the hook state file (use if the pet is stuck on surprised). |
| `npm run dist` | Build `dist/mac-arm64/claude-pet.app`. |
| `npm run autostart:install` | Install macOS LaunchAgent (auto-start at login). |
| `npm run autostart:uninstall` | Remove the LaunchAgent. |
| `npm run setup` | One-shot: `gen-assets` → `dist` → `install-hooks` → `autostart:install`. |

## Troubleshooting

### The pet stays surprised after I click YES/NO

Most common cause: a previous Claude Code session was killed while waiting for a permission prompt, so its `waitingForUser: true` is still sitting in the state file.

Quick fix:

```bash
npm run reset-state    # deletes ~/.claude/hooks/claude-pet/state.json
```

The renderer also automatically ignores sessions whose last event is older than 10 minutes, so the pet self-recovers if you walk away. To trace the issue, tail the event log:

```bash
tail -f ~/.claude/hooks/claude-pet/events.log
```

You'll see one line per hook invocation — useful for spotting missing `tool-post`/`tool-fail`/`stop` events.

### After updating, hooks aren't firing correctly

The hook event list may have changed. Re-run the installer to sync `~/.claude/settings.json`:

```bash
node scripts/install-hooks.js     # idempotent — replaces any previous claude-pet entries
```

## Notes

- Tested on macOS (Apple Silicon). Linux / Windows are untested.
- Inside VSCode's integrated terminal, `ELECTRON_RUN_AS_NODE=1` is inherited from the parent process and blocks GUI mode. `npm start` and `npm run dev` unset it automatically; if you launch `electron .` manually, clear that variable yourself.
- `sandbox: false` is set on the BrowserWindow so the preload script can use Node modules (`fs`, etc.). This is safe here because no untrusted content is loaded.
- `process.execPath` is baked into the hook commands at install time, so the hooks fire even when Claude Code launches them in a stripped-down shell that doesn't have `node` on `PATH`.
