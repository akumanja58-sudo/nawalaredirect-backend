const express = require('express');
const Domain = require('../models/domain');
const { checkDomain } = require('../services/healthCheck');
const { checkAllDomains } = require('../services/healthCheck');
const authMiddleware = require('../middleware/auth');
const db = require('../models/database');

const router = express.Router();

// GET /api/domains — semua domain
router.get('/', authMiddleware, (req, res) => {
  try {
    const { group } = req.query;
    const data = group ? Domain.getByGroup(group) : Domain.getAll();
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/domains/stats
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const stats = Domain.getStats();
    const groupStats = Domain.getStatsByGroup();
    res.json({ success: true, stats, groupStats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/domains/groups — list semua group
router.get('/groups', authMiddleware, (req, res) => {
  try {
    const groups = Domain.getAllGroups();
    res.json({ success: true, groups: groups.map(g => g.group_name) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/domains/active
router.get('/active', (req, res) => {
  try {
    const { group } = req.query;
    const data = group ? Domain.getActiveByGroup(group) : Domain.getActive();
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains — tambah domain
router.post('/', authMiddleware, (req, res) => {
  try {
    const { url, label, group_name } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL wajib diisi' });
    const result = Domain.add(url, label || '', group_name || '');
    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, id: result.id });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/domains/:id — update domain
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const result = Domain.update(req.params.id, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/domains/:id
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    Domain.delete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/:id/check — manual check 1 domain
router.post('/:id/check', authMiddleware, async (req, res) => {
  try {
    const domain = Domain.getById(req.params.id);
    if (!domain) return res.status(404).json({ success: false, error: 'Domain tidak ditemukan' });
    const result = await checkDomain(domain);
    res.json({ success: true, result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/check-all
router.post('/check-all', authMiddleware, async (req, res) => {
  try {
    await checkAllDomains();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/:id/check-isp
router.post('/:id/check-isp', authMiddleware, async (req, res) => {
  try {
    const domain = Domain.getById(req.params.id);
    if (!domain) return res.status(404).json({ success: false, error: 'Domain tidak ditemukan' });
    const { checkDomainIndiwtf } = require('../services/indiwtf');
    const general = await checkDomainIndiwtf(domain);
    db.run('UPDATE domains SET isp_status=?, updated_at=datetime(\'now\') WHERE id=?',
      [JSON.stringify(general?.isp_results || {}), parseInt(req.params.id)]);
    res.json({ success: true, general });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/check-all-isp
router.post('/check-all-isp', authMiddleware, async (req, res) => {
  try {
    const { checkAllDomainsIndiwtf } = require('../services/indiwtf');
    const results = await checkAllDomainsIndiwtf();
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/domains/:id/path
router.put('/:id/path', authMiddleware, (req, res) => {
  try {
    const { path } = req.body;
    db.run('UPDATE domains SET redirect_path=?, updated_at=datetime(\'now\') WHERE id=?',
      [path || '', parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/domains/:id/group — set group domain
router.put('/:id/group', authMiddleware, (req, res) => {
  try {
    const { group_name } = req.body;
    Domain.update(req.params.id, { group_name: group_name || '' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
