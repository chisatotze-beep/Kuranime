# Kura — Situs Download Anime

Situs download anime minimalis: data dari MyAnimeList (Jikan + cadangan halaman MAL), link dari index Google Drive (goindex), dashboard khusus owner/admin.

- **Frontend:** React 18 + Vite + Tailwind + shadcn/ui, routing hash (`/#/...`)
- **Backend:** Node.js 20 + Express 5 + SQLite (better-sqlite3 + Drizzle)
- **Satu proses** melayani API dan file web di port yang sama (default `5000`)

Panduan deploy lengkap: **[DEPLOY.md](./DEPLOY.md)**

## Jalankan di komputer sendiri

```bash
npm install
npm run dev          # http://localhost:5000  (mode pengembangan, hot reload)
```

Mode produksi:

```bash
npm run build        # hasil: dist/index.cjs + dist/public/
npm start            # http://localhost:5000
```

Pertama kali jalan, database `data.db` otomatis dibuat dan diisi 17 anime contoh dari `seed/kura-seed.db`
(matikan dengan `NO_SEED=1`). Buka `http://localhost:5000/#/admin` untuk membuat akun owner.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi ke `dist/` |
| `npm start` | Jalankan hasil build |
| `npm run check` | Cek TypeScript |
| `npm run backup` | Backup database ke folder `backups/` di sebelah database (14 terakhir disimpan) |
| `npm run reset-owner -- <user> <password>` | Darurat: reset password, matikan 2FA, keluarkan semua sesi |

## Variabel lingkungan (`.env`)

Salin `.env.example` jadi `.env`.

| Nama | Default | Keterangan |
| --- | --- | --- |
| `PORT` | `5000` | Port aplikasi |
| `DB_FILE` | `data.db` | Lokasi file SQLite |
| `TRUST_PROXY` | `1` | `1` jika di belakang Nginx/Cloudflare/Railway, `0` jika diakses langsung |
| `SETUP_KEY` | – | **Isi di server publik.** Kode rahasia untuk membuat akun owner pertama |
| `NO_SEED` | `0` | `1` = mulai dengan katalog kosong |

## Struktur

```
client/src/
  App.tsx                 router (halaman admin dimuat terpisah / lazy)
  components/site.tsx     header, footer, kartu anime, badge, pager
  components/comments.tsx ruang diskusi
  pages/home.tsx          beranda
  pages/browse.tsx        jelajah + filter, season, genre & studio
  pages/anime.tsx         detail + tabel episode + streaming
  pages/admin.tsx         login, shell dashboard, ringkasan, daftar, pengaturan, admin, komentar
  pages/admin-anime.tsx   tambah dari link MAL, penjelajah index, editor sumber
  pages/admin-security.tsx halaman Keamanan, 2FA, indikator password
  lib/                    query client, state, daftar pemutar, helper MAL
server/
  index.ts                Express + middleware
  routes.ts               semua endpoint API
  storage.ts              database, migrasi otomatis, cache
  sources.ts              ambil data MAL & index Google Drive
  security.ts             header, rate limit, anti-SSRF, TOTP, validasi password
shared/
  schema.ts               tabel & validasi (server)
  utils.ts                helper ringan (dipakai juga di browser)
seed/kura-seed.db         katalog contoh
deploy/nginx-kura.conf    contoh konfigurasi Nginx
Dockerfile, docker-compose.yml, ecosystem.config.cjs (PM2)
```

Migrasi database berjalan otomatis setiap server start; tidak perlu perintah migrasi manual.
