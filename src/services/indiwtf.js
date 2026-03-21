const axios = require('axios');
const Domain = require('../models/domain');
const { notifyDomainBlocked, notifyAllDomainsDown } = require('./telegram');
const { checkDomainTrustPositif, checkDomainsBatch } = require('./trustpositif');

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
 * Flow: TrustPositif API dulu → kalau nawala langsung done → kalau aman → indiwtf
 */
async function checkDomainFull(domain) {
  console.log(`🔍 [CHECK] ${domain.url}`);

  // Step 1: TrustPositif API (realtime dari nawalacekmeriahgroup.com)
  const isTrustPositif = await checkDomainTrustPositif(domain.url);
  if (isTrustPositif) {
    console.log(`🚫 [TRUSTPOSITIF] ${domain.url} NAWALA! Skip indiwtf.`);
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
  if (!result) {
    // indiwtf error/tidak ada token → percaya TrustPositif, anggap aman
    return { source: 'trustpositif', status: 'allowed', isBlocked: false };
  }

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
 * Pakai batch check TrustPositif dulu, yang aman baru ke indiwtf satu-satu
 */
async function checkAllDomainsIndiwtf() {
  const domains = Domain.getAll().filter(d => d.is_active === 1);
  if (!domains.length) return [];

  console.log(`🔍 [HEALTH CHECK] ${domains.length} domains...`);

  // Step 1: Batch check semua domain ke TrustPositif sekaligus
  const urls = domains.map(d => d.url);
  const tpResults = await checkDomainsBatch(urls);

  const results = [];
  const needIndiwtf = []; // domain yang lolos TrustPositif → perlu double cek

  for (const domain of domains) {
    const clean = domain.url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0].toLowerCase();
    const isBlockedTP = tpResults.get(clean);

    if (isBlockedTP === true) {
      console.log(`🚫 [TRUSTPOSITIF] ${domain.url} nawala!`);
      const wasBlocked = domain.is_blocked === 1;
      Domain.updateHealthCheck(domain.id, {
        isBlocked: true, statusCode: 403, responseTime: null, error: null, forceBlocked: true,
      });
      if (!wasBlocked) await notifyDomainBlocked(domain);
      results.push({ ...domain, isBlocked: true, source: 'trustpositif' });
    } else {
      needIndiwtf.push(domain);
    }
  }

  // Step 2: indiwtf untuk yang lolos TrustPositif
  if (INDIWTF_TOKEN && needIndiwtf.length) {
    console.log(`🔍 [INDIWTF] Double cek ${needIndiwtf.length} domain...`);
    for (const domain of needIndiwtf) {
      const result = await checkDomainIndiwtf(domain);
      if (!result) { results.push({ ...domain, isBlocked: false, source: 'trustpositif' }); continue; }

      const isBlocked = result.status === 'blocked';
      const wasBlocked = domain.is_blocked === 1;

      Domain.updateHealthCheck(domain.id, {
        isBlocked, statusCode: isBlocked ? 403 : 200, responseTime: null, error: null, forceBlocked: true,
      });

      if (isBlocked && !wasBlocked) await notifyDomainBlocked(domain);
      results.push({ ...domain, isBlocked, source: 'indiwtf' });

      await new Promise(r => setTimeout(r, 800));
    }
  } else {
    // Tandai semua yang lolos TrustPositif sebagai aman
    for (const domain of needIndiwtf) {
      Domain.updateHealthCheck(domain.id, {
        isBlocked: false, statusCode: 200, responseTime: null, error: null, forceBlocked: false,
      });
      results.push({ ...domain, isBlocked: false, source: 'trustpositif' });
    }
  }

  const activeCount = Domain.getActive().length;
  if (activeCount === 0 && domains.length > 0) await notifyAllDomainsDown();

  const blocked = results.filter(r => r.isBlocked).length;
  console.log(`✅ [HEALTH CHECK] Selesai: ${results.length - blocked} OK | ${blocked} Blocked`);
  return results;
}

module.exports = { checkDomainIndiwtf, checkDomainFull, checkAllDomainsIndiwtf };
