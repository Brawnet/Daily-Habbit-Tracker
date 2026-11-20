# Kebijakan Pengeditan Journal Entry Lampau, Batas Backfill 7 Hari, dan Relokasi Journal History

Sebelumnya, setiap `Journal Entry` langsung dikunci read-only setelah pergantian `Day` (`day < today`), baik di klien maupun di Apps Script (`LOCKED` bila `printedToDiaryAt` terisi), sedangkan daftar `Journal History` menumpang di tab `History` bersama heatmap `Habit`. Desain tersebut membuat pengguna tidak bisa memperbaiki salah ketik atau melengkapi refleksi yang tertinggal, serta memecah alur `Journals` dari tab `Activities`.

Diputuskan arsitektur tiga lapis untuk `Journal Entry`:
1. **Edit vs. buat baru di `Device`**: `Journal Entry` yang sudah ada bebas diedit kembali untuk semua `Day` hingga hari ini (`day <= today`) lewat alur baca-dulu lalu tap **Edit Journal** pada tampilan terpisah `Entry Reader` (tidak pernah langsung masuk mode edit agar pembacaan santai aman dari sentuhan tak sengaja). Pembuatan `Journal Entry` baru lewat date picker pada **Write a Journal** dibatasi maksimal 7 hari ke belakang (`[today - 7 hari, today]` inklusif), sementara tanggal masa depan tetap dilarang.
2. **Sinkronisasi server toleran-offline (`gas-backend/Code.gs`)**: Lock `printedToDiaryAt` pada hari lampau dihapus sehingga server menerima semua `day <= todayJakarta` melalui LWW dan hanya menolak tanggal masa depan atau format tanggal tidak valid sebagai `LOCKED`. Pembatasan 7 hari pembuatan baru sengaja hanya dijalankan di `Device`: jika pengguna menulis `Journal Entry` secara sah saat offline lalu baru menyinkronkan lebih dari 7 hari kemudian, server tidak boleh menolaknya. `syncDiaryEntries()` sudah mendukung pembaruan paragraf secara in-place di Google Docs `Diary` ketika `serverUpdatedAt > printedToDiaryAt`.
3. **Batas `Check-in` tetap ketat & relokasi UI**: `Check-in` untuk `Habit` tetap terkunci pada hari ini dan kemarin saja, dan `Linked Activity` otomatis tetap hanya berlaku ketika menyimpan `Journal Entry` hari ini (`day === today`). Seluruh antarmuka **Journal History** dipindahkan keluar dari tab `History` ke menu dua pilihan `Activities → Journals` (**Write a Journal** vs. **Journal History**).

## Considered Options

- **Mengunci permanen setelah hari berganti (`day === today` saja)**: ditolak karena menghalangi perbaikan atau pelengkapan refleksi lampau meski Google Docs `Diary` sudah mendukung pembaruan in-place.
- **Menegakkan batas 7 hari pembuatan baru di server (`Code.gs`)**: ditolak karena akan menolak `Journal Entry` yang dibuat sah secara offline dalam jendela 7 hari bila `Device` baru online kembali lebih dari 7 hari kemudian.
- **Membiarkan `Journal History` tetap muncul di tab `History` dan `Activities`**: ditolak agar tab `History` fokus murni sebagai riwayat `Habit` tanpa duplikasi navigasi.
