# Habbit — Panduan Deploy & Operasional

Habbit adalah Progressive Web App (PWA) pribadi untuk melacak kebiasaan harian (Habit Tracker) dan menulis jurnal reflektif harian (Daily Journal) untuk satu pengguna di banyak Device (iPhone Safari & Android Chrome) dengan biaya Rp0.

Aplikasi ini mengadopsi arsitektur **offline-first**: setiap Device menyimpan data secara lokal di IndexedDB dan tetap berfungsi penuh tanpa koneksi internet. Sinkronisasi multi-device dilakukan melalui Google Sheets dengan perantara Google Apps Script (GAS) Web App, dan pengiriman notifikasi Web Push dijadwalkan oleh trigger Apps Script melalui Vercel Serverless Function.

---

## Daftar Isi
1. [Prasyarat](#1-prasyarat)
2. [Langkah 1: Setup Google Spreadsheet & Apps Script](#langkah-1-setup-google-spreadsheet--apps-script)
3. [Langkah 2: Pembuatan VAPID Keys untuk Web Push](#langkah-2-pembuatan-vapid-keys-untuk-web-push)
4. [Langkah 3: Deploy Frontend & Push Function ke Vercel](#langkah-3-deploy-frontend--push-function-ke-vercel)
5. [Langkah 4: Konfigurasi Endpoint Push di Apps Script](#langkah-4-konfigurasi-endpoint-push-di-apps-script)
6. [Langkah 5: Pemasangan Aplikasi di Ponsel (iOS & Android)](#langkah-5-pemasangan-aplikasi-di-ponsel-ios--android)
7. [Langkah 6: Konfigurasi Awal di Aplikasi & Uji Coba](#langkah-6-konfigurasi-awal-di-aplikasi--uji-coba)
8. [Panduan Update Kode Backend Tanpa Mengubah URL](#panduan-update-kode-backend-tanpa-mengubah-url)
9. [Troubleshooting & Solusi Masalah Umum](#troubleshooting--solusi-masalah-umum)
10. [Kebijakan Keamanan](#kebijakan-keamanan)

---

## 1. Prasyarat

- Akun Google aktif (Google Drive, Google Sheets, Google Docs).
- Node.js versi 18 atau lebih baru terpasang di komputer lokal.
- Akun GitHub & akun Vercel (paket Hobby Rp0).
- Ponsel pintar:
  - iOS 16.4+ (Safari) untuk dukungan Web Push PWA.
  - Android (Chrome).

---

## 2. Langkah 1: Setup Google Spreadsheet & Apps Script

1. **Buat Google Spreadsheet Baru**:
   - Buka [Google Sheets](https://sheets.new).
   - Beri nama dokumen, misalnya `Habbit Data`.

2. **Buka Editor Apps Script**:
   - Di menu atas Spreadsheet, klik **Extensions** (Ekstensi) > **Apps Script**.
   - Beri nama proyek Apps Script, misalnya `Habbit Backend`.

3. **Salin Manifest Proyek (`appsscript.json`)**:
   - Di panel kiri Apps Script, klik ikon roda gigi **Project Settings** (Setelan Proyek).
   - Centang opsi **Show "appsscript.json" manifest file in editor**.
   - Kembali ke tab editor berkas (`< >`), buka berkas `appsscript.json`.
   - Ganti seluruh isinya dengan isi dari berkas `gas-backend/appsscript.json`:
     ```json
     {
       "timeZone": "Asia/Jakarta",
       "dependencies": {},
       "exceptionLogging": "STACKDRIVER",
       "runtimeVersion": "V8",
       "webapp": {
         "executeAs": "USER_DEPLOYING",
         "access": "ANYONE_ANONYMOUS"
       },
       "oauthScopes": [
         "https://www.googleapis.com/auth/spreadsheets",
         "https://www.googleapis.com/auth/documents",
         "https://www.googleapis.com/auth/drive",
         "https://www.googleapis.com/auth/script.external_request",
         "https://www.googleapis.com/auth/script.scriptapp"
       ]
     }
     ```

4. **Salin Kode Backend (`Code.gs`)**:
   - Buka berkas `Code.gs` di editor Apps Script.
   - Hapus kode bawaan, lalu salin seluruh isi dari berkas `gas-backend/Code.gs` ke dalamnya.
   - Klik ikon disket **Save** (Simpan).

5. **Isi PIN di Script Properties**:
   - Masuk ke **Project Settings** (ikon roda gigi).
   - Gulir ke bawah ke bagian **Script Properties** (Properti Skrip).
   - Klik **Add script property**:
     - **Property**: `PIN`
     - **Value**: Masukkan PIN rahasia Anda (disarankan acak sepanjang minimal 16 karakter, simpan PIN ini baik-baik).
   - Klik **Save script properties**.

6. **Jalankan Fungsi Inisialisasi `setup()`**:
   - Kembali ke tab editor kode (`< >`).
   - Pada dropdown fungsi di toolbar atas (sebelah tombol Run/Debug), pilih fungsi **`setup`**.
   - Klik tombol **Run**.
   - Google akan meminta persetujuan izin (Authorization Required):
     - Klik **Review permissions** > Pilih akun Google Anda > Klik **Advanced** > Klik **Go to Habbit Backend (unsafe)** > Klik **Allow**.
   - Periksa **Execution log**:
     - Fungsi `setup` secara idempoten akan:
       1. Membuat 5 sheet: `Habits`, `Check_Ins`, `Journal_Entries`, `Settings`, `Push_Subscriptions` lengkap dengan header dan format teks `@`.
       2. Membuat folder `Habbit Diary` di Google Drive Anda (bisa diarahkan ke folder lain dengan mengubah Script Property `DIARY_FOLDER_ID`).
       3. Membuat `PUSH_SHARED_SECRET` otomatis di Script Properties (lihat log).
       4. Memasang trigger interval `checkReminder` (setiap 10 menit: auto-save jurnal hari ini ke Google Doc tahunan `Habbit – Diary <YYYY>` dan evaluasi reminder) serta trigger harian `printDiary` (~02:00 Jakarta sebagai catch-up).
     - Catat nilai `PUSH_SHARED_SECRET` dari log atau Script Properties.

7. **Deploy sebagai Web App**:
   - Di pojok kanan atas, klik tombol **Deploy** > **New deployment**.
   - Klik ikon roda gigi **Select type** > pilih **Web app**.
   - Konfigurasi form deploy:
     - **Description**: `v1`
     - **Execute as**: `Me (<email-anda>)`
     - **Who has access**: `Anyone` *(Penting: harus Anyone agar fetch dari Device bisa masuk tanpa login Google; keamanan data dilindungi oleh autentikasi PIN di level aplikasi)*.
   - Klik **Deploy**.
   - Salin **Web app URL** yang berakhiran `/exec` (misal: `https://script.google.com/macros/s/AKfycb.../exec`). Simpan URL ini.

---

## 3. Langkah 2: Pembuatan VAPID Keys untuk Web Push

Web Push memerlukan pasangan kunci kriptografi VAPID (Voluntary Application Server Identification):

1. Buka terminal di komputer Anda dan jalankan perintah:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Terminal akan menampilkan output berupa:
   ```text
   =======================================
   Public Key:
   BNx... (string acak panjang)

   Private Key:
   4kP... (string acak panjang)
   =======================================
   ```
3. Simpan kedua kunci ini secara aman. Kunci privat (`Private Key`) tidak boleh di-commit ke Git.

---

## 4. Langkah 3: Deploy Frontend & Push Function ke Vercel

1. **Push Repository ke GitHub**:
   - Pastikan kode telah berada di repository GitHub pribadi Anda (Private Repository).
   - Pastikan `.gitignore` telah menyaring file `.env`, `node_modules/`, dan file lokal lainnya.

2. **Impor Proyek ke Vercel**:
   - Masuk ke dashboard [Vercel](https://vercel.com) lalu klik **Add New...** > **Project**.
   - Impor repository Habbit Anda.

3. **Konfigurasi Project Settings di Vercel**:
   - **Framework Preset**: `Vite`.
   - **Root Directory**: Klik **Edit** lalu pilih direktori `frontend`.
   - **Build Command**: `vite build` (bawaan).
   - **Output Directory**: `dist` (bawaan).

4. **Isi Environment Variables di Vercel**:
   Tambahkan variabel lingkungan berikut:
   - `VITE_VAPID_PUBLIC_KEY`: Isi dengan VAPID Public Key dari Langkah 2.
   - `VAPID_PUBLIC_KEY`: Isi dengan VAPID Public Key dari Langkah 2.
   - `VAPID_PRIVATE_KEY`: Isi dengan VAPID Private Key dari Langkah 2.
   - `VAPID_SUBJECT`: `mailto:email-anda@domain.com` (ganti dengan alamat email Anda).
   - `PUSH_SHARED_SECRET`: Nilai `PUSH_SHARED_SECRET` dari Script Properties Apps Script (Langkah 1).

5. **Klik Deploy**:
   - Tunggu proses build selesai.
   - Setelah sukses, Vercel akan memberikan domain aplikasi, misalnya: `https://habbit-app.vercel.app`.

---

## 5. Langkah 4: Konfigurasi Endpoint Push di Apps Script

Kembali ke Google Apps Script agar Apps Script dapat memanggil fungsi Vercel Serverless Function `/api/send-push`:

1. Buka editor Google Apps Script proyek Habbit Anda.
2. Masuk ke **Project Settings** (ikon roda gigi) > **Script Properties**.
3. Tambahkan properti:
   - **Property**: `PUSH_ENDPOINT_URL`
   - **Value**: `https://<domain-vercel-anda>/api/send-push` (contoh: `https://habbit-app.vercel.app/api/send-push`).
4. Klik **Save script properties**.

---

## 6. Langkah 5: Pemasangan Aplikasi di Ponsel (iOS & Android)

Aplikasi Habbit dioptimalkan khusus untuk mode *standalone* (PWA) agar memiliki ruang penyimpanan mandiri dan kemampuan Web Push:

### Pada iPhone (iOS 16.4 ke atas):
1. Buka URL Vercel aplikasi (`https://habbit-app.vercel.app`) di **Safari** (bukan Chrome/in-app browser).
2. Tekan tombol **Share** (ikon kotak dengan panah ke atas di bagian bawah Safari).
3. Gulir ke bawah dan pilih **Add to Home Screen** (Tambahkan ke Layar Utama).
4. Beri nama `Habbit`, lalu klik **Add**.
5. Tutup Safari dan buka aplikasi **Habbit** melalui ikon barunya di Home Screen.
   > **Catatan Penting**: Di iOS, aplikasi yang dibuka dari Home Screen memiliki penyimpanan IndexedDB/localStorage yang terpisah dari browser Safari. Anda wajib melakukan pengaturan konfigurasi URL & PIN langsung di dalam aplikasi Home Screen tersebut.

### Pada Android:
1. Buka URL aplikasi di **Google Chrome**.
2. Akan muncul prompt atau tombol **Install App** di dalam tab Settings / banner bawah browser.
3. Klik **Install**.
4. Buka aplikasi **Habbit** dari laci aplikasi ponsel Anda.

---

## 7. Langkah 6: Konfigurasi Awal di Aplikasi & Uji Coba

1. Buka aplikasi **Habbit** yang sudah terpasang di layar utama ponsel Anda.
2. Ketuk tab **Settings** di bilah navigasi bawah.
3. Di bagian **Sync**:
   - Masukkan **Web App URL** yang didapat pada Langkah 1 (`https://script.google.com/macros/s/.../exec`).
   - Masukkan **PIN** yang telah Anda tentukan di Script Properties.
   - Klik **Save Credentials**.
   - Klik tombol **Test Connection**. Anda akan melihat pesan sukses dengan waktu server dan zona waktu `Asia/Jakarta`.
   - Klik **Sync Now** untuk menyinkronkan data perdana. Indikator di header atas akan berubah menjadi titik hijau "Synced".
4. Di bagian **Manage Habits**:
   - Masukkan nama kebiasaan baru (misal: "Minum Air 2L", "Olahraga 15 Menit") dan klik **Add Habit**.
5. Di bagian **Reminder**:
   - Atur jam Reminder harian (default `20:00`).
   - Klik **Enable Notifications** dan izinkan permintaan notifikasi di ponsel Anda.
   - Klik **Send Test Notification** untuk menguji pengiriman push notification langsung ke ponsel Anda.
6. Pindah ke tab **Today**:
   - Centang kebiasaan hari ini (status progress dan streak akan langsung terhitung).
   - Tulis refleksi pada kotak **Daily Journal** (jurnal otomatis tersimpan dengan jeda 800ms dan indikator "Saved").

---

## 8. Panduan Update Kode Backend Tanpa Mengubah URL

Bila Anda memperbarui logika di `Code.gs` atau `appsscript.json`, jangan membuat deployment baru ("New deployment"), karena akan mengubah URL Web App. Lakukan langkah berikut:

1. Buka Google Apps Script editor.
2. Edit dan simpan perubahan pada `Code.gs`.
3. Di pojok kanan atas, klik **Deploy** > **Manage deployments**.
4. Di panel kiri, pilih deployment aktif Anda.
5. Di panel kanan atas, klik ikon pensil **Edit**.
6. Pada dropdown **Version**, pilih **New version** (Versi baru).
7. Klik **Deploy**.
8. URL Web App akan tetap sama persis, dan seluruh Device pengguna langsung mendapatkan versi backend terbaru.

---

## 9. Troubleshooting & Solusi Masalah Umum

### 1. Masalah CORS atau Fetch Gagal
- **Penyebab**: Web App Apps Script di-deploy dengan hak akses selain "Anyone", atau browser mengirim preflight `OPTIONS` karena header kustom.
- **Solusi**:
  1. Pastikan di Apps Script: **Deploy > Manage deployments > Edit > Who has access: Anyone**.
  2. Implementasi frontend Habbit secara default menggunakan `Content-Type: text/plain;charset=utf-8` dan `redirect: 'follow'` untuk menghindari CORS preflight dan mengikuti redirect 302 dari Google.

### 2. Status "UNAUTHORIZED" atau Error PIN
- **Penyebab**: PIN di Settings aplikasi tidak cocok dengan Script Property `PIN` di Apps Script.
- **Solusi**: Periksa kembali Script Properties di Google Apps Script dan samakan nilainya di tab Settings aplikasi. Jika salah memasukkan PIN >10 kali dalam 10 menit, backend akan mengunci akses selama 10 menit (`RATE_LIMITED`).

### 3. Notifikasi Tidak Muncul di iPhone
- **Penyebab**:
  - iOS versi di bawah 16.4.
  - Aplikasi dibuka di Safari biasa, bukan dibuka dari ikon Home Screen (PWA).
  - Web Push tidak memicu `showNotification` (iOS akan mencabut izin push jika ada notifikasi kosong).
- **Solusi**:
  1. Perbarui iOS ke 16.4+.
  2. Pastikan aplikasi telah ditambahkan ke Home Screen dan dibuka dari ikon tersebut.
  3. Cek apakah tombol "Enable Notifications" sudah diklik dan statusnya menjadi `subscribed`.
  4. Uji tombol "Send Test Notification".

### 4. Cache Service Worker Lama di Ponsel
- **Penyebab**: Browser menyimpan versi statis Service Worker.
- **Solusi**:
  - Saat ada versi baru, aplikasi menampilkan toast: *"Update available · Reload"*.
  - Ketuk tombol **Reload** pada toast tersebut untuk memperbarui aset aplikasi.

---

## 10. Kebijakan Keamanan

1. **Zero Secret in Repository**:
   - Berkas repositori tidak memuat rahasia apa pun (tidak ada PIN, VAPID Private Key, atau PUSH_SHARED_SECRET).
   - Semua rahasia tersimpan di Script Properties Google Apps Script dan Environment Variables Vercel.
2. **Autentikasi Monolitik**:
   - Endpoint Apps Script Web App hanya melayani permintaan yang memuat PIN valid.
   - Endpoint Serverless Function `/api/send-push` dilindungi oleh header rahasia `x-push-secret` dengan komparasi waktu konstan (`timingSafeEqual`) untuk mencegah serangan *timing attack*.
3. **Penyimpanan Lokal Mandiri**:
   - Data tersimpan lokal di IndexedDB masing-masing Device dan dienkripsi saat transit menggunakan HTTPS/TLS.
