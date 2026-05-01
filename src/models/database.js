const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}

// Wrapper mirip sql.js biar ga perlu ubah banyak di domain.js
function all(sql, params = []) {
  // Convert ? ke $1, $2, dst (PostgreSQL style)
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  return query(pgSql, params).then(r => r.rows);
}

function get(sql, params = []) {
  return all(sql, params).then(rows => rows[0] || null);
}

function run(sql, params = []) {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  // Convert sqlite datetime() ke PostgreSQL NOW()
  const finalSql = pgSql
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/date\('now'\)/gi, 'CURRENT_DATE')
    .replace(/date\(created_at\)/gi, 'DATE(created_at)')
    .replace(/date\(r\.created_at\)/gi, 'DATE(r.created_at)');
  return query(finalSql, params).then(r => ({
    lastInsertRowid: r.rows[0]?.id || null,
  }));
}

function getSetting(key) {
  return get('SELECT value FROM settings WHERE key = $1', [key]).then(r => r?.value || null);
}

const dbInterface = { all, get, run, getSetting };

// Init tables
const dbReadyPromise = (async () => {
  console.log('🔄 Connecting to PostgreSQL...');

  await query(`
    CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      label TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      is_blocked INTEGER DEFAULT 0,
      is_priority INTEGER DEFAULT 0,
      last_checked TIMESTAMP,
      last_status_code INTEGER,
      response_time INTEGER,
      fail_count INTEGER DEFAULT 0,
      isp_status TEXT,
      redirect_path TEXT DEFAULT '',
      group_name TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS redirect_logs (
      id SERIAL PRIMARY KEY,
      redirected_to TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS health_check_logs (
      id SERIAL PRIMARY KEY,
      domain_id INTEGER,
      status TEXT,
      status_code INTEGER,
      response_time INTEGER,
      error_message TEXT,
      checked_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Insert default settings
  await query(`
    INSERT INTO settings (key, value) VALUES
      ('health_check_interval', '30'),
      ('report_interval', '4'),
      ('max_fail_count', '3'),
      ('redirect_mode', 'random')
    ON CONFLICT (key) DO NOTHING;
  `);

  console.log('✅ Database initialized (PostgreSQL)');
  return dbInterface;
})();

module.exports = dbInterface;
module.exports.dbReadyPromise = dbReadyPromise;
