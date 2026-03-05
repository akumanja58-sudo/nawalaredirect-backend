const cron = require('node-cron');
const { checkAllDomains } = require('./healthCheck');
const { checkAllDomainsIndiwtf } = require('./indiwtf');
const { sendDomainReport } = require('./telegram');
const Domain = require('../models/domain');

let jobs = [];
let previousBlockedIds = new Set();

async function runHealthCheck() {
  try {
    // Kalau ada INDIWTF_TOKEN, pakai indiwtf. Kalau tidak, fallback ke basic check
    if (process.env.INDIWTF_TOKEN) {
      console.log('🔍 Running indiwtf health check...');
      await checkAllDomainsIndiwtf();
    } else {
      console.log('🔍 Running basic health check...');
      await checkAllDomains();
    }
  } catch (err) {
    console.error('❌ Health check error:', err.message);
  }
}

function startSchedulers() {
  const healthInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30');
  const reportInterval = parseInt(process.env.REPORT_INTERVAL || '4');

  // Health check setiap X menit
  jobs.push(cron.schedule(`*/${healthInterval} * * * *`, () => {
    console.log(`⏰ [CRON] Health check...`);
    runHealthCheck();
  }));

  // Report Telegram setiap X jam
  const hours = [];
  for (let h = 0; h < 24; h += reportInterval) {
    hours.push((h - 7 + 24) % 24);
  }
  jobs.push(cron.schedule(`0 ${hours.join(',')} * * *`, () => {
    console.log(`📤 [CRON] Kirim report...`);
    sendDomainReport();
  }));

  const mode = process.env.INDIWTF_TOKEN ? 'indiwtf (Indonesia-accurate)' : 'basic';
  console.log(`✅ Scheduler aktif:`);
  console.log(`   - Health check: setiap ${healthInterval} menit [${mode}]`);
  console.log(`   - Report Telegram: setiap ${reportInterval} jam`);

  // Initial check setelah 5 detik
  setTimeout(() => {
    console.log('🚀 Initial health check...');
    runHealthCheck();
  }, 5000);
}

function stopSchedulers() {
  jobs.forEach(j => j.stop());
  jobs = [];
}

module.exports = { startSchedulers, stopSchedulers, runHealthCheck };
