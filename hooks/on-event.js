#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { STATE_DIR, STATE_FILE, CONFIG_FILE } = require('../lib/paths');

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

const STATE_LOCK = STATE_FILE + '.lock';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withLock(fn) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const deadline = Date.now() + 2000;
  let acquired = false;
  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(STATE_LOCK);
      acquired = true;
      break;
    } catch {
      try {
        const st = fs.statSync(STATE_LOCK);
        if (Date.now() - st.mtimeMs > 5000) fs.rmdirSync(STATE_LOCK);
      } catch {}
      await sleep(5);
    }
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try { fs.rmdirSync(STATE_LOCK); } catch {}
    }
  }
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
  const SETS_WAITING = new Set(['notification', 'permission']);
  const CLEARS_WAITING = new Set([
    'prompt',
    'tool-post',
    'tool-fail',
    'permission-denied',
    'stop',
    'stop-fail',
  ]);

  let waitingForUser = false;
  await withLock(() => {
    const state = readState();
    state.sessions = state.sessions || {};
    const prior = state.sessions[sessionId] || {};

    const wasWaiting = (prior.lastSetAt || 0) > (prior.lastClearAt || 0);

    let lastSetAt = prior.lastSetAt || 0;
    let lastClearAt = prior.lastClearAt || 0;
    if (SETS_WAITING.has(eventArg)) lastSetAt = Math.max(lastSetAt, now);
    else if (CLEARS_WAITING.has(eventArg)) lastClearAt = Math.max(lastClearAt, now);
    waitingForUser = lastSetAt > lastClearAt;

    let waitingSince = prior.waitingSince || 0;
    if (!wasWaiting && waitingForUser) waitingSince = now;
    else if (!waitingForUser) waitingSince = 0;

    state.sessions[sessionId] = {
      cwd,
      lastEvent: eventArg,
      lastEventAt: now,
      lastSetAt,
      lastClearAt,
      waitingSince,
      waitingForUser,
    };
    state.lastEvent = { type: eventArg, at: now, sessionId, cwd };
    writeState(state);
  });

  try {
    const logLine = `${new Date().toISOString()} | ${eventArg.padEnd(18)} | wait=${waitingForUser ? 'T' : 'F'} | ${sessionId.slice(0, 8)} | ${cwd}\n`;
    fs.appendFileSync(path.join(STATE_DIR, 'events.log'), logLine);
  } catch {}

  process.exit(0);
})();
