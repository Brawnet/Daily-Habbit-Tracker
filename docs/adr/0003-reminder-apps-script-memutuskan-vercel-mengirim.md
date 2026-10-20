# Reminder: Apps Script memutuskan, Vercel Function mengirim Web Push

Web Push mewajibkan tanda tangan VAPID (ECDSA P-256) dan enkripsi payload; Apps Script tidak menyediakan ECDSA, jadi tidak bisa mengirim push sendiri. Maka trigger Apps Script (tiap 10 menit) yang memutuskan *kapan* Reminder dikirim — karena hanya Apps Script yang tahu jam Reminder dan apakah masih ada Habit tanpa Check-in atau belum ada Journal Entry — lalu memanggil satu Vercel Serverless Function (`/api/send-push`, dilindungi shared secret) yang hanya bertugas menandatangani dan mengirim pesan dengan library `web-push`. Function itu sengaja "bodoh": tidak menyimpan state dan tidak punya jadwal.

## Considered Options

- Vercel Cron saja: ditolak; paket Hobby hanya 1x/hari, tidak presisi, dan jadwalnya statis sehingga jam Reminder dari Settings tidak bisa dipakai.
- Cloudflare Workers + Cron Trigger: ditolak; menambah akun/layanan kedua.
- Implementasi ECDSA manual di Apps Script: ditolak; rapuh dan sulit diaudit.
