const axios = require('axios');
const Domain = require('../models/domain');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Kirim pesan ke Telegram
 */
async function sendMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('⚠️  Telegram tidak dikonfigurasi, skip notifikasi');
    return;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
    console.log('📤 Telegram report terkirim');
  } catch (err) {
    console.error('❌ Gagal kirim Telegram:', err.message);
  }
}

/**
 * Format report domain untuk dikirim ke Telegram
 */
async function sendDomainReport() {
  const stats = Domain.getStats();
  const domains = Domain.getAll();

  const activeDomains = domains.filter(d => d.is_active === 1 && d.is_blocked === 0);
  const blockedDomains = domains.filter(d => d.is_blocked === 1);
  const inactiveDomains = domains.filter(d => d.is_active === 0);

  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  let message = `🔔 <b>LAPORAN DOMAIN NAWALA</b>\n`;
  message += `📅 ${now} WIB\n`;
  message += `${'─'.repeat(30)}\n\n`;

  // Statistik
  message += `📊 <b>STATISTIK</b>\n`;
  message += `✅ Aktif: <b>${stats.active}</b> domain\n`;
  message += `🚫 Diblokir: <b>${stats.blocked}</b> domain\n`;
  message += `⏸️ Nonaktif: <b>${stats.inactive}</b> domain\n`;
  message += `🔄 Total redirect hari ini: <b>${stats.todayRedirects}</b>\n\n`;

  // Domain aktif
  if (activeDomains.length > 0) {
    message += `✅ <b>DOMAIN AKTIF (${activeDomains.length})</b>\n`;
    activeDomains.forEach((d, i) => {
      const label = d.label ? ` [${d.label}]` : '';
      const rt = d.response_time ? ` ${d.response_time}ms` : '';
      message += `${i + 1}. ${d.url}${label}${rt}\n`;
    });
    message += '\n';
  }

  // Domain diblokir
  if (blockedDomains.length > 0) {
    message += `🚫 <b>DOMAIN DIBLOKIR NAWALA (${blockedDomains.length})</b>\n`;
    blockedDomains.forEach((d, i) => {
      const label = d.label ? ` [${d.label}]` : '';
      const lastCheck = d.last_checked 
        ? new Date(d.last_checked).toLocaleTimeString('id-ID') 
        : '-';
      message += `${i + 1}. ${d.url}${label} (cek: ${lastCheck})\n`;
    });
    message += '\n';
  }

  if (activeDomains.length === 0) {
    message += `⚠️ <b>PERHATIAN: Semua domain tidak aktif!</b>\n`;
    message += `Segera tambahkan domain baru di dashboard.\n`;
  }

  message += `${'─'.repeat(30)}\n`;
  message += `🤖 Auto report setiap 4 jam`;

  await sendMessage(message);
}

/**
 * Notifikasi ketika domain baru diblokir
 */
async function notifyDomainBlocked(domain) {
  const label = domain.label ? ` [${domain.label}]` : '';
  const message = `🚨 <b>DOMAIN DIBLOKIR NAWALA!</b>\n\n`
    + `🌐 ${domain.url}${label}\n`
    + `⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n\n`
    + `Domain tersebut sudah dihapus dari rotasi redirect otomatis.`;
  
  await sendMessage(message);
}

/**
 * Notifikasi ketika semua domain habis
 */
async function notifyAllDomainsDown() {
  const message = `🆘 <b>DARURAT: SEMUA DOMAIN TIDAK AKTIF!</b>\n\n`
    + `Tidak ada domain yang bisa digunakan untuk redirect.\n`
    + `Segera tambahkan domain baru melalui dashboard!\n\n`
    + `⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
  
  await sendMessage(message);
}

module.exports = {
  sendMessage,
  sendDomainReport,
  notifyDomainBlocked,
  notifyAllDomainsDown,
};
