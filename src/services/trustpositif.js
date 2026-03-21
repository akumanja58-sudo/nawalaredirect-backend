const axios = require('axios');

const TRUSTPOSITIF_API = 'https://nawalacekmeriahgroup.com/check-truthpositif';

/**
 * Cek 1 domain via nawalacekmeriahgroup API
 * Return: true = nawala/IPOS, false = aman
 */
async function checkDomainTrustPositif(domainUrl) {
  const clean = domainUrl
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .toLowerCase();

  try {
    const res = await axios.get(TRUSTPOSITIF_API, {
      params: { domain: clean },
      timeout: 15000,
    });

    if (res.data?.data && Array.isArray(res.data.data)) {
      const result = res.data.data.find(item => item.domain.trim().toLowerCase() === clean);
      if (result) {
        const isBlocked = result.status !== 'Tidak Ada';
        console.log(`🔍 [TRUSTPOSITIF] ${clean} → ${result.status} (${isBlocked ? 'NAWALA' : 'AMAN'})`);
        return isBlocked;
      }
    }

    console.log(`⚠️  [TRUSTPOSITIF] Tidak ada hasil untuk ${clean}`);
    return false;
  } catch (err) {
    console.error(`❌ [TRUSTPOSITIF] Gagal cek ${clean}: ${err.message}`);
    return false; // kalau error, anggap aman → lanjut ke indiwtf
  }
}

/**
 * Cek batch domain sekaligus (untuk health check)
 * Return: Map { domain -> isBlocked }
 */
async function checkDomainsBatch(domainUrls) {
  const cleans = domainUrls.map(url =>
    url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0].toLowerCase()
  );

  const domainsParam = cleans.join('%0D%0A');

  try {
    const res = await axios.get(`${TRUSTPOSITIF_API}?domain=${domainsParam}`, {
      timeout: 30000,
    });

    const resultMap = new Map();

    if (res.data?.data && Array.isArray(res.data.data)) {
      res.data.data.forEach(item => {
        const isBlocked = item.status !== 'Tidak Ada';
        resultMap.set(item.domain.trim().toLowerCase(), isBlocked);
      });
    }

    return resultMap;
  } catch (err) {
    console.error(`❌ [TRUSTPOSITIF] Batch check gagal: ${err.message}`);
    return new Map(); // kosong = semua dianggap aman → lanjut indiwtf
  }
}

// Dummy untuk kompatibilitas scheduler lama
async function refreshBlocklist() {
  console.log('ℹ️  [TRUSTPOSITIF] Menggunakan API nawalacekmeriahgroup.com (no cache needed)');
  return 0;
}

function getCacheInfo() {
  return { source: 'nawalacekmeriahgroup.com API', realtime: true };
}

module.exports = { checkDomainTrustPositif, checkDomainsBatch, refreshBlocklist, getCacheInfo };
