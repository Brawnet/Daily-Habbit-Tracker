import { describe, it, expect } from 'vitest';
import { ACTIONS, ERRORS, STORES, ACTIVITY_STATUS, ACTIVITY_TYPES } from './shared/contracts.js';

describe('Contracts initialization', () => {
  it('exposes defined constants', () => {
    expect(ACTIONS.PING).toBe('ping');
    expect(ERRORS.LOCKED).toBe('LOCKED');
    expect(STORES.HABITS).toBe('habits');
    expect(STORES.ACTIVITIES).toBe('activities');
    expect(ACTIVITY_STATUS.BACKLOG).toBe('Backlog');
    expect(ACTIVITY_STATUS.IN_PROGRESS).toBe('In Progress');
    expect(ACTIVITY_STATUS.COMPLETED).toBe('Completed');
    expect(ACTIVITY_TYPES).toContain('Book');
    expect(ACTIVITY_TYPES).toContain('Course');
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

  it('defines dynamic app-height architecture and safe area variables in styles.css and index.html', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const css = readFileSync(resolve(__dirname, './styles.css'), 'utf8');

    expect(html).toContain("document.documentElement.style.setProperty('--app-height', '100vh')");
    expect(css).toContain('--app-height: 100dvh');
    expect(css).toContain('--app-height: 100vh');
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

describe('PWA & mobile network exposure contract', () => {
  it('configures server.host and preview.host in vite.config.js for mobile LAN access', async () => {
    const viteConfig = (await import('../vite.config.js')).default;
    expect(viteConfig.server?.host).toBe(true);
    expect(viteConfig.preview?.host).toBe(true);
  });

  it('disables automatic registerSW injection in VitePWA to consolidate single registration handler', async () => {
    const viteConfig = (await import('../vite.config.js')).default;
    const pwaPlugin = viteConfig.plugins?.find((p) => Array.isArray(p) ? p.some(x => x.name === 'vite-plugin-pwa') : p?.name === 'vite-plugin-pwa');
    expect(viteConfig).toBeDefined();
  });
});

describe('Service Worker mobile compatibility contract', () => {
  it('does not register service worker as module type to ensure Android/Samsung Internet compatibility', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const updateSource = readFileSync(resolve(__dirname, './pwa/update.js'), 'utf8');

    expect(updateSource).not.toContain("type: 'module'");
    expect(updateSource).not.toContain('type: "module"');
  });
});
