const axios = require('axios');
const Domain = require('../models/domain');
const { notifyDomainBlocked, notifyAllDomainsDown } = require('./telegram');
const { checkDomainTrustPositif } = require('./trustpositif');

const INDIWTF_TOKEN = process.env.INDIWTF_TOKEN;
const BASE_URL = 'https://indiwtf.com/api';

async function checkDomainIndiwtf(domain) {
  if (!INDIWTF_TOKEN) return null;
  try {
    const cleanDomain = domain.url
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('/')[0];

    const res = await axios.get(`${BASE_URL}/check`, {
      params: { domain: cleanDomain, token: INDIWTF_TOKEN },
      timeout: 15000,
    });
    return { domain: cleanDomain, ...res.data };
  } catch (err) {
    console.error(`❌ Indiwtf check error for ${domain.url}:`, err.message);
    return null;
  }
}

/**
 * Cek 1 domain via tombol 🇮🇩 di dashboard
 * Flow: TrustPositif dulu → kalau nawala langsung done → kalau aman → indiwtf
 */
async function checkDomainFull(domain) {
  console.log(`🔍 [CHECK] ${domain.url}`);

  // Step 1: TrustPositif (gratis, cepat)
  const isTrustPositif = await checkDomainTrustPositif(domain.url);
  if (isTrustPositif) {
    console.log(`🚫 [TRUSTPOSITIF] ${domain.url} ada di blocklist!`);
    const wasBlocked = domain.is_blocked === 1;
    Domain.updateHealthCheck(domain.id, {
      isBlocked: true, statusCode: 403, responseTime: null, error: null, forceBlocked: true,
    });
    if (!wasBlocked) await notifyDomainBlocked(domain);
    return { source: 'trustpositif', status: 'blocked', isBlocked: true };
  }

  console.log(`✅ [TRUSTPOSITIF] ${domain.url} aman, double cek ke indiwtf...`);

  // Step 2: indiwtf (konfirmasi)
  const result = await checkDomainIndiwtf(domain);
  if (!result) return { source: 'indiwtf', status: 'error', isBlocked: false };

  const isBlocked = result.status === 'blocked';
  const wasBlocked = domain.is_blocked === 1;

  Domain.updateHealthCheck(domain.id, {
    isBlocked, statusCode: isBlocked ? 403 : 200, responseTime: null, error: null, forceBlocked: true,
  });

  if (isBlocked && !wasBlocked) await notifyDomainBlocked(domain);

  return { source: 'indiwtf', status: result.status, isBlocked };
}

/**
 * Health check otomatis semua domain (scheduler)
 * Flow sama: TrustPositif dulu → kalau aman → indiwtf
 */
async function checkAllDomainsIndiwtf() {
  const domains = Domain.getAll().filter(d => d.is_active === 1);
  if (!domains.length) return [];

  console.log(`🔍 [HEALTH CHECK] ${domains.length} domains...`);
  const results = [];

  for (const domain of domains) {
    // Step 1: TrustPositif
    const isTrustPositif = await checkDomainTrustPositif(domain.url);
    if (isTrustPositif) {
      console.log(`🚫 [TRUSTPOSITIF] ${domain.url} nawala!`);
      const wasBlocked = domain.is_blocked === 1;
      Domain.updateHealthCheck(domain.id, {
        isBlocked: true, statusCode: 403, responseTime: null, error: null, forceBlocked: true,
      });
      if (!wasBlocked) await notifyDomainBlocked(domain);
      results.push({ ...domain, isBlocked: true, source: 'trustpositif' });
      continue;
    }

    // Step 2: indiwtf (hanya kalau aman di TrustPositif)
    if (!INDIWTF_TOKEN) continue;
    const result = await checkDomainIndiwtf(domain);
    if (!result) continue;

    const isBlocked = result.status === 'blocked';
    const wasBlocked = domain.is_blocked === 1;

    Domain.updateHealthCheck(domain.id, {
      isBlocked, statusCode: isBlocked ? 403 : 200, responseTime: null, error: null, forceBlocked: true,
    });

    if (isBlocked && !wasBlocked) await notifyDomainBlocked(domain);
    results.push({ ...domain, isBlocked, source: 'indiwtf' });

    await new Promise(r => setTimeout(r, 1000));
  }

  const activeCount = Domain.getActive().length;
  if (activeCount === 0 && domains.length > 0) await notifyAllDomainsDown();

  const blocked = results.filter(r => r.isBlocked).length;
  console.log(`✅ [HEALTH CHECK] Selesai: ${results.length - blocked} OK | ${blocked} Blocked`);
  return results;
}

module.exports = { checkDomainIndiwtf, checkDomainFull, checkAllDomainsIndiwtf };
