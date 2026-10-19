# Panduan Deploy Kura

Kura butuh **server Node.js yang jalan terus** dan **disk permanen** (database SQLite + sinkron anime ongoing tiap 3 jam).
Karena itu **Vercel / Netlify / Cloudflare Pages tidak cocok** — di sana database akan hilang dan timer tidak jalan.

Pilih salah satu:

| Opsi | Cocok untuk | Biaya kira-kira |
| --- | --- | --- |
| **A. VPS + PM2 + Nginx** (disarankan) | Kontrol penuh, paling hemat | VPS 1 GB RAM (mulai ±Rp50–80 rb/bulan) |
| **B. VPS + Docker** | Suka Docker, gampang pindah server | Sama dengan A |
| **C. Railway** | Tanpa urus server | Sesuai pemakaian (±US$5/bulan) |

Sebelum mulai, siapkan:
- Domain (opsional tapi disarankan), mis. `kura.domainmu.com`
- Kode rahasia untuk `SETUP_KEY` — buat acak, mis. jalankan `openssl rand -hex 16`

---

## A. VPS Ubuntu + PM2 + Nginx + HTTPS

Contoh di Ubuntu 22.04/24.04. Ganti `kura.domainmu.com` dengan domainmu.

### 1. Arahkan domain ke VPS
Di panel DNS (Cloudflare/registrar) buat record **A**: `kura` → `IP_VPS`.
Kalau pakai Cloudflare, set dulu ke **DNS only** (awan abu-abu) sampai HTTPS selesai di langkah 7.

### 2. Masuk ke VPS dan siapkan sistem
```bash
ssh root@IP_VPS

apt update && apt upgrade -y
apt install -y git nginx build-essential python3 ufw

# user khusus (jangan jalankan aplikasi sebagai root)
adduser --disabled-password --gecos "" kura
```

### 3. Pasang Node.js 20 dan PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
node -v   # harus v20.x
```

### 4. Upload kode
Pilih salah satu:

**Lewat GitHub** (disarankan, repo dibuat **private**):
```bash
# di komputermu, di dalam folder kura
git init && git add -A && git commit -m "Kura"
git remote add origin git@github.com:USERNAME/kura.git
git push -u origin main

# di VPS
su - kura
git clone https://github.com/USERNAME/kura.git
cd kura
```

**Lewat zip** (tanpa GitHub):
```bash
# di komputermu
scp kura-source.zip root@IP_VPS:/home/kura/
# di VPS
apt install -y unzip
su - kura
unzip kura-source.zip -d kura && cd kura
```

### 5. Install, konfigurasi, build
```bash
# masih sebagai user kura, di folder ~/kura
npm ci
cp .env.example .env
nano .env
```
Isi `.env`:
```
PORT=5000
DB_FILE=/home/kura/kura/data.db
TRUST_PROXY=1
SETUP_KEY=isi-kode-acak-dari-openssl
```
Lalu:
```bash
npm run build
```

### 6. Jalankan dengan PM2 (otomatis hidup lagi kalau crash / VPS restart)
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup          # salin & jalankan perintah yang muncul (pakai sudo/root)

curl http://127.0.0.1:5000/api/auth/status   # harus muncul {"needsSetup":true,...}
```

### 7. Nginx + HTTPS gratis (Let's Encrypt)
```bash
exit   # kembali ke root

cp /home/kura/kura/deploy/nginx-kura.conf /etc/nginx/sites-available/kura
nano /etc/nginx/sites-available/kura       # ganti domain-kamu.com -> kura.domainmu.com
ln -s /etc/nginx/sites-available/kura /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d kura.domainmu.com --redirect -m emailmu@gmail.com --agree-tos -n
```
Kalau pakai Cloudflare, sekarang boleh dinyalakan proxy (awan oranye) dengan SSL mode **Full (strict)**.

### 8. Firewall
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```
Port 5000 tidak dibuka ke luar — semua lewat Nginx.

### 9. Buat akun owner
Buka `https://kura.domainmu.com/#/admin` → isi username, password, dan **Kode setup** (nilai `SETUP_KEY`).
Setelah itu langsung: **Akun → Aktifkan 2FA**.

