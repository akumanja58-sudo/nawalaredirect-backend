const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/nawala.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db = null;

function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) { console.error('Save DB error:', e.message); }
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
  return { lastInsertRowid: get('SELECT last_insert_rowid() as id')?.id };
}

function getSetting(key) {
  return get('SELECT value FROM settings WHERE key = ?', [key])?.value || null;
}

const dbInterface = { all, get, run, getSetting };

const dbReadyPromise = initSqlJs().then(SQL => {
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      label TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      is_blocked INTEGER DEFAULT 0,
      last_checked TEXT,
      last_status_code INTEGER,
      response_time INTEGER,
      fail_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS redirect_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      redirected_to TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS health_check_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER,
      status TEXT,
      status_code INTEGER,
      response_time INTEGER,
      error_message TEXT,
      checked_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  for (const [k, v] of [
    ['health_check_interval', '30'], ['report_interval', '4'],
    ['max_fail_count', '3'], ['redirect_mode', 'random']
  ]) db.run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', [k, v]);

  saveDB();
  setInterval(saveDB, 30000);
  console.log('✅ Database initialized');
  return dbInterface;
});

module.exports = dbInterface;
module.exports.dbReadyPromise = dbReadyPromise;

// Migration: tambah kolom baru kalau belum ada
const migrateDB = () => {
  try { db.run('ALTER TABLE domains ADD COLUMN isp_status TEXT'); } catch (e) { }
  try { db.run('ALTER TABLE domains ADD COLUMN redirect_path TEXT DEFAULT ""'); } catch (e) { }
  try { db.run('ALTER TABLE domains ADD COLUMN group_name TEXT DEFAULT ""'); } catch (e) { }
};

// Migration group_name
try { db.run('ALTER TABLE domains ADD COLUMN group_name TEXT DEFAULT ""'); } catch (e) { }
