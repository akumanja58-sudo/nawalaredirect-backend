# 🔀 Nawala Redirect Backend

Backend sistem auto redirect domain yang menghindari blokir Nawala/Internet Positif.

## Fitur
- ✅ Redirect acak ke domain aktif
- ✅ Health check otomatis setiap 30 menit
- ✅ Deteksi halaman blokir Nawala
- ✅ Notifikasi Telegram setiap 4 jam
- ✅ Alert real-time ketika domain baru diblokir
- ✅ Dashboard API lengkap dengan autentikasi JWT
- ✅ Rate limiting & CORS protection

## Stack
- Node.js + Express
- SQLite (via better-sqlite3)
- node-cron untuk scheduler
- axios untuk health check

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Konfigurasi environment
```bash
cp .env.example .env
```
Edit `.env` sesuai kebutuhan:
- `JWT_SECRET` — random string panjang untuk JWT
- `ADMIN_USERNAME` & `ADMIN_PASSWORD` — kredensial login dashboard
- `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` — untuk notifikasi

### 3. Jalankan
```bash
# Development
npm run dev

# Production
npm start
```

## Deploy ke Railway

1. Push ke GitHub
2. Buat project baru di Railway → Connect GitHub repo
3. Set environment variables di Railway dashboard
4. Railway otomatis deploy

## API Endpoints

### Public
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/` | Redirect ke domain aktif acak |
| GET | `/health` | Health check server |
| GET | `/api/domains/active` | List domain aktif |

### Protected (butuh JWT Bearer Token)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/auth/login` | Login admin |
| GET | `/api/auth/verify` | Verifikasi token |
| GET | `/api/domains` | List semua domain + stats |
| GET | `/api/domains/stats` | Statistik + chart data |
| POST | `/api/domains` | Tambah domain baru |
| PUT | `/api/domains/:id` | Update domain |
| DELETE | `/api/domains/:id` | Hapus domain |
| POST | `/api/domains/:id/check` | Manual check 1 domain |
| POST | `/api/domains/check-all` | Manual check semua domain |

## Cara Dapatkan Telegram Bot Token
1. Chat `@BotFather` di Telegram
2. Ketik `/newbot` → ikuti instruksi
3. Copy token yang diberikan
4. Untuk Chat ID: chat `@userinfobot` atau forward pesan ke bot tersebut
