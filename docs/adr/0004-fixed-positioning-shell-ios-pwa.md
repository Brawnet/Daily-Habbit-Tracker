# Shell Layout PWA Menggunakan Arsitektur --app-height dalam Normal Document Flow

Pada aplikasi iOS Home Screen PWA (`display-mode: standalone`) dengan meta tag `viewport-fit=cover` dan `apple-mobile-web-app-status-bar-style=black-translucent`, viewport dirender dari koordinat paling atas layar ($y=0$), merembes ke balik status bar / Dynamic Island notch. Namun, di mode standalone WebKit iOS menghitung unit `100dvh` sebagai tinggi layar dikurangi tinggi status bar (misal pada iPhone 11: 896pt − 48pt = 848pt). Menggunakan `position: fixed; inset: 0;` pada elemen root atau shell juga gagal karena WebKit mengunci elemen fixed ke dalam clipping box selebar 848pt, memotong bilah navigasi bawah dan menyisakan celah strip gelap kosong di bawah layar.

Karena itu, root dan shell layout (`html, body, #app, .shell-layout`) tetap dipertahankan dalam **normal document flow** menggunakan custom property `--app-height`:
1. Di mode browser (Safari tab), `--app-height` bernilai `100dvh` (menyesuaikan dinamis dengan bilah URL Safari).
2. Di mode standalone PWA, `--app-height` di-bootstrap awal menjadi `100vh` (baik via script inline bootstrap di `index.html` berbasis `navigator.standalone` maupun via `@media (display-mode: standalone)`). Selain bootstrap awal tersebut, runtime JavaScript (`shell.js` via `computeAppHeight()`) melakukan sinkronisasi dinamis ukuran piksel fisik layar penuh (`${screenH}px`) khusus untuk iOS standalone PWA saat mount serta reaktif pada event `resize` dan `orientationchange`, mengeliminasi pemotongan status bar dan menjaga bilah navigasi bawah tetap pas di layar.

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

Semua perlindungan notch dan home indicator tetap dikelola secara modular oleh nilai safe-area dan posisi overlay di dalam `.shell-layout` (yang memiliki `position: relative` tanpa pernah memakai `position: fixed` pada root shell maupun `#bottom-nav`):
- Header: `padding-top: calc(env(safe-area-inset-top, 0px) + 12px)`
- Floating Bottom Nav (`#bottom-nav`): ditempatkan dengan `position: absolute; z-index: 30; bottom: max(12px, env(safe-area-inset-bottom, 12px))` serta inset horizontal `max(16px, env(safe-area-inset-left/right, 0px))` dan `max-width: 380px` terpusat pada layar lebar agar konten tab tetap dapat digulir di belakang pil navigasi mengambang.
- Scroll Clearance (`#tab-content`): `padding-bottom: calc(max(12px, env(safe-area-inset-bottom, 12px)) + 88px)` agar kartu atau editor paling bawah tetap bebas dari area pill saat digulir penuh.
- Toast Floating Container: `bottom: calc(max(12px, env(safe-area-inset-bottom, 12px)) + 84px)` (dengan `z-index: 50` di atas pill).

Untuk tampilan `#bottom-nav`, implementasi menggunakan pil mengambang solid dan datar tanpa efek kaca (`#FFFFFF` dengan border `#E6E4DF` pada Light mode dan `#000000` solid dengan border `#33302C` pada Dark mode, tanpa `backdrop-filter`, gradasi, maupun bevel inset) agar bersih dari transparansi dan konsisten 60fps di iOS Safari/WebKit maupun Android Chrome.

## Considered Options

- **`position: fixed; inset: 0;`**: ditolak karena WebKit iOS membatasi containing block fixed element pada 848pt, memotong navigasi bawah.
- **`calc(100dvh + env(safe-area-inset-top))` dengan `position: fixed`**: ditolak karena `overflow: hidden` pada `html, body` dan batasan clipping fixed WebKit memotong elemen di koordinat 848pt.
- **`-webkit-fill-available`**: ditolak karena berperilaku tidak konsisten antar versi iOS Safari dan deprecated pada beberapa implementasi modern.
- **`position: fixed` pada floating `#bottom-nav`**: ditolak karena akan terjebak pada clipping box 848pt di mode standalone WebKit iOS; diganti `position: absolute` di dalam `.shell-layout` (`position: relative`).
- **Efek kaca tembus pandang (`Liquid Glass` dengan `backdrop-filter` / `::before` gradasi / SVG `feDisplacementMap`)**: ditolak demi permukaan solid datar (`#FFFFFF` Light / `#000000` Dark) yang bebas gradasi, tidak tembus tulisan di belakang bar, dan didukung seragam di semua browser.
