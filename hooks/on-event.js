#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(os.homedir(), '.claude', 'hooks', 'claude-pet');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'config.json');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 500);
  });
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { projects: [] };
  }
}

function isTrackedProject(cwd, projects) {
  if (!cwd) return false;
  const normalized = path.resolve(cwd);
  return projects.some((p) => {
    const root = path.resolve(p);
    return normalized === root || normalized.startsWith(root + path.sep);
  });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { sessions: {}, lastEvent: null };
  }
}

function writeState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

(async () => {
  const eventArg = process.argv[2] || 'unknown';
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const cwd = payload.cwd || process.cwd();
  const config = loadConfig();
  if (!isTrackedProject(cwd, config.projects || [])) {
    process.exit(0);
  }

  const sessionId = payload.session_id || 'default';
  const now = Date.now();
  const state = readState();
  state.sessions = state.sessions || {};

  const prior = state.sessions[sessionId] || {};
  const SETS_WAITING = new Set(['notification', 'permission']);
  const CLEARS_WAITING = new Set(['prompt', 'tool-post', 'permission-denied', 'stop']);
  let waitingForUser = prior.waitingForUser || false;
  if (SETS_WAITING.has(eventArg)) waitingForUser = true;
  else if (CLEARS_WAITING.has(eventArg)) waitingForUser = false;

  state.sessions[sessionId] = {
    cwd,
    lastEvent: eventArg,
    lastEventAt: now,
    waitingForUser,
  };

  state.lastEvent = { type: eventArg, at: now, sessionId, cwd };
  writeState(state);
  process.exit(0);
})();
