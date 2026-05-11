const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'claude-pet', 'state.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

contextBridge.exposeInMainWorld('petAPI', {
  readState: () => readJson(STATE_FILE, { sessions: {}, lastEvent: null }),
  readConfig: () => readJson(CONFIG_FILE, {}),
  dragStart: () => ipcRenderer.send('pet-drag-start'),
  dragStop: () => ipcRenderer.send('pet-drag-stop'),
  assetUrls: {
    normal: 'pet-asset://normal.png',
    surprised: 'pet-asset://surprised.png',
  },
});
