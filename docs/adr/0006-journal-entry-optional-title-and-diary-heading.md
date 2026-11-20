# Judul Opsional Journal Entry, Kolom ke-6 Google Sheets, dan Heading 3 pada Diary

Sebelumnya, `Journal Entry` dirancang sama sekali tanpa judul (`SPEC.md` §1) dan langsung menampilkan `Day` sebagai kepala entri di seluruh tampilan *Journal History*, *Entry Reader*, dan Google Docs `Diary`. Keterbatasan tersebut membuat pengguna kesulitan mengenali topik refleksi dengan cepat saat memindai daftar riwayat atau mencari entri lampau, padahal sebagian pengguna ingin memberi tajuk singkat sementara sebagian lainnya tetap ingin langsung menulis tanpa diwajibkan mengisi judul.

Diputuskan desain kompatibel-mundur berikut untuk judul opsional `Journal Entry`:
1. **Model domain, aturan status tertulis, & fallback `Day` dinamis**:
   - `Journal Entry` menambah properti opsional `title` (`string`, single-line hasil *trim*, maks. 120 karakter, `''` saat kosong).
   - Sebuah `Journal Entry` dianggap tertulis/ada bila `!isBlank(title) || !isBlank(content)` pada seluruh titik evaluasi: lencana *Done ✓* di *Activities Hub*, ringkasan & jumlah entri di *Journals Menu*, `Linked Activity` otomatis (`day === today` saja), kondisi *Reminder*, daftar *Journal History*, serta ekspor Google Docs `Diary`.
   - Saat `title` kosong, antarmuka selalu melakukan *fallback* dinamis pada waktu tampil ke `Day` milik entri itu sendiri (`formatShort(day)` di kartu *Journal History*, `formatLong(day)` di `<h1>` *Entry Reader*, serta `Title (defaults to ${formatLong(day)})` sebagai *placeholder* input judul di editor) tanpa menyalin teks tanggal ke data tersimpan dan tanpa menduplikasi subjudul tanggal.
   - Pencarian offline mencocokkan token AND (case- & diacritic-insensitive) lintas `title`, `content`, dan representasi `Day`, lalu menyorot kecocokan dengan `<mark>` baik di judul kartu maupun di cuplikan isi.
2. **Penambahan `title` sebagai Kolom ke-6 Google Sheets (`Journal_Entries`)**:
   - Di Google Sheets `Journal_Entries`, `title` ditambahkan di ujung sebagai Kolom ke-6 setelah `serverUpdatedAt` (`['day', 'content', 'updatedAt', 'printedToDiaryAt', 'serverUpdatedAt', 'title']`) dengan sanitasi/desanitasi *formula injection* (`=`, `+`, `-`, `@`).
   - Pemilihan posisi paling kanan menjaga indeks kolom lama (`row[0]`–`row[4]`) tetap kompatibel bagi sheet 5-kolom yang sudah terpasang; sel `row[5]` yang tidak ada dibaca sebagai `''`, dan `setup()` maupun `sync` otomatis memperluas baris header 5 kolom menjadi 6 kolom tanpa memigrasikan data lama secara manual.
3. **Pemisahan `Heading 2` (`Day`) dan `Heading 3` (`title`) di Google Docs `Diary`**:
   - Di `Diary` tahunan, `Heading 2` dipertahankan ketat sebagai `EEEE, d MMMM yyyy` agar `parseDiaryHeading()` dan `findChronologicalInsertIndex()` tetap stabil dalam memindai posisi kronologis serta memperbarui blok entri secara *in-place*.
   - Jika `title` tidak kosong, Apps Script menyisipkan satu paragraf **`Heading 3`** berisi `title` tepat di bawah `Heading 2` (dihilangkan bila `title` kosong), sedangkan penghapusan seksi hanya dilakukan apabila `title` dan `content` keduanya kosong.

## Considered Options

- **Menyisipkan `title` di Kolom ke-2 sebelum `content` (`['day', 'title', 'content', ...]`)**: ditolak karena akan menggeser indeks kolom lama pada Spreadsheet milik pengguna yang sudah berjalan dan memaksa migrasi baris eksisting yang berisiko merusak pembacaan `updatedAt` / `printedToDiaryAt` selama transisi.
- **Menanamkan judul ke dalam string HTML `content` (mis. tag `<h2 class="journal-title">`)**: ditolak karena mencampurkan metadata judul terstruktur ke dalam markup jawaban prompt, membuat pencarian judul dan ekspor `Diary` bergantung pada parsing HTML rapuh, serta menyulitkan kueri atau pembacaan langsung di Google Sheets.
- **Menggabungkan judul ke dalam paragraf `Heading 2` (`Tuesday, 20 October 2026 — Judul`)**: ditolak karena melanggar parser kronologis `parseDiaryHeading()` yang mengasumsikan `Heading 2` murni tanggal, serta rawan bentrok bila pengguna mengganti judul atau memakai karakter khusus dalam judul.
