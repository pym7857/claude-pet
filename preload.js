const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const { STATE_FILE, CONFIG_FILE } = require('./lib/paths');

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
});
