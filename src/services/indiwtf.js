const axios = require('axios');
const Domain = require('../models/domain');
const { notifyDomainBlocked, notifyAllDomainsDown } = require('./telegram');

const INDIWTF_TOKEN = process.env.INDIWTF_TOKEN;
const BASE_URL = 'https://indiwtf.com/api';

/**
 * Cek 1 domain ke indiwtf API
 */
async function checkDomainIndiwtf(domain) {
  if (!INDIWTF_TOKEN) {
    console.log('⚠️  INDIWTF_TOKEN tidak diset');
    return null;
  }

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
 * Health check semua domain pakai indiwtf API
 */
async function checkAllDomainsIndiwtf() {
  if (!INDIWTF_TOKEN) {
    console.log('⚠️  INDIWTF_TOKEN tidak diset, skip indiwtf check');
    return [];
  }

  const domains = Domain.getAll().filter(d => d.is_active === 1);
  if (!domains.length) return [];

  console.log(`🔍 [INDIWTF] Checking ${domains.length} domains...`);
  const results = [];

  for (const domain of domains) {
    const result = await checkDomainIndiwtf(domain);
    if (!result) continue;

    const isBlocked = result.status === 'blocked';
    const wasBlocked = domain.is_blocked === 1;

    Domain.updateHealthCheck(domain.id, {
      isBlocked,
      statusCode: isBlocked ? 403 : 200,
      responseTime: null,
      error: null,
      forceBlocked: true,
    });

    results.push({ ...domain, indiwtf: result, isBlocked });

    if (isBlocked && !wasBlocked) {
      await notifyDomainBlocked({ ...domain, indiwtf: result });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  const activeCount = Domain.getActive().length;
  if (activeCount === 0 && domains.length > 0) {
    await notifyAllDomainsDown();
  }

  console.log(`✅ [INDIWTF] Selesai: ${results.filter(r => !r.isBlocked).length} OK | ${results.filter(r => r.isBlocked).length} Blocked`);
  return results;
}

module.exports = {
  checkDomainIndiwtf,
  checkAllDomainsIndiwtf,
};