### 10. Backup otomatis harian
```bash
su - kura
crontab -e
```
Tambahkan:
```
0 3 * * * cd /home/kura/kura && /usr/bin/npm run -s backup >> /home/kura/backup.log 2>&1
```
Backup tersimpan di folder `backups/` di sebelah file database (14 terakhir). Sesekali salin ke komputermu:
`scp kura@IP_VPS:/home/kura/kura/backups/*.db .`

### Update versi baru
```bash
su - kura && cd ~/kura
npm run backup
git pull            # atau upload zip baru, timpa file (jangan hapus data.db & .env)
npm ci
npm run build
pm2 restart kura
```

---

## B. VPS + Docker

```bash
# di VPS (root)
curl -fsSL https://get.docker.com | sh
git clone https://github.com/USERNAME/kura.git && cd kura   # atau unzip

# isi SETUP_KEY
nano docker-compose.yml
#   environment:
#     - SETUP_KEY=isi-kode-acak

docker compose up -d --build
docker compose logs -f         # Ctrl+C untuk keluar
curl http://127.0.0.1:5000/api/auth/status
```
Lanjutkan **langkah 7–9** opsi A (Nginx, HTTPS, firewall, akun owner).

- Database ada di volume `kura-data` (`/data/kura.db` dalam container), aman saat rebuild.
- Backup: `docker compose exec kura node script/backup.cjs` (tersimpan di `/data/backups/`), salin keluar: `docker compose cp kura:/data/backups ./backups`
- Backup harian (crontab root): `0 3 * * * cd /root/kura && docker compose exec -T kura node script/backup.cjs`
- Update: `git pull && docker compose up -d --build`
- Reset owner darurat: `docker compose exec kura node script/reset-owner.cjs <username> <password-baru>`

---

## C. Railway (tanpa urus server)

1. Push kode ke repo GitHub **private** (lihat langkah A.4).
2. Buka [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo** → pilih repo `kura`. Railway otomatis memakai `Dockerfile`.
3. Di service → **Settings → Volumes → Add Volume**, mount path: `/data`.
4. **Variables** → tambahkan:
   ```
   DB_FILE=/data/kura.db
   TRUST_PROXY=1
   SETUP_KEY=isi-kode-acak
   PORT=5000
   ```
5. **Settings → Networking → Generate Domain** (atau Custom Domain → ikuti instruksi CNAME).
6. Tunggu deploy selesai → buka `https://domainmu/#/admin` → buat owner dengan kode setup → aktifkan 2FA.
7. Pastikan jumlah replika **1** (SQLite tidak boleh dipakai banyak instance).

Update: cukup `git push`, Railway build ulang otomatis. Data aman di volume.

---

## Coba di Windows (lokal)

Pasang [Node.js 20 LTS](https://nodejs.org), lalu di PowerShell / CMD di folder `kura`:
```powershell
npm install
npm run dev
```
Buka `http://localhost:5000`. Jika `npm install` gagal di `better-sqlite3`, pasang
"Desktop development with C++" dari Visual Studio Build Tools, atau pakai WSL.

---

## Setelah online — checklist

- [ ] Akun owner dibuat dengan kode setup, lalu **2FA aktif**
- [ ] Buka **Dashboard → Keamanan**, semua pemeriksaan hijau
- [ ] **Pengaturan → Index Google Drive**: folder awal & domain yang diizinkan sudah benar
- [ ] Backup harian jalan (cek `~/backup.log` besok)
- [ ] Coba buka satu anime → klik Download & Streaming dari HP

## Masalah umum

| Gejala | Solusi |
| --- | --- |
| `502 Bad Gateway` | Aplikasi mati: `pm2 logs kura` / `docker compose logs` |
| Semua komentar tercatat IP yang sama | `TRUST_PROXY` salah. Di belakang Nginx + Cloudflare pakai `TRUST_PROXY=2` |
| "Domain ... belum diizinkan" di penjelajah index | Owner tambahkan domainnya di **Pengaturan → Index Google Drive** |
| Data MAL gagal diambil | Jikan kadang down/limit; server otomatis mencoba halaman MAL. Tunggu sebentar lalu coba lagi |
| Lupa password / HP 2FA hilang | Di server: `npm run reset-owner -- <username> <password-baru>` |
| Login dikunci "terlalu banyak percobaan" | Tunggu 15 menit, atau `pm2 restart kura` |
