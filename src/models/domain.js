const db = require('./database');

const Domain = {
  getAll() { // includes isp_status & redirect_path
    return db.all('SELECT * FROM domains ORDER BY created_at DESC');
  },
  getActive() {
    return db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 ORDER BY fail_count ASC');
  },
  getRandomActive() {
    const active = this.getActive();
    if (!active.length) return null;
    // Gunakan crypto untuk randomness yang lebih baik
    const idx = Math.floor((Date.now() % 1000) / 1000 * active.length + Math.random() * active.length) % active.length;
    return active[idx];
  },
  add(url, label = '') {
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    try {
      const r = db.run('INSERT INTO domains (url, label) VALUES (?, ?)', [url, label]);
      return { success: true, id: r.lastInsertRowid };
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return { success: false, error: 'Domain sudah ada' };
      throw e;
    }
  },
  update(id, data) {
    const fields = [], values = [];
    if (data.url !== undefined) { fields.push('url=?'); values.push(data.url); }
    if (data.label !== undefined) { fields.push('label=?'); values.push(data.label); }
    if (data.is_active !== undefined) { fields.push('is_active=?'); values.push(data.is_active ? 1 : 0); }
    if (data.is_blocked !== undefined) { fields.push('is_blocked=?'); values.push(data.is_blocked ? 1 : 0); }
    if (!fields.length) return { success: false, error: 'Tidak ada yang diupdate' };
    fields.push("updated_at=datetime('now')");
    values.push(parseInt(id));
    db.run(`UPDATE domains SET ${fields.join(',')} WHERE id=?`, values);
    return { success: true };
  },
  delete(id) {
    db.run('DELETE FROM domains WHERE id=?', [parseInt(id)]);
    return { success: true };
  },
  updateHealthCheck(id, { isBlocked, statusCode, responseTime, error }) {
    const current = db.get('SELECT fail_count FROM domains WHERE id=?', [id]);
    if (!current) return;
    const maxFail = parseInt(db.getSetting('max_fail_count') || '3');
    const failCount = isBlocked ? (current.fail_count + 1) : 0;
    const blocked = failCount >= maxFail ? 1 : 0;
    db.run(`UPDATE domains SET is_blocked=?,last_checked=datetime('now'),last_status_code=?,response_time=?,fail_count=?,updated_at=datetime('now') WHERE id=?`,
      [blocked, statusCode, responseTime, failCount, id]);
    db.run('INSERT INTO health_check_logs(domain_id,status,status_code,response_time,error_message) VALUES(?,?,?,?,?)',
      [id, isBlocked ? 'blocked' : 'ok', statusCode, responseTime, error || null]);
  },
  getStats() {
    return {
      total:          db.get('SELECT COUNT(*) as c FROM domains').c,
      active:         db.get('SELECT COUNT(*) as c FROM domains WHERE is_active=1 AND is_blocked=0').c,
      blocked:        db.get('SELECT COUNT(*) as c FROM domains WHERE is_blocked=1').c,
      inactive:       db.get('SELECT COUNT(*) as c FROM domains WHERE is_active=0').c,
      totalRedirects: db.get('SELECT COUNT(*) as c FROM redirect_logs').c,
      todayRedirects: db.get("SELECT COUNT(*) as c FROM redirect_logs WHERE date(created_at)=date('now')").c,
    };
  },
  logRedirect(url, userAgent, ip) {
    db.run('INSERT INTO redirect_logs(redirected_to,user_agent,ip_address) VALUES(?,?,?)', [url, userAgent, ip]);
  },
  getById(id) {
    return db.get('SELECT * FROM domains WHERE id=?', [parseInt(id)]);
  }
};

module.exports = Domain;
