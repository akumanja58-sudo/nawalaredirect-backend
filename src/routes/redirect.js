const express = require('express');
const Domain = require('../models/domain');

const router = express.Router();

function buildMaintenancePage(group = '') {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Maintenance</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace;background:#080b08;color:#c8ffc8;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.box{max-width:400px;padding:2rem}h2{color:#00ff41;margin-bottom:1rem;font-size:1.2rem;letter-spacing:3px}p{color:#5a8a5a;font-size:.85rem;line-height:1.8}.dot{animation:blink 1.4s infinite}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}@keyframes blink{0%,80%,100%{opacity:0}40%{opacity:1}}</style>
</head><body><div class="box"><h2>// MAINTENANCE</h2><p>Layanan${group ? ' <b>' + group.toUpperCase() + '</b>' : ''} sedang dalam pemeliharaan<br>Coba beberapa saat lagi<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></p></div></body></html>`;
}

async function doRedirect(req, res, domain) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
  await Domain.logRedirect(domain.url, userAgent, ip);
  res.redirect(302, domain.url);
}

router.get('/:path', async (req, res, next) => {
  const { path } = req.params;
  if (['health', 'api', 'favicon.ico'].includes(path)) return next();
  try {
    const groupDomain = await Domain.getTargetByGroup(path);
    if (groupDomain) return doRedirect(req, res, groupDomain);

    const groupDomains = await Domain.getByGroup(path);
    if (groupDomains.length > 0) return res.status(503).send(buildMaintenancePage(path));

    if (['go', 'l', 'r', 'link'].includes(path)) {
      const domain = await Domain.getTarget();
      if (!domain) return res.status(503).send(buildMaintenancePage());
      return doRedirect(req, res, domain);
    }
    next();
  } catch (err) {
    console.error('Redirect error:', err.message);
    next();
  }
});

router.get('/', async (req, res) => {
  if (req.query.go || req.query.r || req.query.link) {
    try {
      const domain = await Domain.getTarget();
      if (!domain) return res.status(503).send(buildMaintenancePage());
      return doRedirect(req, res, domain);
    } catch { return res.status(503).send(buildMaintenancePage()); }
  }
  res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>404</title><style>body{font-family:monospace;background:#080b08;color:#2d4d2d;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head><body>404</body></html>`);
});

module.exports = router;
