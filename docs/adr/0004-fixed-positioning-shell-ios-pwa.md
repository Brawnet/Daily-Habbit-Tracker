# Shell Layout PWA Menggunakan Fixed Inset-0, Bukan Unit Viewport (100dvh/100vh)

## Konteks & Masalah

Pada aplikasi iOS Home Screen PWA (`display-mode: standalone`) dengan meta tag `viewport-fit=cover` dan `apple-mobile-web-app-status-bar-style=black-translucent`, viewport dirender dari koordinat paling atas layar ($y=0$), merembes ke balik status bar / Dynamic Island notch.

Namun, di mode standalone ini WebKit iOS menghitung unit `100vh` dan `100dvh` sebagai tinggi layar dikurangi tinggi status bar (misal pada iPhone 11: 896pt − 48pt = 848pt). Jika container utama (`.shell-layout`) berukuran `height: 100dvh`, container akan berakhir ~48pt lebih pendek dari fisik layar, menimbulkan celah strip gelap kosong di bawah bilah navigasi bawah (`#bottom-nav`), sementara header terkesan terhimpit di bawah status bar.

## Keputusan

Mengganti penentuan tinggi berbasis unit viewport (`100dvh`/`100vh`) dengan pinning penuh ke empat tepi layar menggunakan *fixed positioning*:

```css
html, body {
  height: 100%;
  overflow: hidden;
  overscroll-behavior: none;
}

.shell-layout {
  position: fixed;
  inset: 0;
}
```

Semua perlindungan notch dan home indicator tetap dikelola secara modular oleh nilai safe-area padding:
- Header: `calc(env(safe-area-inset-top, 0px) + 12px)`
- Bottom Nav: `padding-bottom: max(12px, env(safe-area-inset-bottom, 12px))`
- Toast Floating Container: `bottom: calc(max(12px, env(safe-area-inset-bottom, 12px)) + 64px)`

## Considered Options

- **`100dvh` / `100vh` cascade**: ditolak karena WebKit iOS standalone mengecualikan area status bar dari perhitungan viewport height saat `black-translucent` aktif.
- **`calc(100dvh + env(safe-area-inset-top))` via standalone media query**: ditolak karena menambah kompleksitas selektor dan rentan bug saat keyboard virtual muncul atau orientasi layar diputar.
- **`-webkit-fill-available`**: ditolak karena berperilaku tidak konsisten antar versi iOS Safari dan deprecated pada beberapa implementasi modern.
