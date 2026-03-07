const db = require('./database');

const Domain = {
  getAll() {
    return db.all('SELECT * FROM domains ORDER BY group_name ASC, created_at DESC');
  },
  getByGroup(groupName) {
    return db.all('SELECT * FROM domains WHERE group_name=? ORDER BY created_at DESC', [groupName]);
  },
  getActiveByGroup(groupName) {
    return db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 AND group_name=? ORDER BY fail_count ASC', [groupName]);
  },
  getAllGroups() {
    return db.all('SELECT DISTINCT group_name FROM domains WHERE group_name IS NOT NULL AND group_name != "" ORDER BY group_name ASC');
  },
  getActive() {
    return db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 ORDER BY fail_count ASC');
  },
  getRandomActive() {
    const active = this.getActive();
    if (!active.length) return null;
    const idx = Math.floor((Date.now() % 1000) / 1000 * active.length + Math.random() * active.length) % active.length;
    return active[idx];
  },
  getRandomActiveByGroup(groupName) {
    const active = this.getActiveByGroup(groupName);
    if (!active.length) return null;
    const idx = Math.floor((Date.now() % 1000) / 1000 * active.length + Math.random() * active.length) % active.length;
    return active[idx];
  },
  add(url, label = '', groupName = '') {
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    try {
      const r = db.run('INSERT INTO domains (url, label, group_name) VALUES (?, ?, ?)', [url, label, groupName]);
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
    if (data.group_name !== undefined) { fields.push('group_name=?'); values.push(data.group_name); }
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
  updateHealthCheck(id, { isBlocked, statusCode, responseTime, error, forceBlocked = false }) {
    const current = db.get('SELECT fail_count FROM domains WHERE id=?', [id]);
    if (!current) return;
    const maxFail = parseInt(db.getSetting('max_fail_count') || '3');
    const failCount = isBlocked ? (current.fail_count + 1) : 0;
    const blocked = (forceBlocked || failCount >= maxFail) ? (isBlocked ? 1 : 0) : 0;
    db.run(
      `UPDATE domains SET is_blocked=?,last_checked=datetime('now'),last_status_code=?,response_time=?,fail_count=?,updated_at=datetime('now') WHERE id=?`,
      [blocked, statusCode, responseTime, failCount, id]
    );
    db.run(
      'INSERT INTO health_check_logs(domain_id,status,status_code,response_time,error_message) VALUES(?,?,?,?,?)',
      [id, isBlocked ? 'blocked' : 'ok', statusCode, responseTime, error || null]
    );
  },
  getStats() {
    return {
      total: db.get('SELECT COUNT(*) as c FROM domains').c,
      active: db.get('SELECT COUNT(*) as c FROM domains WHERE is_active=1 AND is_blocked=0').c,
      blocked: db.get('SELECT COUNT(*) as c FROM domains WHERE is_blocked=1').c,
      inactive: db.get('SELECT COUNT(*) as c FROM domains WHERE is_active=0').c,
      totalRedirects: db.get('SELECT COUNT(*) as c FROM redirect_logs').c,
      todayRedirects: db.get("SELECT COUNT(*) as c FROM redirect_logs WHERE date(created_at)=date('now')").c,
    };
  },
  getStatsByGroup() {
    const groups = this.getAllGroups();
    return groups.map(g => ({
      group: g.group_name,
      total: db.get('SELECT COUNT(*) as c FROM domains WHERE group_name=?', [g.group_name]).c,
      active: db.get('SELECT COUNT(*) as c FROM domains WHERE group_name=? AND is_active=1 AND is_blocked=0', [g.group_name]).c,
      blocked: db.get('SELECT COUNT(*) as c FROM domains WHERE group_name=? AND is_blocked=1', [g.group_name]).c,
    }));
  },
  logRedirect(url, userAgent, ip) {
    db.run('INSERT INTO redirect_logs(redirected_to,user_agent,ip_address) VALUES(?,?,?)', [url, userAgent, ip]);
  },
  getById(id) {
    return db.get('SELECT * FROM domains WHERE id=?', [parseInt(id)]);
  }
};

module.exports = Domain;
