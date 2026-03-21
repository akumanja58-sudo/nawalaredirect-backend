const axios = require('axios');

const TRUSTPOSITIF_URLS = [
  'https://raw.githubusercontent.com/alsyundawy/TrustPositif/refs/heads/main/gambling_indonesia_domainonly.txt',
  'https://raw.githubusercontent.com/alsyundawy/TrustPositif/refs/heads/main/anti.piracy-onlydomains.txt',
];

let blockedDomains = new Set();
let lastUpdated = null;
const CACHE_TTL = 6 * 60 * 60 * 1000; // refresh tiap 6 jam

async function refreshBlocklist() {
  console.log('🔄 [TRUSTPOSITIF] Mengunduh blocklist...');
  const newSet = new Set();

  for (const url of TRUSTPOSITIF_URLS) {
    try {
      const res = await axios.get(url, { timeout: 30000, responseType: 'text' });
      const lines = res.data.split('\n');
      for (const line of lines) {
        const clean = line.trim().toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, '')
          .replace(/^\*\./, '');
        if (clean && !clean.startsWith('#') && clean.includes('.')) {
          newSet.add(clean);
        }
      }
      console.log(`✅ [TRUSTPOSITIF] ${url.split('/').pop()}: ${newSet.size} domain`);
    } catch (err) {
      console.error(`❌ [TRUSTPOSITIF] Gagal download ${url}: ${err.message}`);
    }
  }

  if (newSet.size > 0) {
    blockedDomains = newSet;
    lastUpdated = Date.now();
    console.log(`✅ [TRUSTPOSITIF] Total ${blockedDomains.size} domain diblokir`);
  }

  return blockedDomains.size;
}

async function ensureFresh() {
  if (!lastUpdated || Date.now() - lastUpdated > CACHE_TTL) {
    await refreshBlocklist();
  }
}

async function checkDomainTrustPositif(domainUrl) {
  await ensureFresh();

  const clean = domainUrl
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .toLowerCase();

  if (blockedDomains.has(clean)) return true;

  const parts = clean.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (blockedDomains.has(parent)) return true;
  }

  return false;
}

function getCacheInfo() {
  return {
    total: blockedDomains.size,
    lastUpdated: lastUpdated ? new Date(lastUpdated).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : null,
  };
}

module.exports = { refreshBlocklist, checkDomainTrustPositif, getCacheInfo };
