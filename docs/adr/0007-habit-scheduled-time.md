# Scheduled Time Opsional pada Habit dan Kolom ke-8 Sheet Habits

Sebelumnya, setiap `Habit` hanya diurutkan secara manual lewat `sortOrder` tanpa penanda waktu harian, sehingga pengguna yang ingin membangun ritme jam tertentu (misalnya *Journaling* pukul 05:00) tidak memiliki pengelompokan kronologis di tab `Today`. Di sisi lain, penambahan jadwal harian berisiko membelah `Today` menjadi daftar tugas (*checklist*) terpisah, memicu rasa bersalah akibat status terlambat, atau berbenturan dengan `Reminder` push tunggal berbasis polling 10 menit di Apps Script (`ADR-0003`).

Diputuskan desain kompatibel-mundur berikut untuk `Scheduled Time` pada `Habit`:
1. **Atribut opsional lunak pada `Habit` & pemisahan penuh dari `Reminder`**:
   - `Scheduled Time` disimpan sebagai properti opsional `scheduledTime` (`"HH:MM"` waktu lokal Device 24-jam atau `""` untuk `Anytime`) pada entitas `Habit` yang sama, sehingga satu daftar terpadu tetap mempertahankan `Check-in`, `Streak`, heatmap `History`, dan `Linked Activity`.
   - `Scheduled Time` hanya berfungsi sebagai panduan visual dan urutan di `Today` (selalu mengizinkan `Check-in` kapan saja tanpa status terlambat/terkunci) serta tidak memicu push notification tambahan di luar `Reminder` harian global (`Settings` + Apps Script).
2. **Urutan kronologis & penguncian `▲`/`▼` bagi Habit terjadwal**:
   - Di `Today` dan `Settings → Manage Habits`, `Habit` dengan `Scheduled Time` tampil lebih dahulu secara kronologis (`00:00` → `23:59`, seri waktu dipecah oleh `sortOrder`) di atas kelompok `Anytime` (diurutkan menurut `sortOrder`).
   - Agar urutan kronologis tidak berkonflik dengan penyusunan manual, tombol `▲`/`▼` pada `Habit` terjadwal dikunci dengan `aria-disabled="true"` (memberi toast penjelasan saat disentuh), sementara pemindahan manual bebas berlaku di antara sesama `Habit` `Anytime`. Menghapus waktu ke `Anytime` langsung membuka kembali kontrol `▲`/`▼`.
3. **Kolom ke-8 `scheduledTime` berformat teks polos `@` di Google Sheets `Habits`**:
   - `scheduledTime` ditambahkan di ujung kanan setelah `serverUpdatedAt` (`['id', 'name', 'sortOrder', 'archived', 'createdAt', 'updatedAt', 'serverUpdatedAt', 'scheduledTime']`) dan diformat ketat sebagai teks `@` sebelum `setValues()`, dengan perluasan header otomatis 7 → 8 kolom di `setup()` dan `syncHabits()`.
   - Posisi paling kanan menjaga indeks kolom lama (`0`–`6`) tetap kompatibel bagi sheet 7-kolom yang sudah berjalan (`""` bila sel belum ada); sinkronisasi `linkedActivity` tetap di luar cakupan perubahan ini.

## Considered Options

- **Membuat checklist harian / sheet `Schedules` terpisah dari `Habit`**: ditolak karena melanggar model satu daftar di `GLOSSARY.md` dan menduplikasi pelacakan `Check-in` serta `Streak` untuk kebiasaan yang sama.
- **Menyisipkan notifikasi Web Push per-jam di Apps Script**: ditolak karena trigger Apps Script hanya berjalan tiap ~10 menit (`ADR-0003`), tidak dirancang sebagai alarm presisi tiap jam, dan menambah kompleksitas kuota/state per-Habit.
- **Tetap mengizinkan tombol `▲`/`▼` bebas di atas `Habit` terjadwal**: ditolak karena daftar `Today` dan `Settings` mengurutkan `Habit` terjadwal berdasarkan jam lokalnya sehingga pertukaran `sortOrder` tidak terlihat kecuali pada jam yang sama persis.
