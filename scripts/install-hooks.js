#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HOOK_SCRIPT = path.join(PROJECT_ROOT, 'hooks', 'on-event.js');
const NODE_BIN = process.execPath;
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const MARKER = HOOK_SCRIPT;

const EVENT_MAP = {
  SessionStart: 'start',
  UserPromptSubmit: 'prompt',
  Notification: 'notification',
  Stop: 'stop',
  PermissionRequest: 'permission',
  PermissionDenied: 'permission-denied',
  PostToolUse: 'tool-post',
};

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

function isOurEntry(entry) {
  if (!entry || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some((h) => typeof h.command === 'string' && h.command.includes(MARKER));
}

function removeOurs(settings) {
  if (!settings.hooks) return settings;
  for (const event of Object.keys(settings.hooks)) {
    const arr = settings.hooks[event];
    if (!Array.isArray(arr)) continue;
    settings.hooks[event] = arr.filter((e) => !isOurEntry(e));
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

function install() {
  const s = readSettings();
  removeOurs(s);
  s.hooks = s.hooks || {};
  for (const [event, arg] of Object.entries(EVENT_MAP)) {
    s.hooks[event] = s.hooks[event] || [];
    s.hooks[event].push({
      hooks: [
        {
          type: 'command',
          command: `${NODE_BIN} ${HOOK_SCRIPT} ${arg}`,
        },
      ],
    });
  }
  writeSettings(s);
  console.log('installed claude-pet hooks into', SETTINGS_FILE);
  console.log('events:', Object.keys(EVENT_MAP).join(', '));
}

function uninstall() {
  const s = readSettings();
  removeOurs(s);
  writeSettings(s);
  console.log('removed claude-pet hooks from', SETTINGS_FILE);
}

if (process.argv.includes('--uninstall')) uninstall();
else install();
