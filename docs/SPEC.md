# Habbit — Spesifikasi v1

Aplikasi PWA pribadi Habit Tracker & Daily Journal untuk satu pengguna di banyak Device (iOS Safari Home Screen & Android Chrome). Biaya Rp0.

Sumber kebenaran lain (baca dulu, jangan diduplikasi di sini):

- `GLOSSARY.md` — istilah domain. Pakai istilah ini **persis** di kode, UI, nama sheet, dan komentar (Habit, Archived Habit, Check-in, Streak, Day, Journal Entry, Diary, Device, Reminder).
- `docs/adr/0001` offline-first · `0002` Sheets sumber kebenaran, Diary satu arah · `0003` arsitektur Reminder.

Nama aplikasi: **Habbit** (dengan dua "b", disengaja). UI berbahasa **Inggris**. Tema terang/gelap mengikuti sistem.

---

## 1. Aturan domain

| Aturan | Detail |
|---|---|
| Day | `YYYY-MM-DD` dari waktu **lokal Device**, ganti tengah malam. Bangun dari `getFullYear/getMonth/getDate` — jangan `toISOString()` (UTC). Saat app terbuka melewati tengah malam atau kembali terlihat, UI re-render ke Day baru. |
| Check-in | Biner. Maks satu per Habit per Day. ID deterministik `${habitId}:${day}`. Membatalkan = `deleted: true` (tombstone), bukan hapus baris. |
| Jendela Check-in | Hanya **hari ini dan kemarin** yang bisa ditambah/dibatalkan. Masa depan & lebih lama dari kemarin: read-only. |
| Habit | Hanya harian. Bisa tambah, ganti nama, urut naik/turun, arsip/aktifkan lagi. **Tidak ada hapus.** Ganti nama tidak mengubah riwayat. |
| Streak | Lihat GLOSSARY. Hari ini belum Check-in → hitung dari kemarin. Contoh: Check-in 17,18,19; tanggal 20 pagi = 3; tanggal 21 tanpa Check-in 20 = 0. |
| Journal Entry | Maks satu per Day, key = `day`. Tanpa judul, tanpa Mood. Bisa diedit **hanya pada Day-nya**; setelah lewat → read-only. Entry dianggap "ada" bila `content.trim() !== ''`. |
| Diary | Google Docs, satu file per tahun, urut kronologis. Ditulis Apps Script, tidak pernah dibaca aplikasi. Lihat §6.3. |
| Reminder | Satu jam global untuk semua Device (default `20:00`, diatur di Settings, tersinkron). Dikirim maks sekali per hari, hanya bila ada Habit aktif tanpa Check-in hari ini **atau** belum ada Journal Entry hari ini. Ke semua Device yang mengaktifkan notifikasi. Tap → buka tab Today. Zona waktu server: `Asia/Jakarta`. |
| Search | Di Device (offline). Case- & diacritic-insensitive. Query dipecah per spasi, semua token harus cocok (AND) terhadap `content` + representasi tanggal (`2026-10-20`, `20 oct 2026`, `20 october 2026`, `tuesday`, `oct 2026`). Token yang cocok di `content` di-highlight. |

## 2. Struktur repo

```
/frontend                 ← proyek Vite vanilla JS (Vercel Root Directory)
  /api/send-push.js       ← Vercel Serverless Function (Node)
  /public/icon.svg        ← sumber ikon; PNG dihasilkan @vite-pwa/assets-generator
  /src
    main.js  styles.css  sw.js
    /shared/contracts.js  ← JSDoc typedef, konstanta ACTIONS, ERRORS, STORES
    /domain/              ← fungsi murni: day, streak, stats, search
    /data/                ← config, db, repo, outbox, merge, api, sync
    /pwa/                 ← install, push, update
    /ui/                  ← shell, today, history, settings
  index.html  vite.config.js  vitest.config.js  pwa-assets.config.js  package.json
/gas-backend
  Code.gs  appsscript.json
  /tests/*.test.js        ← memuat Code.gs via node:vm + stub global GAS; dijalankan Vitest dari /frontend
/docs/adr  /docs/SPEC.md  GLOSSARY.md  README.md (panduan deploy)
```

