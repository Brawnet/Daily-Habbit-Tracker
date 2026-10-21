import { describe, it, expect } from 'vitest';
import { ACTIONS, ERRORS, STORES } from './shared/contracts.js';

describe('Contracts initialization', () => {
  it('exposes defined constants', () => {
    expect(ACTIONS.PING).toBe('ping');
    expect(ERRORS.LOCKED).toBe('LOCKED');
    expect(STORES.HABITS).toBe('habits');
  });
});

describe('PWA & iOS standalone layout contract', () => {
  it('defines required viewport, status bar, and theme meta tags in index.html', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
    expect(html).toContain('content="#ffffff"');
    expect(html).toContain('content="#09090b"');
  });

  it('defines dvh and standalone display-mode media queries in styles.css', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, './styles.css'), 'utf8');

    expect(css).toContain('100dvh');
    expect(css).toContain('(display-mode: standalone)');
    expect(css).toContain('--sat: env(safe-area-inset-top, 0px)');
    expect(css).toContain('--sab: env(safe-area-inset-bottom, 0px)');
    expect(css).toContain('max(12px, env(safe-area-inset-bottom, 12px))');
  });
});

describe('PWA icon assets contract', () => {
  it('ensures all required PWA icons and favicon are present with non-zero size', async () => {
    const { existsSync, statSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const requiredAssets = [
      'icon.svg',
      'favicon.ico',
      'apple-touch-icon-180x180.png',
      'pwa-64x64.png',
      'pwa-192x192.png',
      'pwa-512x512.png',
      'maskable-icon-512x512.png',
    ];

    for (const file of requiredAssets) {
      const filePath = resolve(__dirname, '../public', file);
      expect(existsSync(filePath), `Asset ${file} should exist`).toBe(true);
      const stats = statSync(filePath);
      expect(stats.size, `Asset ${file} should not be empty`).toBeGreaterThan(0);
    }
  });
});
