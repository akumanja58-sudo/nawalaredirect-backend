const axios = require('axios');
const Domain = require('../models/domain');
const { notifyDomainBlocked, notifyAllDomainsDown } = require('./telegram');
const { checkDomainTrustPositif, checkDomainsBatch } = require('./trustpositif');

const INDIWTF_TOKEN = process.env.INDIWTF_TOKEN;
const BASE_URL = 'https://indiwtf.com/api';

async function checkDomainIndiwtf(domain) {
  if (!INDIWTF_TOKEN) return null;
  try {
    const cleanDomain = domain.url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
    const res = await axios.get(`${BASE_URL}/check`, { params: { domain: cleanDomain, token: INDIWTF_TOKEN }, timeout: 15000 });
    return { domain: cleanDomain, ...res.data };
  } catch (err) { console.error(`❌ Indiwtf error for ${domain.url}:`, err.message); return null; }
}

async function checkDomainFull(domain) {
  console.log(`🔍 [CHECK] ${domain.url}`);
  const isTrustPositif = await checkDomainTrustPositif(domain.url);
  if (isTrustPositif) {
    console.log(`🚫 [TRUSTPOSITIF] ${domain.url} NAWALA!`);
    const wasBlocked = domain.is_blocked === 1;
    await Domain.updateHealthCheck(domain.id, { isBlocked: true, statusCode: 403, responseTime: null, error: null, forceBlocked: true });
    if (!wasBlocked) await notifyDomainBlocked(domain);
    return { source: 'trustpositif', status: 'blocked', isBlocked: true };
  }
  console.log(`✅ [TRUSTPOSITIF] ${domain.url} aman, double cek indiwtf...`);
  const result = await checkDomainIndiwtf(domain);
  if (!result) return { source: 'trustpositif', status: 'allowed', isBlocked: false };
  const isBlocked = result.status === 'blocked';
  const wasBlocked = domain.is_blocked === 1;
  await Domain.updateHealthCheck(domain.id, { isBlocked, statusCode: isBlocked ? 403 : 200, responseTime: null, error: null, forceBlocked: true });
  if (isBlocked && !wasBlocked) await notifyDomainBlocked(domain);
  return { source: 'indiwtf', status: result.status, isBlocked };
}

async function checkAllDomainsIndiwtf() {
  const allDomains = await Domain.getAll(); // await karena PostgreSQL async
  const domains = allDomains.filter(d => d.is_active === 1);
  if (!domains.length) return [];
  console.log(`🔍 [HEALTH CHECK] ${domains.length} domains...`);

  const tpResults = await checkDomainsBatch(domains.map(d => d.url));
  const results = [], needIndiwtf = [];

  for (const domain of domains) {
    const clean = domain.url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0].toLowerCase();
    if (tpResults.get(clean) === true) {
      console.log(`🚫 [TRUSTPOSITIF] ${domain.url} nawala!`);
      const wasBlocked = domain.is_blocked === 1;
      await Domain.updateHealthCheck(domain.id, { isBlocked: true, statusCode: 403, responseTime: null, error: null, forceBlocked: true });
      if (!wasBlocked) await notifyDomainBlocked(domain);
      results.push({ ...domain, isBlocked: true, source: 'trustpositif' });
    } else {
      needIndiwtf.push(domain);
    }
  }

  if (INDIWTF_TOKEN && needIndiwtf.length) {
    for (const domain of needIndiwtf) {
      const result = await checkDomainIndiwtf(domain);
      if (!result) { results.push({ ...domain, isBlocked: false, source: 'trustpositif' }); continue; }
      const isBlocked = result.status === 'blocked';
      const wasBlocked = domain.is_blocked === 1;
      await Domain.updateHealthCheck(domain.id, { isBlocked, statusCode: isBlocked ? 403 : 200, responseTime: null, error: null, forceBlocked: true });
      if (isBlocked && !wasBlocked) await notifyDomainBlocked(domain);
      results.push({ ...domain, isBlocked, source: 'indiwtf' });
      await new Promise(r => setTimeout(r, 800));
    }
  } else {
    for (const domain of needIndiwtf) {
      await Domain.updateHealthCheck(domain.id, { isBlocked: false, statusCode: 200, responseTime: null, error: null, forceBlocked: false });
      results.push({ ...domain, isBlocked: false, source: 'trustpositif' });
    }
  }

  const activeList = await Domain.getActive();
  if (activeList.length === 0 && domains.length > 0) await notifyAllDomainsDown();
  const blocked = results.filter(r => r.isBlocked).length;
  console.log(`✅ [HEALTH CHECK] Selesai: ${results.length - blocked} OK | ${blocked} Blocked`);
  return results;
}

module.exports = { checkDomainIndiwtf, checkDomainFull, checkAllDomainsIndiwtf };
