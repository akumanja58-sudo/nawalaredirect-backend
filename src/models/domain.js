const db = require('./database');

// Jalankan migration untuk kolom is_priority
try { db.run('ALTER TABLE domains ADD COLUMN is_priority INTEGER DEFAULT 0'); } catch (e) { }

const Domain = {
  getAll() {
    return db.all('SELECT * FROM domains ORDER BY group_name ASC, is_priority DESC, created_at DESC');
  },
  getByGroup(groupName) {
    return db.all('SELECT * FROM domains WHERE group_name=? ORDER BY is_priority DESC, created_at DESC', [groupName]);
  },
  getActiveByGroup(groupName) {
    return db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 AND group_name=? ORDER BY is_priority DESC, fail_count ASC', [groupName]);
  },
  getAllGroups() {
    return db.all('SELECT DISTINCT group_name FROM domains WHERE group_name IS NOT NULL AND group_name != "" ORDER BY group_name ASC');
  },
  getActive() {
    return db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 ORDER BY is_priority DESC, fail_count ASC');
  },

  // Ambil domain prioritas untuk group — kalau ada & tidak nawala
  getPriorityByGroup(groupName) {
    return db.get('SELECT * FROM domains WHERE group_name=? AND is_priority=1 AND is_active=1 AND is_blocked=0', [groupName]);
  },

  // Set domain sebagai prioritas baru untuk group (unset yang lama dulu)
  setPriority(id, groupName) {
    db.run('UPDATE domains SET is_priority=0 WHERE group_name=?', [groupName]);
    db.run("UPDATE domains SET is_priority=1, updated_at=datetime('now') WHERE id=?", [parseInt(id)]);
  },

  // Ambil domain tujuan untuk group:
  // 1. Kalau ada prioritas aktif → pakai prioritas
  // 2. Kalau prioritas nawala → pilih random dari cadangan → set cadangan itu jadi prioritas baru
  getTargetByGroup(groupName) {
    const priority = this.getPriorityByGroup(groupName);
    if (priority) return priority;

    // Cari cadangan aktif (bukan yang is_priority, karena dia nawala)
    const candidates = db.all(
      'SELECT * FROM domains WHERE group_name=? AND is_active=1 AND is_blocked=0 ORDER BY fail_count ASC',
      [groupName]
    );
    if (!candidates.length) return null;

    // Random pilih dari cadangan
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];

    // Jadikan dia prioritas baru
    this.setPriority(chosen.id, groupName);
    console.log(`🔄 [PRIORITY] Group "${groupName}" → prioritas baru: ${chosen.url}`);

    return chosen;
  },

  // Sama untuk global (tanpa group)
  getTarget() {
    const priority = db.get('SELECT * FROM domains WHERE is_priority=1 AND is_active=1 AND is_blocked=0 LIMIT 1');
    if (priority) return priority;

    const candidates = db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 ORDER BY fail_count ASC');
    if (!candidates.length) return null;

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    db.run('UPDATE domains SET is_priority=0');
    db.run("UPDATE domains SET is_priority=1, updated_at=datetime('now') WHERE id=?", [chosen.id]);

    return chosen;
  },

  add(url, label = '', groupName = '') {
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    try {
      // Cek apakah group ini sudah punya domain → kalau belum, jadikan ini prioritas
      const existing = groupName
        ? db.get('SELECT COUNT(*) as c FROM domains WHERE group_name=?', [groupName])
        : db.get('SELECT COUNT(*) as c FROM domains');
      const isPriority = (existing?.c || 0) === 0 ? 1 : 0;

      const r = db.run(
        'INSERT INTO domains (url, label, group_name, is_priority) VALUES (?, ?, ?, ?)',
        [url, label, groupName, isPriority]
      );
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
    if (data.is_priority !== undefined) { fields.push('is_priority=?'); values.push(data.is_priority ? 1 : 0); }
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
    const current = db.get('SELECT fail_count, group_name, is_priority FROM domains WHERE id=?', [id]);
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

    // Kalau domain ini adalah prioritas dan baru saja kena nawala → trigger rotate
    if (blocked === 1 && current.is_priority === 1 && current.group_name) {
      console.log(`⚠️  [PRIORITY] Prioritas group "${current.group_name}" kena nawala, auto-rotate...`);
      // Unset prioritas ini
      db.run('UPDATE domains SET is_priority=0 WHERE id=?', [id]);
      // Cari cadangan
      const candidates = db.all(
        'SELECT * FROM domains WHERE group_name=? AND is_active=1 AND is_blocked=0 AND id!=? ORDER BY fail_count ASC',
        [current.group_name, id]
      );
      if (candidates.length) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        db.run("UPDATE domains SET is_priority=1, updated_at=datetime('now') WHERE id=?", [chosen.id]);
        console.log(`✅ [PRIORITY] Auto-rotate ke: ${chosen.url}`);
      }
    }
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
  },

  // Legacy — masih dipakai scheduler
  getRandomActive() { return this.getTarget(); },
  getRandomActiveByGroup(g) { return this.getTargetByGroup(g); },
};

module.exports = Domain;
