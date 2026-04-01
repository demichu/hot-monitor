const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_DIR = path.join(__dirname, '..', 'db');
const DB_PATH = path.join(DB_DIR, 'hot-monitor.db');

let db;

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
  }
}

function cleanupLegacyFile(filename) {
  const legacyPath = path.join(DATA_DIR, filename);
  if (fs.existsSync(legacyPath)) {
    try {
      fs.unlinkSync(legacyPath);
    } catch {
      // ignore legacy cleanup errors
    }
  }
}

function readJSON(filename, defaultValue = []) {
  ensureDb();
  cleanupLegacyFile(filename);

  const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(filename);
  if (!row) {
    writeJSON(filename, defaultValue);
    return defaultValue;
  }
  try {
    return JSON.parse(row.value);
  } catch {
    return defaultValue;
  }
}

function writeJSON(filename, data) {
  ensureDb();
  cleanupLegacyFile(filename);

  db.prepare(`
    INSERT INTO kv_store (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt
  `).run(filename, JSON.stringify(data), new Date().toISOString());
}

module.exports = { readJSON, writeJSON, DATA_DIR, DB_PATH };
