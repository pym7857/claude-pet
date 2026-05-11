const { app, BrowserWindow, screen, Menu, Tray, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
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

function positionFor(display, size, where) {
  const { x, y, width, height } = display.workArea;
  const margin = 24;
  switch (where) {
    case 'bottom-left':
      return { x: x + margin, y: y + height - size - margin };
    case 'top-right':
      return { x: x + width - size - margin, y: y + margin };
    case 'top-left':
      return { x: x + margin, y: y + margin };
    case 'bottom-right':
    default:
      return { x: x + width - size - margin, y: y + height - size - margin };
  }
}

function createWindow() {
  const config = loadConfig();
  const size = config.petSize || 160;
  const display = screen.getPrimaryDisplay();
  const { x, y } = positionFor(display, size, config.petPosition || 'bottom-right');

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

function createTray() {
  const iconPath = path.join(__dirname, 'renderer', 'assets', 'normal.png');
  let image;
  try {
    image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    image = nativeImage.createEmpty();
  }
  tray = new Tray(image);
  tray.setToolTip('claude-pet');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => win && win.show() },
      { label: 'Hide', click: () => win && win.hide() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
