const cron = require('node-cron');
const { checkAllDomainsIndiwtf } = require('./indiwtf');
const { refreshBlocklist } = require('./trustpositif');
const { sendDomainReport } = require('./telegram');
const Domain = require('../models/domain');

let healthCheckJob = null;
let reportJob = null;
let trustpositifJob = null;

async function runHealthCheck() {
  try {
    console.log('🔍 Running indiwtf health check...');
    await checkAllDomainsIndiwtf();
  } catch (err) {
    console.error('❌ Health check error:', err.message);
  }
}

function startSchedulers() {
  const healthInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30');
  const reportInterval = parseInt(process.env.REPORT_INTERVAL || '4');

  // Health check setiap X menit
  healthCheckJob = cron.schedule(`*/${healthInterval} * * * *`, () => {
    console.log(`⏰ [CRON] Health check jalan...`);
    runHealthCheck();
  });

  // Refresh TrustPositif blocklist tiap 6 jam
  trustpositifJob = cron.schedule('0 */6 * * *', () => {
    console.log('🔄 [CRON] Refresh TrustPositif blocklist...');
    refreshBlocklist();
  });

  // Report Telegram setiap X jam
  const hours = [];
  for (let h = 0; h < 24; h += reportInterval) {
    hours.push((h - 7 + 24) % 24);
  }
  reportJob = cron.schedule(`0 ${hours.join(',')} * * *`, () => {
    console.log(`📤 [CRON] Kirim report Telegram...`);
    sendDomainReport();
  });

  console.log(`✅ Scheduler aktif:`);
  console.log(`   - Health check: setiap ${healthInterval} menit [TrustPositif + indiwtf]`);
  console.log(`   - TrustPositif refresh: setiap 6 jam`);
  console.log(`   - Report Telegram: setiap ${reportInterval} jam`);

  // Download TrustPositif blocklist saat startup
  setTimeout(async () => {
    console.log('📥 Download TrustPositif blocklist...');
    await refreshBlocklist();
    console.log('🚀 Initial health check...');
    runHealthCheck();
  }, 5000);
}

function stopSchedulers() {
  if (healthCheckJob) healthCheckJob.stop();
  if (reportJob) reportJob.stop();
  if (trustpositifJob) trustpositifJob.stop();
  console.log('⏹️  Schedulers stopped');
}

module.exports = { startSchedulers, stopSchedulers, runHealthCheck };
