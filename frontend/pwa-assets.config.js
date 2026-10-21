import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headSuffix: '',
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#faf8f5' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#faf8f5' },
    },
  },
  images: ['public/icon.svg'],
});
