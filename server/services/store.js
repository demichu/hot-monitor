const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON(filename, defaultValue = []) {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    writeJSON(filename, defaultValue);
    return defaultValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return defaultValue;
  }
}

function writeJSON(filename, data) {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { readJSON, writeJSON, DATA_DIR };