## 3. Stack & dependency

Vanilla JS (ES modules), tanpa framework UI. Install dengan versi **exact** (`npm install -E`), versi stabil terbaru saat instalasi:

- runtime: `idb`, `workbox-precaching`, `workbox-routing`, `web-push` (hanya dipakai `/api`)
- dev: `vite`, `vite-plugin-pwa`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `fake-indexeddb`, `@vite-pwa/assets-generator`

`vite-plugin-pwa` memakai strategi **`injectManifest`** (`src/sw.js` kustom karena butuh handler push) dan `registerType: 'prompt'` (toast "Update available · Reload"; jangan auto-reload saat user mengetik jurnal). Tanpa library chart.

`package.json` scripts minimal: `dev`, `build`, `preview`, `test` (`vitest run`), `generate-pwa-assets`.

## 4. Data model

Semua timestamp ISO-8601 UTC string. `updatedAt` diisi Device saat mutasi; `serverUpdatedAt` diisi server saat menulis (dipakai untuk cursor pull, kebal clock skew).

```js
/** @typedef {{ id: string /*uuid*/, name: string /*1–60*/, sortOrder: number, archived: boolean, createdAt: string, updatedAt: string }} Habit */
/** @typedef {{ id: string /*`${habitId}:${day}`*/, habitId: string, day: string, deleted: boolean, updatedAt: string }} CheckIn */
/** @typedef {{ day: string, content: string, updatedAt: string, printedToDiaryAt: string /*'' bila belum; milik server, read-only di klien*/ }} JournalEntry */
/** @typedef {{ key: 'reminderTime', value: string /*'HH:MM'*/, updatedAt: string }} Setting */
```

Google Sheets (dibuat `setup()`; seluruh sheet diformat teks `@` agar tanggal tidak dikonversi; boolean ditulis/dibaca sebagai string `TRUE`/`FALSE`):

| Sheet | Kolom (header baris 1) |
|---|---|
| `Habits` | id, name, sortOrder, archived, createdAt, updatedAt, serverUpdatedAt |
| `Check_Ins` | id, habitId, day, deleted, updatedAt, serverUpdatedAt |
| `Journal_Entries` | day, content, updatedAt, printedToDiaryAt, serverUpdatedAt |
| `Settings` | key, value, updatedAt, serverUpdatedAt |
| `Push_Subscriptions` | deviceId, endpoint, p256dh, auth, createdAt |

IndexedDB `habbit` (via `idb`): stores `habits` (keyPath `id`), `checkIns` (`id`, index `habitId`), `journalEntries` (`day`), `settings` (`key`), `outbox` (`key` = `${type}:${recordKey}`, nilai = snapshot record terbaru, ter-coalesce), `meta` (`key`: `cursor`, `lastSyncedAt`).

localStorage: `habbit.gasUrl`, `habbit.pin`, `habbit.deviceId` (uuid, dibuat sekali).

## 5. Kontrak API (PWA → Apps Script)

Satu endpoint: URL `/exec` Web App. **Semua** request:

```js
fetch(gasUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // hindari preflight CORS
  redirect: 'follow',                                      // ikuti 302 Apps Script
  body: JSON.stringify({ pin, deviceId, action, ...payload }),
});
```

Server: `JSON.parse(e.postData.contents)`. Selalu HTTP 200 (Apps Script tak bisa set status), body JSON:

- sukses `{ ok: true, ... }`
- gagal `{ ok: false, error: 'UNAUTHORIZED' | 'BAD_REQUEST' | 'RATE_LIMITED' | 'INTERNAL', message }`

`doGet` hanya mengembalikan `{ ok: true, app: 'habbit' }` — tidak pernah data.

