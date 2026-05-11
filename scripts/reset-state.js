#!/usr/bin/env node
const fs = require('fs');
const { STATE_FILE } = require('../lib/paths');

try {
  fs.unlinkSync(STATE_FILE);
  console.log('removed', STATE_FILE);
} catch (err) {
  if (err.code === 'ENOENT') console.log('no state file to remove');
  else throw err;
}
