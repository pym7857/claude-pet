const path = require('path');
const os = require('os');

const SOURCE_ROOT = path.resolve(__dirname, '..');
const IS_PACKAGED = SOURCE_ROOT.includes('.app/Contents/Resources/');

const USER_DATA_DIR = IS_PACKAGED
  ? path.join(os.homedir(), 'Library', 'Application Support', 'claude-pet')
  : SOURCE_ROOT;

module.exports = {
  IS_PACKAGED,
  SOURCE_ROOT,
  USER_DATA_DIR,
  CONFIG_FILE: path.join(USER_DATA_DIR, 'config.json'),
  CONFIG_EXAMPLE: path.join(SOURCE_ROOT, 'config.example.json'),
  STATE_FILE: path.join(os.homedir(), '.claude', 'hooks', 'claude-pet', 'state.json'),
  STATE_DIR: path.join(os.homedir(), '.claude', 'hooks', 'claude-pet'),
};
