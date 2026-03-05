const axios = require('axios');
const Domain = require('../models/domain');
const { notifyDomainBlocked, notifyAllDomainsDown, sendMessage } = require('./telegram');

const INDIWTF_TOKEN = process.env.INDIWTF_TOKEN;
const BASE_URL = 'https://indiwtf.com/api';

// ISP list yang mau dicek
const ISP_LIST = ['telkomsel', 'indihome', 'xl', 'im3', 'tri', 'smartfren'];

/**
 * Cek 1 domain ke indiwtf API (general check)
 */
async function checkDomainIndiwtf(domain) {
  if (!INDIWTF_TOKEN) {
    console.log('⚠️  INDIWTF_TOKEN tidak diset, skip indiwtf check');
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
 * Cek 1 domain per ISP (Telkomsel, Indihome, XL, dll)
 */
async function checkDomainPerISP(domainUrl) {
  if (!INDIWTF_TOKEN) return {};

  const cleanDomain = domainUrl
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/')[0];

  const results = {};

  // Cek semua ISP concurrent
  await Promise.all(ISP_LIST.map(async (isp) => {
    try {
      const res = await axios.get(`https://indiwtf.com/${isp}/${cleanDomain}`, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      // Parse dari HTML response kalau tidak ada JSON endpoint per ISP
      const html = typeof res.data === 'string' ? res.data : '';
      const blocked = html.toLowerCase().includes('blocked') || html.toLowerCase().includes('diblokir');
      results[isp] = blocked ? 'blocked' : 'ok';
    } catch {
      results[isp] = 'error';
    }
  }));

  return results;
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
  const db = require('../models/database');

  for (const domain of domains) {
    const result = await checkDomainIndiwtf(domain);
    if (!result) continue;

    const isBlocked = result.status === 'blocked';
    const wasBlocked = domain.is_blocked === 1;

    // Update DB
    Domain.updateHealthCheck(domain.id, {
      forceBlocked: true,
      isBlocked,
      statusCode: isBlocked ? 403 : 200,
      responseTime: null,
      error: isBlocked ? 'Blocked by Kominfo (indiwtf)' : null,
    });

    // Simpan detail ISP ke DB
    if (result.isp_status) {
      db.run(
        `UPDATE domains SET isp_status=?, updated_at=datetime('now') WHERE id=?`,
        [JSON.stringify(result.isp_status), domain.id]
      );
    }

    results.push({ ...domain, indiwtf: result, isBlocked });

    // Kirim notif kalau baru diblokir
    if (isBlocked && !wasBlocked) {
      await notifyDomainBlocked({ ...domain, indiwtf: result });
    }

    // Jeda antar request supaya tidak kena rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  // Cek apakah semua domain down
  const activeCount = Domain.getActive().length;
  if (activeCount === 0 && domains.length > 0) {
    await notifyAllDomainsDown();
  }

  console.log(`✅ [INDIWTF] Check selesai: ${results.filter(r => !r.isBlocked).length} OK | ${results.filter(r => r.isBlocked).length} Blocked`);
  return results;
}

/**
 * Kirim report ISP detail ke Telegram
 */
async function sendISPReport(domainUrl, ispResults) {
  const cleanDomain = domainUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const ispIcons = { telkomsel: '🔴', indihome: '🟠', xl: '🔵', im3: '🟡', tri: '🟣', smartfren: '⚫' };

  let msg = `📡 <b>ISP CHECK REPORT</b>\n`;
  msg += `🌐 ${cleanDomain}\n`;
  msg += `${'─'.repeat(28)}\n`;

  for (const [isp, status] of Object.entries(ispResults)) {
    const icon = ispIcons[isp] || '⚪';
    const statusText = status === 'blocked' ? '🚫 BLOCKED' : status === 'ok' ? '✅ OK' : '⚠️ ERROR';
    msg += `${icon} ${isp.toUpperCase().padEnd(12)} ${statusText}\n`;
  }

  await sendMessage(msg);
}

module.exports = {
  checkDomainIndiwtf,
  checkDomainPerISP,
  checkAllDomainsIndiwtf,
  sendISPReport,
};
