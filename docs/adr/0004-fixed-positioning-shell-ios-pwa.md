# Shell Layout PWA Menggunakan Arsitektur --app-height dalam Normal Document Flow

Pada aplikasi iOS Home Screen PWA (`display-mode: standalone`) dengan meta tag `viewport-fit=cover` dan `apple-mobile-web-app-status-bar-style=black-translucent`, viewport dirender dari koordinat paling atas layar ($y=0$), merembes ke balik status bar / Dynamic Island notch. Namun, di mode standalone WebKit iOS menghitung unit `100dvh` sebagai tinggi layar dikurangi tinggi status bar (misal pada iPhone 11: 896pt − 48pt = 848pt). Menggunakan `position: fixed; inset: 0;` pada elemen root atau shell juga gagal karena WebKit mengunci elemen fixed ke dalam clipping box selebar 848pt, memotong bilah navigasi bawah dan menyisakan celah strip gelap kosong di bawah layar.

Karena itu, root dan shell layout (`html, body, #app, .shell-layout`) tetap dipertahankan dalam **normal document flow** menggunakan custom property `--app-height`:
1. Di mode browser (Safari tab), `--app-height` bernilai `100dvh` (menyesuaikan dinamis dengan bilah URL Safari).
2. Di mode standalone PWA, `--app-height` di-override menjadi `100vh` (baik via script inline bootstrap di `index.html` berbasis `navigator.standalone` maupun via `@media (display-mode: standalone)`). Di iOS WebKit standalone, `100vh` merepresentasikan tinggi fisik layar penuh secara tepat (896pt pada iPhone 11) tanpa pemotongan status bar.

```css
:root {
  --app-height: 100dvh;
}

@media all and (display-mode: standalone) {
  :root {
    --app-height: 100vh;
  }
}

html, body, #app, .shell-layout {
  width: 100%;
  height: var(--app-height, 100dvh);
  min-height: var(--app-height, 100dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

Semua perlindungan notch dan home indicator tetap dikelola secara modular oleh nilai safe-area padding:
- Header: `calc(env(safe-area-inset-top, 0px) + 12px)`
- Bottom Nav: `padding-bottom: max(12px, env(safe-area-inset-bottom, 12px))`
- Toast Floating Container: `bottom: calc(max(12px, env(safe-area-inset-bottom, 12px)) + 64px)`

## Considered Options

- **`position: fixed; inset: 0;`**: ditolak karena WebKit iOS membatasi containing block fixed element pada 848pt, memotong navigasi bawah.
- **`calc(100dvh + env(safe-area-inset-top))` dengan `position: fixed`**: ditolak karena `overflow: hidden` pada `html, body` dan batasan clipping fixed WebKit memotong elemen di koordinat 848pt.
- **`-webkit-fill-available`**: ditolak karena berperilaku tidak konsisten antar versi iOS Safari dan deprecated pada beberapa implementasi modern.
