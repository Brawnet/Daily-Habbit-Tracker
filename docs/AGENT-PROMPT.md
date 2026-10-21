> **HISTORICAL REFERENCE ONLY**
> This file documents the initial 4-wave bootstrapping prompt used during the project's inception.
> For active development rules, refer to `AGENTS.md`, `CODING_STANDARDS.md`, `docs/SPEC.md`, and `GLOSSARY.md`.

# Prompt untuk agent implementasi

Salin seluruh blok di bawah ke agent. Prompt ini sengaja hanya berisi *cara kerja*; *apa* yang dibangun ada di `docs/SPEC.md`.

---

```
Bangun aplikasi Habbit di repo ini sesuai docs/SPEC.md. Baca dulu, berurutan: GLOSSARY.md, docs/adr/*.md, docs/SPEC.md. SPEC adalah kontrak: bila ada yang ambigu, pilih tafsiran paling sederhana yang konsisten dengan SPEC dan catat di laporan akhir. Jangan commit atau push git.

Kerjakan dalam 4 gelombang. Di gelombang 1 dan 2, jalankan sub-agent secara PARALEL (satu sub-agent per lane). Setiap sub-agent hanya boleh menulis file di lane miliknya; file milik lane lain dibaca saja. Butuh perubahan di luar lane → tulis di laporan lane, lead yang memutuskan.

GELOMBANG 0 — Fondasi (kamu sendiri, berurutan)
1. Scaffold /frontend (Vite vanilla JS) dan /gas-backend sesuai SPEC §2. Install dependency SPEC §3 dengan `npm install -E`.
2. Konfigurasi vite.config.js (vite-plugin-pwa injectManifest + @tailwindcss/vite), vitest.config.js (ikut menjalankan ../gas-backend/tests/**), pwa-assets.config.js, index.html dengan semua meta tag SPEC §8.
3. Tulis src/shared/contracts.js (typedef SPEC §4, ACTIONS, ERRORS, STORES) dan STUB untuk setiap modul di "Antarmuka modul" di bawah: ekspor dengan signature persis + JSDoc, badan `throw new Error('TODO')`.
4. Selesai bila: `npm run build` dan `npm test` (tanpa tes / tes kosong lolos) hijau, dan semua file stub ada.

GELOMBANG 1 — 4 lane paralel (semua bergantung pada gelombang 0)
- Lane DOMAIN: src/domain/** + tesnya. SPEC §1, §10 (aturan statistik), §11.
- Lane DATA: src/data/** + tesnya (fake-indexeddb, fetch di-mock). SPEC §4, §5 (sisi klien), §9, §11.
- Lane GAS: gas-backend/** (Code.gs, appsscript.json, tests/). SPEC §4–§6, §11.
- Lane SHELL+PUSH: src/main.js, src/styles.css, src/sw.js, src/pwa/**, src/ui/shell.js, api/send-push.js, public/icon.svg. SPEC §7, §8, §10 (kerangka tab, header status sync).
Setiap lane selesai bila: semua ekspor lane-nya terimplementasi (tidak ada 'TODO'), tes lane hijau, dan `npm run build` hijau.

GELOMBANG 2 — 3 lane paralel (bergantung pada SELURUH gelombang 1)
- Lane TODAY: src/ui/today.js.
- Lane HISTORY: src/ui/history.js.
- Lane SETTINGS: src/ui/settings.js.
Ketiganya hanya memakai antarmuka publik domain/data/pwa/shell. SPEC §10. Selesai bila: tab berfungsi di `npm run preview` (Day hari ini, toggle Check-in, autosave jurnal, search, manage habits, dsb.), tanpa error console, build hijau.

GELOMBANG 3 — Integrasi & audit (kamu sendiri, lalu satu sub-agent auditor)
1. Rangkai semuanya, tulis README.md (SPEC §12), generate ikon PWA.
2. Jalankan `npm run build` dan `npm test`; perbaiki sampai hijau.
3. Kirim sub-agent AUDITOR yang independen (tanpa konteks percakapanmu) untuk memeriksa repo terhadap setiap butir SPEC §1, §5, §8, §11, §12 dan setiap aturan di GLOSSARY/ADR. Auditor menjawab per butir: PASS / FAIL + bukti (file:baris atau output perintah), dan diakhiri dengan kata `NEEDS_CHANGES` bila ada FAIL atau `APPROVED` bila semua PASS.
4. NEEDS_CHANGES → perbaiki, ulangi audit (maks 3 putaran).
5. Laporan akhir: daftar butir DoD dengan bukti, keputusan tafsiran yang kamu ambil, dan apa yang tidak bisa diverifikasi tanpa perangkat fisik (iOS/Android, Apps Script live).

Bila tool kamu mendukung pipeline sub-agent (DAG), bentuknya:
foundation → [domain, data, gas, shell] → [today, history, settings] → integrate → audit (loop ke integrate bila "NEEDS_CHANGES", maks 3)
```

