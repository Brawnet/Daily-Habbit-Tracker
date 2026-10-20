# Google Sheets sumber kebenaran; Diary (Google Docs) hanya salinan satu arah

Isi Journal Entry disimpan di Sheets dan juga dicetak ke Google Docs sebagai Diary. Menyimpan di dua tempat yang sama-sama "benar" akan membuat keduanya tidak sinkron, dan membaca riwayat dari Docs sulit serta lambat. Maka Sheets adalah satu-satunya sumber data yang dibaca aplikasi; Docs hanya ditulis oleh Apps Script dan tidak pernah dibaca balik. Konsekuensinya: Journal Entry terkunci (read-only) setelah Day-nya lewat, dan trigger harian Apps Script mencetak entri yang sudah terkunci ke Diary (satu file per tahun, urut kronologis; entri yang terlambat tersinkron disisipkan di posisi tanggalnya), sehingga isi Docs selalu sama dengan versi akhir.

## Consequences

- Mengedit teks langsung di Google Docs tidak akan pernah muncul di aplikasi.
- Jangan "memperbaiki" ini dengan membuat PWA membaca Docs.
