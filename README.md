# claude-pet

A desktop pet that reacts to Claude Code events. Two pixel-art faces (normal / surprised).
When Claude is waiting for your YES/NO answer on an inline permission prompt, the pet switches to a surprised face, bounces, and shows a red `!` next to its head.

## How it works

- Claude Code hooks invoke `hooks/on-event.js` on every event.
- The handler filters by `cwd` against the whitelist in `config.json` and writes to `~/.claude/hooks/claude-pet/state.json`.
- The Electron renderer polls that state file and switches faces accordingly.

## Setup

```bash
git clone https://github.com/pym7857/claude-pet.git
cd claude-pet
npm install

# pixel-art PNGs are already in renderer/assets/. Regenerate only if you want to:
# node scripts/gen-assets.js

# register Claude Code hooks
node scripts/install-hooks.js

# launch the pet (first run auto-copies config.example.json -> config.json)
npm start

# open config.json and add absolute paths of projects you want to track
```

Uninstall hooks:

```bash
node scripts/install-hooks.js --uninstall
```

## Configuration (`config.json`)

`config.json` is per-user and gitignored. On first launch the app copies `config.example.json` to `config.json` — edit that copy.

```json
{
  "projects": ["/Users/me/Desktop/some-project"],
  "petPosition": "bottom-right",
  "petSize": 160,
  "pollIntervalMs": 500
}
```

- `projects` — absolute paths of projects to track. Subdirectories match too. Empty means nothing is tracked.
- `petPosition` — `bottom-right` | `bottom-left` | `top-right` | `top-left`
- `petSize` — pet window size in pixels.
- `pollIntervalMs` — how often the renderer re-reads the state file.

## Mood triggers

| Event | Mood |
|---|---|
| Claude is waiting for your YES/NO permission (`PermissionRequest` hook) | **surprised** (bouncing + `!`) |
| `Notification` hook fires (fallback signal) | **surprised** |
| Any of `UserPromptSubmit`, `PostToolUse`, `PermissionDenied`, `Stop` | normal |

The surprised face only fires for sessions whose `cwd` is in `projects`. Untracked projects are ignored.

## Interactions

- **Hover** — shows the list of tracked projects as a panel sliding up under the pet.
- **Drag** — click-and-drag anywhere on the pet to move it. The position resets to `petPosition` on next launch.
- **Tray icon** — Show / Hide / Quit menu from the macOS menu bar.

## Replacing the pixel art

Drop your own PNGs into `renderer/assets/` (filenames: `normal.png`, `surprised.png`). Square images render best; CSS uses `image-rendering: pixelated` so any size works.

## Dev mode

```bash
npm run dev   # opens Electron DevTools
```

Useful for inspecting the renderer console or watching hook state updates.

## Packaging into a .app

Build a native macOS application bundle so you can launch the pet by double-clicking it (no terminal / npm).

```bash
npm run dist
```

Output: `dist/mac-arm64/claude-pet.app` (or `mac-x64`). The `.app` is hidden from the Dock (`LSUIElement: true`) so it only appears in the menu bar tray.

Move it into Applications:

```bash
mv dist/mac-arm64/claude-pet.app /Applications/
```

When running from a packaged `.app`, `config.json` lives in `~/Library/Application Support/claude-pet/` (the user-writable location). The bundle ships with `config.example.json` and is copied there on first launch. The hook handler also reads from that user-data location when invoked from inside a packaged app.

## Auto-start at login

After installing the `.app`, register a macOS LaunchAgent so the pet launches at every login:

```bash
npm run autostart:install
```

This writes `~/Library/LaunchAgents/com.pym7857.claude-pet.plist` pointing at the `.app` binary and loads it. The pet starts immediately and again every time you log in.

Remove it:

```bash
npm run autostart:uninstall
```

## One-shot setup

After cloning:

```bash
npm install
npm run setup
```

`setup` runs `gen-assets` → `dist` → `install-hooks` → `autostart:install`. After it finishes:

1. Move `dist/mac-arm64/claude-pet.app` to `/Applications/` (the autostart script falls back to `dist/` if you skip this, but `/Applications/` is the stable location).
2. Edit `~/Library/Application Support/claude-pet/config.json` to add the absolute paths of projects you want to track.
3. Done — the pet is running and will keep starting at every login.

## Project layout

```
claude-pet/
├── main.js               # Electron main process
├── preload.js            # contextBridge exposing state/config/drag IPC
├── config.example.json   # template — copied to config.json on first launch
├── renderer/
│   ├── index.html
│   ├── styles.css
│   ├── renderer.js       # polls state, swaps mood, renders project list
│   └── assets/
│       ├── normal.png
│       └── surprised.png
├── hooks/
│   └── on-event.js       # Claude Code hook handler (cwd whitelist filter)
└── scripts/
    ├── gen-assets.js     # dependency-free PNG generator for pixel-art faces
    └── install-hooks.js  # adds/removes our hooks in ~/.claude/settings.json
```

## Notes

- Tested on macOS only. Linux/Windows are untested.
- Inside VSCode's integrated terminal, `ELECTRON_RUN_AS_NODE=1` is inherited from the parent process and blocks GUI mode. `npm start` unsets it automatically; if you launch `electron .` manually you need to clear it yourself.
- `sandbox: false` is set in the BrowserWindow to allow the preload script to use Node modules (`fs`, `path`, `os`). This is safe here because no untrusted content is loaded.
