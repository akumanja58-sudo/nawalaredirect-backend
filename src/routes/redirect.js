const express = require('express');
const Domain = require('../models/domain');

const router = express.Router();

function buildMaintenancePage() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sedang Maintenance</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:monospace;background:#080b08;color:#c8ffc8;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
    .box{max-width:400px;padding:2rem}
    h2{color:#00ff41;margin-bottom:1rem;font-size:1.2rem;letter-spacing:3px}
    p{color:#5a8a5a;font-size:.85rem;line-height:1.8}
    .dot{animation:blink 1.4s infinite}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
    @keyframes blink{0%,80%,100%{opacity:0}40%{opacity:1}}
  </style>
</head>
<body>
  <div class="box">
    <h2>// MAINTENANCE</h2>
    <p>Layanan sedang dalam pemeliharaan<br>Coba beberapa saat lagi<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></p>
  </div>
</body>
</html>`;
}

// ─── Helper: log redirect ─────────────────────────────────────────────────────
function doRedirect(req, res, domain) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
  Domain.logRedirect(domain.url, userAgent, ip);
  res.redirect(302, domain.url);
}

// ─── GET /:path — redirect via subdirectory/path ─────────────────────────────
// Misal: domain-master.com/toko → redirect ke domain aktif
// domain-master.com/ → 404
router.get('/:path', (req, res, next) => {
  const { path } = req.params;

  // Skip path internal (API, health, dll)
  if (['health', 'api', 'favicon.ico'].includes(path)) return next();

  // Cari domain yang punya redirect_path matching
  const domains = Domain.getActive();
  
  // Cari domain dengan path spesifik dulu
  const matchedDomains = domains.filter(d => 
    d.redirect_path && d.redirect_path.toLowerCase() === path.toLowerCase()
  );

  // Kalau ada yang match path, redirect ke sana
  if (matchedDomains.length > 0) {
    const target = matchedDomains[Math.floor(Math.random() * matchedDomains.length)];
    return doRedirect(req, res, target);
  }

  // Kalau tidak ada yang match tapi path = 'go' atau path default, redirect random
  if (path === 'go' || path === 'l' || path === 'r' || path === 'link') {
    const domain = Domain.getRandomActive();
    if (!domain) return res.status(503).send(buildMaintenancePage());
    return doRedirect(req, res, domain);
  }

  // Path lain → 404
  next();
});

// ─── GET / — root domain: kembalikan 404 / kosong ────────────────────────────
router.get('/', (req, res) => {
  // Cek apakah ada query param ?go=1 atau ?r=1
  if (req.query.go || req.query.r || req.query.link) {
    const domain = Domain.getRandomActive();
    if (!domain) return res.status(503).send(buildMaintenancePage());
    return doRedirect(req, res, domain);
  }

  // Default: root kosong
  res.status(404).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>404</title>
<style>body{font-family:monospace;background:#080b08;color:#2d4d2d;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
</style></head><body>404</body></html>`);
});

module.exports = router;