| action | payload | respons |
|---|---|---|
| `ping` | — | `{ ok, serverTime, timeZone }` |
| `sync` | `{ since: string\|null, changes: { habits, checkIns, journalEntries, settings } }` | `{ ok, cursor, changes: {…sama}, rejected: [{ type, key, reason }] }` |
| `subscribePush` | `{ subscription: PushSubscriptionJSON }` | `{ ok }` (upsert per `deviceId`) |
| `unsubscribePush` | — | `{ ok }` |
| `testPush` | — | `{ ok, results }` (kirim ke Device pemanggil saja) |

Aturan `sync` di server (di dalam `LockService.getScriptLock().waitLock(20000)`):

1. `now` = waktu server, dipaksa monoton (> nilai terakhir di Script Properties).
2. Per record masuk: cari by key. Tulis bila belum ada **atau** `incoming.updatedAt > existing.updatedAt`; set `serverUpdatedAt = now`. `printedToDiaryAt` dari klien diabaikan. Journal Entry yang `printedToDiaryAt` sudah terisi → tolak dengan reason `LOCKED`.
3. Balas semua record dengan `serverUpdatedAt > since` (`since` null = semua). `cursor = now`.

Auth: bandingkan `pin` dengan Script Property `PIN`. Gagal >10x dalam 10 menit (CacheService) → `RATE_LIMITED` selama 10 menit.

## 6. Backend Apps Script (`gas-backend/Code.gs`)

Container-bound ke Spreadsheet. `appsscript.json`: `timeZone: "Asia/Jakarta"`, `runtimeVersion: "V8"`, webapp `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`, `oauthScopes` eksplisit (spreadsheets, documents, drive, script.external_request, script.scriptapp).

Satu file, tetapi logika murni (format/parse heading Diary, posisi sisip, keputusan Reminder, merge LWW, teks notifikasi) dipisah ke fungsi tanpa akses global GAS agar bisa diuji di Node.

### 6.1 Script Properties

`PIN` (diisi manual user, disarankan ≥16 karakter acak), `PUSH_SHARED_SECRET` (dibuat `setup()` bila kosong, di-log sekali), `PUSH_ENDPOINT_URL` (diisi manual setelah deploy Vercel), `DIARY_FOLDER_ID`, `DIARY_DOC_<YYYY>`, `LAST_REMINDER_DAY`, `LAST_SERVER_NOW`.

### 6.2 `setup()` — idempoten, dijalankan manual sekali

Buat sheet + header + format teks bila belum ada; buat folder Drive `Habbit Diary`; generate `PUSH_SHARED_SECRET` bila kosong; hapus lalu pasang ulang trigger `printDiary` (harian ~02:00) dan `checkReminder` (tiap 10 menit); log ringkasan + langkah berikutnya.

### 6.3 `syncDiaryEntries()` & `printDiary()` (auto-sync 10 menit & trigger harian)

Auto-sync jurnal ke Google Drive Doc dijalankan setiap 10 menit di dalam siklus background `checkReminder()` serta di-catch up harian pada `printDiary()` (~02:00 Jakarta).

Ambil Journal Entry yang belum dicetak (`!printedToDiaryAt`) atau telah diedit setelah pencetakan (`updatedAt > printedToDiaryAt`). Per entry: buka/buat doc `Habbit – Diary <YYYY>` di folder `DIARY_FOLDER_ID` (default `1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC`):
- Bila heading tanggal sudah ada di Doc:
  - Jika content diisi: update isi paragraf secara in-place di bawah heading tanggal tersebut tanpa membuat heading duplikat.
  - Jika content kosong/dihapus: hapus heading tanggal dan paragraf pemisahnya dari Doc.
- Bila heading tanggal belum ada dan content tidak kosong: sisipkan blok di **posisi kronologis**:
  - Heading 2: `EEEE, d MMMM yyyy` (contoh `Tuesday, 20 October 2026`)
  - satu paragraf Normal per baris `content`
  - satu paragraf kosong sebagai pemisah
- Set `printedToDiaryAt = serverNow`. Entry yang gagal dicoba lagi di run berikutnya.
- Aturan `LOCKED`: hanya mengunci entri hari lampau (`day < todayJakarta && printedToDiaryAt !== ''`). Entri hari ini tetap bebas diedit dan di-sync sepanjang hari.

