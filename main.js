const { app, BrowserWindow, screen, Menu, Tray, nativeImage, ipcMain, dialog, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { CONFIG_FILE, CONFIG_EXAMPLE, USER_DATA_DIR, STATE_FILE, STATE_DIR } = require('./lib/paths');
const pkg = require('./package.json');

const TRAY_SIZE = 22;
const TRAY_POLL_MS = 1000;
const STALE_SESSION_MS = 10 * 60 * 1000;
const WAIT_TIMEOUT_MS = 60 * 1000;
const SURPRISED_DEBOUNCE_MS = 1500;

function ensureConfig() {
  if (fs.existsSync(CONFIG_FILE)) return;
  if (!fs.existsSync(CONFIG_EXAMPLE)) return;
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.copyFileSync(CONFIG_EXAMPLE, CONFIG_FILE);
  console.log('[claude-pet] created', CONFIG_FILE);
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function sanitizeProjects(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function saveConfigFull(cfg) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  try { fs.copyFileSync(CONFIG_FILE, CONFIG_FILE + '.bak'); } catch {}
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
  fs.renameSync(tmp, CONFIG_FILE);
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

let win = null;
let tray = null;
let dragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragInterval = null;

ipcMain.on('pet-drag-start', () => {
  if (!win || win.isDestroyed()) return;
  const { x: cx, y: cy } = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragOffsetX = cx - wx;
  dragOffsetY = cy - wy;
  dragging = true;
  if (!dragInterval) {
    dragInterval = setInterval(() => {
      if (!dragging || !win || win.isDestroyed()) return;
      const { x, y } = screen.getCursorScreenPoint();
      win.setPosition(x - dragOffsetX, y - dragOffsetY);
    }, 16);
  }
});

ipcMain.on('pet-drag-stop', () => {
  dragging = false;
});

let editorWin = null;

function openEditor() {
  if (editorWin && !editorWin.isDestroyed()) {
    editorWin.focus();
    return;
  }
  editorWin = new BrowserWindow({
    width: 480,
    height: 480,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'claude-pet — Edit projects',
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  editorWin.setMenu(null);
  editorWin.loadFile(path.join(__dirname, 'renderer', 'projects.html'));
  editorWin.once('ready-to-show', () => editorWin.show());
  editorWin.on('closed', () => { editorWin = null; });
  if (process.env.CLAUDE_PET_DEVTOOLS === '1') {
    editorWin.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.on('pet:open-editor', openEditor);
ipcMain.on('editor:close', () => {
  if (editorWin && !editorWin.isDestroyed()) editorWin.close();
});

ipcMain.handle('config:get-projects', () => {
  const cfg = loadConfig();
  return Array.isArray(cfg.projects) ? cfg.projects : [];
});

ipcMain.handle('config:pick-folder', async () => {
  const target = (editorWin && !editorWin.isDestroyed()) ? editorWin : win;
  const r = await dialog.showOpenDialog(target, {
    properties: ['openDirectory'],
    title: 'Choose a project folder to track',
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

function buildDiagnosticSnapshot() {
  const lines = [];
  lines.push('# claude-pet diagnostic snapshot');
  lines.push('Generated: ' + new Date().toISOString());
  lines.push('Pet version: ' + (pkg.version || 'unknown'));
  lines.push('Platform: ' + process.platform + ' ' + process.arch + ', Electron ' + process.versions.electron);
  lines.push('');
  lines.push('## state.json');
  lines.push('```json');
  try {
    lines.push(fs.readFileSync(STATE_FILE, 'utf8').trimEnd());
  } catch (e) {
    lines.push('(error reading state.json: ' + (e && e.message) + ')');
  }
  lines.push('```');
  lines.push('');
  lines.push('## config.json');
  lines.push('```json');
  try {
    lines.push(fs.readFileSync(CONFIG_FILE, 'utf8').trimEnd());
  } catch (e) {
    lines.push('(error reading config.json: ' + (e && e.message) + ')');
  }
  lines.push('```');
  lines.push('');
  lines.push('## events.log (last 50 lines)');
  lines.push('```');
  try {
    const log = fs.readFileSync(path.join(STATE_DIR, 'events.log'), 'utf8');
    const arr = log.trim().split('\n');
    lines.push(arr.slice(-50).join('\n'));
  } catch (e) {
    lines.push('(error reading events.log: ' + (e && e.message) + ')');
  }
  lines.push('```');
  return lines.join('\n') + '\n';
}

function copyDiagnosticSnapshot() {
  try {
    clipboard.writeText(buildDiagnosticSnapshot());
    if (Notification.isSupported()) {
      new Notification({
        title: 'claude-pet',
        body: 'Diagnostic snapshot copied to clipboard.',
      }).show();
    }
  } catch (e) {
    if (Notification.isSupported()) {
      new Notification({
        title: 'claude-pet',
        body: 'Failed to copy snapshot: ' + (e && e.message),
      }).show();
    }
  }
}

ipcMain.handle('config:save-projects', (_, projects) => {
  try {
    const sanitized = sanitizeProjects(projects);
    const cfg = loadConfig();
    cfg.projects = sanitized;
    saveConfigFull(cfg);
    return { ok: true, projects: sanitized };
  } catch (e) {
    try { fs.copyFileSync(CONFIG_FILE + '.bak', CONFIG_FILE); } catch {}
    return { ok: false, error: String((e && e.message) || e) };
  }
});

function positionFor(display, size, where) {
  const { x, y, width, height } = display.workArea;
  const margin = 24;
  switch (where) {
    case 'bottom-right':
      return { x: x + width - size - margin, y: y + height - size - margin };
    case 'top-right':
      return { x: x + width - size - margin, y: y + margin };
    case 'top-left':
      return { x: x + margin, y: y + margin };
    case 'bottom-left':
    default:
      return { x: x + margin, y: y + height - size - margin };
  }
}

function createWindow() {
  const config = loadConfig();
  const size = config.petSize || 160;
  const display = screen.getPrimaryDisplay();
  const { x, y } = positionFor(display, size, config.petPosition || 'bottom-left');

  win = new BrowserWindow({
    width: size,
    height: size,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.once('ready-to-show', () => {
    win.showInactive();
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.argv.includes('--devtools') || process.env.CLAUDE_PET_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

function loadTrayImage(name) {
  const p = path.join(__dirname, 'renderer', 'assets', name);
  try {
    return nativeImage.createFromPath(p).resize({ width: TRAY_SIZE, height: TRAY_SIZE });
  } catch {
    return nativeImage.createEmpty();
  }
}

let trayNormalImage = null;
let trayAlertImage = null;
let lastTrayState = null;

function shouldShowAlert() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const now = Date.now();
    return Object.values(state.sessions || {}).some((s) => {
      if (!s.waitingForUser) return false;
      if (now - (s.lastEventAt || 0) >= STALE_SESSION_MS) return false;
      if (s.lastSetAt && now - s.lastSetAt >= WAIT_TIMEOUT_MS) return false;
      if (!s.waitingSince || now - s.waitingSince < SURPRISED_DEBOUNCE_MS) return false;
      return true;
    });
  } catch {
    return false;
  }
}

function updateTrayIcon() {
  if (!tray || (tray.isDestroyed && tray.isDestroyed())) return;
  const next = shouldShowAlert() ? 'alert' : 'normal';
  if (next === lastTrayState) return;
  lastTrayState = next;
  tray.setImage(next === 'alert' ? trayAlertImage : trayNormalImage);
}

function createTray() {
  trayNormalImage = loadTrayImage('normal.png');
  trayAlertImage = loadTrayImage('surprised-red.png');
  tray = new Tray(trayNormalImage);
  tray.setToolTip('claude-pet');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => win && win.show() },
      { label: 'Hide', click: () => win && win.hide() },
      { label: 'Edit projects…', click: openEditor },
      { label: 'Copy diagnostic snapshot', click: copyDiagnosticSnapshot },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  lastTrayState = 'normal';
  setInterval(updateTrayIcon, TRAY_POLL_MS);
}

app.whenReady().then(() => {
  ensureConfig();
  if (app.dock) app.dock.hide();
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
