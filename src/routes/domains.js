const express = require('express');
const Domain = require('../models/domain');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkDomain } = require('../services/healthCheck');

const router = express.Router();

// GET /api/domains — semua domain (butuh auth)
router.get('/', authMiddleware, (req, res) => {
  try {
    const domains = Domain.getAll();
    const stats = Domain.getStats();
    res.json({ success: true, data: domains, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/domains/active — domain aktif (public, untuk redirect)
router.get('/active', (req, res) => {
  try {
    const domains = Domain.getActive();
    res.json({ success: true, data: domains });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/domains/stats — statistik
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const stats = Domain.getStats();

    // Redirect 7 hari terakhir
    const recentRedirects = db.all(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM redirect_logs
      WHERE created_at >= date('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `);

    res.json({ success: true, stats, recentRedirects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/domains — tambah domain (butuh auth)
router.post('/', authMiddleware, async (req, res) => {
  try {
    let { url, label } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL wajib diisi' });
    }

    url = url.trim();
    const result = Domain.add(url, label?.trim() || '');
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Langsung health check domain baru (async, non-blocking)
    // Ambil berdasarkan URL karena lastInsertRowid di sql.js bisa 0
    const newDomain = db.get('SELECT * FROM domains WHERE url=?', [url]);
    if (newDomain) checkDomain(newDomain).catch(console.error);

    res.status(201).json({ success: true, id: result.id, message: 'Domain berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/domains/:id — update domain
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { url, label, is_active, is_blocked } = req.body;
    
    const result = Domain.update(id, { url, label, is_active, is_blocked });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/domains/:id — hapus domain
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    Domain.delete(id);
    res.json({ success: true, message: 'Domain dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/domains/:id/check — manual health check 1 domain
router.post('/:id/check', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const domain = Domain.getById(id);
    
    if (!domain) {
      return res.status(404).json({ success: false, error: 'Domain tidak ditemukan' });
    }

    const result = await checkDomain(domain);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/domains/check-all — manual health check semua domain
router.post('/check-all', authMiddleware, async (req, res) => {
  try {
    const { checkAllDomains } = require('../services/healthCheck');
    const results = await checkAllDomains();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

// POST /api/domains/:id/check-isp — cek per ISP pakai indiwtf
router.post('/:id/check-isp', authMiddleware, async (req, res) => {
  try {
    const domain = Domain.getById(req.params.id);
    if (!domain) return res.status(404).json({ success: false, error: 'Domain tidak ditemukan' });
    
    const { checkDomainIndiwtf, checkDomainPerISP } = require('../services/indiwtf');
    const [general, ispResults] = await Promise.all([
      checkDomainIndiwtf(domain),
      checkDomainPerISP(domain.url),
    ]);

    // Simpan isp_status ke DB
    db.run('UPDATE domains SET isp_status=?, updated_at=datetime(\'now\') WHERE id=?',
      [JSON.stringify(ispResults), parseInt(req.params.id)]);

    res.json({ success: true, general, ispResults });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/domains/check-all-isp — cek semua domain via indiwtf
router.post('/check-all-isp', authMiddleware, async (req, res) => {
  try {
    const { checkAllDomainsIndiwtf } = require('../services/indiwtf');
    const results = await checkAllDomainsIndiwtf();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/domains/:id/path — set redirect path untuk domain
router.put('/:id/path', authMiddleware, (req, res) => {
  try {
    const { path } = req.body;
    db.run('UPDATE domains SET redirect_path=?, updated_at=datetime(\'now\') WHERE id=?',
      [path || '', parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