### 6.4 `checkReminder()` (trigger 10 menit)

Menjalankan `syncDiaryEntries(ss, props, { includeToday: true })` dalam blok `try/catch` agar entri jurnal hari ini otomatis tersimpan ke Google Doc setiap 10 menit tanpa menunggu pergantian hari.

Kemudian mengevaluasi pengiriman push notification:
Keluar bila: `nowHHMM < reminderTime`, atau `LAST_REMINDER_DAY === todayJakarta`, atau tidak ada subscription, atau `PUSH_ENDPOINT_URL` kosong. Hitung Habit aktif tanpa Check-in (non-deleted) hari ini dan apakah Journal Entry hari ini ada. Tidak ada yang tertunda → set `LAST_REMINDER_DAY`, keluar. Selain itu `UrlFetchApp` POST ke `PUSH_ENDPOINT_URL` dengan header `x-push-secret` dan body `{ subscriptions, notification: { title: 'Habbit', body, url: '/?tab=today' } }`. Teks body: `2 habits left · Journal not written yet` / `1 habit left` / `Journal not written yet`. Hapus subscription yang hasilnya 404/410. Set `LAST_REMINDER_DAY`.
## 7. Web Push

- VAPID dibuat user: `npx web-push generate-vapid-keys`.
- Env Vercel: `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:…`), `PUSH_SHARED_SECRET`.
- `api/send-push.js`: POST saja; tolak 401 bila `x-push-secret` tidak cocok (perbandingan constant-time); kirim via `web-push` (TTL 3600) ke setiap subscription; balas `{ results: [{ endpoint, ok, statusCode }] }`. Stateless, tanpa jadwal.
- `src/sw.js`: `precacheAndRoute(self.__WB_MANIFEST)`, navigation fallback ke `index.html`; `push` → **selalu** `showNotification` (iOS mencabut izin bila push tidak menampilkan notifikasi); `notificationclick` → fokus jendela yang ada atau buka `url`. Request ke Apps Script tidak di-cache.
- `pwa/push.js`: state `unsupported | needs-install (iOS non-standalone) | default | denied | subscribed`. `requestPermission()` hanya dari tap tombol. Subscribe → action `subscribePush`.

## 8. PWA & kompatibilitas iOS/Android (wajib semua)

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (tanpa `maximum-scale`).
- `apple-mobile-web-app-capable=yes`, `mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title=Habbit`, `<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`, `theme-color` untuk light & dark (`media="(prefers-color-scheme: …)"`).
- Manifest: `name`/`short_name` `Habbit`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, ikon 192/512/maskable.
- Header: `padding-top: env(safe-area-inset-top)`; bottom nav: `padding-bottom: env(safe-area-inset-bottom)`; kiri/kanan juga untuk landscape. Tinggi layout pakai `100dvh`.
- Semua `input`, `select`, `textarea`: `font-size: 16px` minimum.
- Install: `beforeinstallprompt` → tombol Install (Android). iOS Safari & belum standalone (`navigator.standalone !== true` dan bukan `display-mode: standalone`) → instruksi "Tap Share → Add to Home Screen" **plus** catatan: aplikasi terpasang punya storage terpisah, atur sync setelah install. Sudah terpasang → "Installed ✓".
- Panggil `navigator.storage.persist()` saat startup bila tersedia.
- Aksesibilitas: target sentuh ≥44px, `aria-pressed` pada tombol Check-in, label untuk semua input, fokus terlihat, hormati `prefers-reduced-motion`, kontras AA.

## 9. Sync klien (`data/`)

