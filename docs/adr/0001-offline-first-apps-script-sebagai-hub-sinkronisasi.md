# Offline-first: Device menyimpan data sendiri, Apps Script hanya hub sinkronisasi

Google Apps Script Web App lambat (sering 1–4 detik per request) dan iOS tidak mendukung Background Sync, sehingga UI yang menunggu server akan terasa patah. Karena itu setiap Device menyimpan salinan lengkap datanya di IndexedDB sebagai sumber kebenaran lokal, semua perubahan masuk antrian (outbox) yang dikirim ke Apps Script saat app dibuka, kembali terlihat, atau lewat tombol Sync manual. Konflik antar-Device (satu pengguna, banyak Device) diselesaikan dengan "edit terakhir menang" berdasarkan `updatedAt`; setiap record punya ID (UUID) yang dibuat di klien agar retry tidak menggandakan data.

## Considered Options

- Online-only (setiap aksi menunggu respons Apps Script): ditolak karena latensi dan tidak bisa dipakai saat sinyal buruk.
- Merge per-field / CRDT: ditolak, berlebihan untuk satu pengguna.