---

## Antarmuka modul (dibuat sebagai stub di gelombang 0)

Ini adalah kontrak antar-lane; lane hanya boleh bergantung pada ekspor di sini.

```js
// src/domain/day.js
export function toDay(date)                // Date → 'YYYY-MM-DD' (lokal)
export function today()                    // → 'YYYY-MM-DD'
export function addDays(day, n)            // → 'YYYY-MM-DD'
export function compareDays(a, b)          // → -1 | 0 | 1
export function isCheckInEditable(day, todayDay)   // hari ini atau kemarin
export function isJournalEditable(day, todayDay)   // day === todayDay
export function formatLong(day)            // 'Tuesday, 20 October 2026'
export function formatShort(day)           // 'Tue, 20 Oct 2026'
export function msUntilNextDay(now)        // ms sampai tengah malam lokal

// src/domain/streak.js
export function currentStreak(days, todayDay)      // days: Iterable<'YYYY-MM-DD'> (hanya Check-in non-deleted)
export function longestStreak(days)

// src/domain/stats.js
export function completionRate(days, { todayDay, createdDay, windowDays = 30 })  // → 0..1
export function heatmapWeeks(days, todayDay, weeks = 12)
// → Array<Array<{ day, done, future, editable }>>  (minggu → Senin..Minggu)

// src/domain/search.js
export function searchEntries(entries, query)
// → Array<{ entry, highlights: Array<[start, end]> }>  urut day turun; query kosong → semua

// src/data/config.js
export function getConfig()                // → { gasUrl, pin, deviceId }
export function setConfig(partial)
export function isConfigured()

// src/data/repo.js   (semua mutasi: stamp updatedAt, simpan, outbox, emit, scheduleSync)
export async function listHabits({ includeArchived = false } = {})
export async function addHabit(name)
export async function renameHabit(id, name)
export async function moveHabit(id, direction)     // 'up' | 'down'
export async function setHabitArchived(id, archived)
export async function getCheckInDays(habitId)      // → Set<'YYYY-MM-DD'> non-deleted
export async function toggleCheckIn(habitId, day)  // tolak bila !isCheckInEditable
export async function getJournalEntry(day)
export async function saveJournalEntry(day, content) // tolak bila !isJournalEditable
export async function listJournalEntries()         // urut day turun
export async function getSetting(key)
export async function setSetting(key, value)
export function onChange(listener)                 // → unsubscribe

// src/data/api.js
export async function callApi(action, payload = {}) // → body respons; throw ApiError { code }

// src/data/sync.js
export async function syncNow()
export function scheduleSync(delayMs)
export function startAutoSync()
export function getSyncStatus()            // → { state, pending, lastSyncedAt, error }
export function onSyncStatus(listener)     // → unsubscribe

// src/pwa/install.js
export function getInstallState()          // 'installed' | 'android-prompt' | 'ios-safari' | 'unsupported'
export async function promptInstall()
export function onInstallStateChange(listener)

// src/pwa/push.js
export async function getPushState()       // 'unsupported' | 'needs-install' | 'default' | 'denied' | 'subscribed'
export async function enablePush()         // panggil hanya dari tap user
export async function disablePush()
export async function sendTestPush()

// src/ui/shell.js
export function mountShell(rootEl)
export function registerTab(name, { title, icon, mount })   // mount(el) → cleanup()
export function navigate(name)             // 'today' | 'history' | 'settings'
export function showToast(message, { action } = {})

// src/ui/today.js, history.js, settings.js
export function mount(el)                  // → cleanup()
```