- Setiap mutasi lewat `repo.js`: set `updatedAt`, `put` ke store, upsert ke `outbox`, emit event perubahan, `scheduleSync(3000)`.
- `syncNow()`: satu in-flight saja. Kirim isi outbox + `since = meta.cursor`. Sukses → hapus entri outbox yang `updatedAt`-nya sama dengan yang dikirim; merge `changes` (menang bila lokal tidak ada atau `incoming.updatedAt > local.updatedAt`, kecuali lokal masih di outbox dengan `updatedAt` lebih baru; `printedToDiaryAt` selalu dari server); simpan `cursor`, `lastSyncedAt`. Record `rejected` LOCKED → ambil versi server.
- Pemicu: startup, `visibilitychange` → visible, `online`, `scheduleSync`, tombol Sync now. Tanpa config → app tetap berfungsi penuh secara lokal, status "Not configured".
- Status: `not-configured | idle | syncing | offline | error`, + jumlah pending, ditampilkan kecil di header.

## 10. UI (3 tab, bottom nav: Today · History · Settings; route `?tab=`)

- **Today**: tanggal panjang; progres `3/5 done`; daftar Habit aktif (urut `sortOrder`) dengan tombol Check-in + Streak (`🔥 5`); textarea Journal Entry autosave (debounce 800 ms) dengan status "Saved"; empty state → link ke Manage Habits.
- **History**: kartu per Habit aktif: heatmap 12 minggu (kolom = minggu, baris Senin–Minggu), Streak saat ini, Streak terpanjang, completion 30 hari (penyebut = Day dalam 30 hari terakhir sejak `createdAt` Habit). Sel hari ini & kemarin bisa di-tap untuk toggle Check-in; lainnya read-only. Bagian "Archived" ter-collapse. Di bawah: kotak search + daftar Journal Entry terbaru dulu (tanggal pendek + cuplikan 2 baris, highlight hasil search); tap → tampilan baca penuh (read-only; bila hari ini → tombol "Edit in Today").
- **Settings**: *Sync* (URL Web App, PIN `type=password`, Test connection → `ping`, Sync now, last synced, status) · *Manage Habits* (tambah, rename inline, ▲▼, archive/unarchive) · *Reminder* (input jam, Enable notifications, Send test notification, status) · *Install App* (§8) · versi aplikasi.

## 11. Tes (Vitest) — wajib hijau

- `domain/day`: toDay lokal (bukan UTC) dekat tengah malam, addDays lintas bulan/tahun, jendela Check-in, journal editable.
- `domain/streak`: contoh §1, hari ini sudah/belum Check-in, gap, Check-in `deleted` diabaikan, longest streak.
- `domain/stats`: completion rate dengan Habit baru < 30 hari; bentuk heatmap & awal minggu Senin.
- `domain/search`: AND token, diakritik, cocok tanggal, rentang highlight.
- `data/merge` + `data/sync` (fake-indexeddb, `fetch` di-mock): LWW dua arah, outbox coalesce, outbox tidak terhapus bila record berubah saat sync in-flight, LOCKED.
- `gas-backend/tests`: auth & rate limit, sync upsert + cursor monoton, LOCKED, format/parse heading Diary, posisi sisip kronologis (awal/tengah/akhir/entri terlambat), keputusan & teks Reminder, idempotensi `setup()` (dengan stub).

## 12. Definition of Done

- `npm run build` dan `npm test` di `/frontend` hijau; tidak ada error di console saat `npm run preview`.
- Lighthouse/PWA: manifest valid, SW terdaftar, app terbuka offline setelah kunjungan pertama.
- Setiap butir §8 terverifikasi di kode.
- `README.md` berisi panduan deploy langkah demi langkah (Bahasa Indonesia): Spreadsheet + Apps Script (paste `Code.gs` & `appsscript.json`, isi `PIN`, jalankan `setup()`, deploy Web App *Execute as Me / Anyone*, cara update tanpa ganti URL: *Manage deployments → Edit → New version*) → VAPID keys → push ke GitHub → Vercel (Root Directory `frontend`, env vars §7) → isi `PUSH_ENDPOINT_URL` → install di iPhone & Android → isi URL/PIN di Settings → Enable notifications → troubleshooting (CORS/redirect, PIN salah, notifikasi iOS butuh 16.4+ dan app terpasang, cache SW lama).
- Tidak ada rahasia (PIN, secret, VAPID private key) di repo.
