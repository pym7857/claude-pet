#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const APP_NAME = 'claude-pet';
const LABEL = 'com.pym7857.claude-pet';
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${LABEL}.plist`);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CANDIDATES = [
  '/Applications/claude-pet.app',
  path.join(PROJECT_ROOT, 'dist', 'mac-arm64', 'claude-pet.app'),
  path.join(PROJECT_ROOT, 'dist', 'mac', 'claude-pet.app'),
  path.join(PROJECT_ROOT, 'dist', 'mac-x64', 'claude-pet.app'),
];

function findApp() {
  for (const c of CANDIDATES) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function buildPlist(execPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${execPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>ProcessType</key>
    <string>Interactive</string>
</dict>
</plist>
`;
}

function install() {
  const appPath = findApp();
  if (!appPath) {
    console.error(`error: ${APP_NAME}.app not found. Run "npm run dist" first, or copy it to /Applications/.`);
    console.error('searched:');
    for (const c of CANDIDATES) console.error('  ' + c);
    process.exit(1);
  }
  const execPath = path.join(appPath, 'Contents', 'MacOS', APP_NAME);
  if (!fs.existsSync(execPath)) {
    console.error(`error: executable not found at ${execPath}`);
    process.exit(1);
  }

  fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  fs.writeFileSync(PLIST_PATH, buildPlist(execPath));
  console.log('wrote', PLIST_PATH);

  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`, { stdio: 'pipe' });
  } catch {}
  try {
    execSync(`launchctl load -w "${PLIST_PATH}"`, { stdio: 'inherit' });
    console.log('loaded LaunchAgent — claude-pet will auto-start at every login');
    console.log('app path:', appPath);
  } catch (err) {
    console.error('failed to load LaunchAgent:', err.message);
    process.exit(1);
  }
}

function uninstall() {
  if (!fs.existsSync(PLIST_PATH)) {
    console.log('no LaunchAgent installed at', PLIST_PATH);
    return;
  }
  try {
    execSync(`launchctl unload "${PLIST_PATH}"`, { stdio: 'inherit' });
  } catch {}
  fs.unlinkSync(PLIST_PATH);
  console.log('removed', PLIST_PATH);
}

const cmd = process.argv[2];
if (cmd === 'install') install();
else if (cmd === 'uninstall') uninstall();
else {
  console.error('usage: autostart.js <install|uninstall>');
  process.exit(1);
}
