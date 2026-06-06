const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "goykarta.sqlite");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

async function initDatabase(defaultMarks) {
  await run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      query TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      ip TEXT PRIMARY KEY,
      query_count INTEGER NOT NULL DEFAULT 0,
      last_active TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureSetting("captcha_enabled", "1");
  await ensureSetting("marks_json", defaultMarks);
  await ensureSetting("marks_updated_at", new Date().toISOString());
}

async function ensureSetting(key, value) {
  const row = await get(`SELECT key FROM settings WHERE key = ?`, [key]);
  if (!row) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [key, value]
    );
  }
}

async function setSetting(key, value) {
  await run(
    `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `,
    [key, value]
  );
}

async function getSettingsObject() {
  const rows = await all(`SELECT key, value FROM settings`);
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

async function logSearch(ip, query, result) {
  await run(`INSERT INTO logs (ip, query, result) VALUES (?, ?, ?)`, [
    ip,
    query,
    result,
  ]);
}

async function touchUser(ip) {
  await run(
    `
      INSERT INTO users (ip, query_count, last_active)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(ip) DO UPDATE SET
        query_count = query_count + 1,
        last_active = CURRENT_TIMESTAMP
    `,
    [ip]
  );
}

function getRecentLogs(limit = 100) {
  return all(
    `SELECT ip, query, result, created_at FROM logs ORDER BY id DESC LIMIT ?`,
    [limit]
  );
}

function getUsers(limit = 100) {
  return all(
    `
      SELECT ip, query_count, last_active
      FROM users
      ORDER BY last_active DESC
      LIMIT ?
    `,
    [limit]
  );
}

module.exports = {
  initDatabase,
  getSettingsObject,
  setSetting,
  logSearch,
  touchUser,
  getRecentLogs,
  getUsers,
};
