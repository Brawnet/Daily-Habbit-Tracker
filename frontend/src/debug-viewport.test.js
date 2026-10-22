import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { measureViewport, recordSnapshot, toggleViewportDebug } from './debug-viewport.js';

describe('debug-viewport.js [DEBUG-vp01]', () => {
  it('enforces that every line in src/debug-viewport.js is tagged with [DEBUG-vp01]', () => {
    const filePath = resolve(__dirname, './debug-viewport.js');
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    expect(lines.length).toBeGreaterThan(50);
    const untagged = lines
      .map((line, idx) => (line.includes('[DEBUG-vp01]') ? null : idx + 1))
      .filter(Boolean);

    expect(untagged).toEqual([]);
  });

  describe('measureViewport() & event timeline', () => {
    let origWindow, origDocument;
    const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const elements = new Map();

    function createMockEl(id, rect = { top: 0, bottom: 800, height: 800, width: 390 }) {
      const el = {
        id,
        style: {},
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        getBoundingClientRect: () => rect,
        appendChild: vi.fn(),
        innerHTML: '',
        addEventListener: vi.fn(),
      };
      elements.set(id, el);
      return el;
    }

    beforeEach(() => {
      elements.clear();
      origWindow = global.window;
      origDocument = global.document;

      const mockBody = {
        appendChild: vi.fn((child) => {
          if (child && child.id) elements.set(child.id, child);
        }),
      };

      const mockDoc = {
        body: mockBody,
        documentElement: {
          style: {
            getPropertyValue: vi.fn(() => '100dvh'),
          },
        },
        getElementById: vi.fn((id) => elements.get(id) || null),
        createElement: vi.fn((tag) => createMockEl(`el-${elements.size}`)),
        addEventListener: vi.fn(),
      };

      const mockWin = {
        innerHeight: 800,
        innerWidth: 390,
        visualViewport: {
          height: 800,
          width: 390,
          offsetTop: 0,
          scale: 1,
          addEventListener: vi.fn(),
        },
        screen: {
          height: 852,
          width: 393,
          availHeight: 852,
          orientation: { type: 'portrait-primary' },
        },
        devicePixelRatio: 3,
        getComputedStyle: vi.fn(() => ({
          getPropertyValue: vi.fn(() => '100dvh'),
          paddingTop: '47px',
          paddingBottom: '34px',
          paddingLeft: '0px',
          paddingRight: '0px',
        })),
        addEventListener: vi.fn(),
        location: { search: '?debug=viewport', hash: '' },
      };

      global.document = mockDoc;
      global.window = mockWin;
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)',
          standalone: true,
        },
        configurable: true,
        writable: true,
      });

      // App elements
      createMockEl('app', { top: 0, bottom: 852, height: 852, width: 393 });
      createMockEl('bottom-nav', { top: 792, bottom: 852, height: 60, width: 393 });
      createMockEl('tab-content', { top: 60, bottom: 792, height: 732, width: 393 });
      createMockEl('debug-probe-vh', { top: 0, bottom: 852, height: 852, width: 1 });
      createMockEl('debug-probe-dvh', { top: 0, bottom: 800, height: 800, width: 1 });
      createMockEl('debug-probe-svh', { top: 0, bottom: 800, height: 800, width: 1 });
      createMockEl('debug-probe-lvh', { top: 0, bottom: 852, height: 852, width: 1 });
      createMockEl('debug-probe-safe', { top: 0, bottom: 0, height: 0, width: 1 });
    });

    afterEach(() => {
      global.window = origWindow;
      global.document = origDocument;
      if (origNavDesc) {
        Object.defineProperty(globalThis, 'navigator', origNavDesc);
      } else {
        delete globalThis.navigator;
      }
    });

    it('collects measurements, CSS units, safe area insets, and calculates verdict', () => {
      const data = measureViewport();
      expect(data).toBeDefined();
      expect(data.winH).toBe(800);
      expect(data.screenH).toBe(852);
      expect(data.vh).toBe(852);
      expect(data.dvh).toBe(800);
      expect(data.safeTop).toBe(47);
      expect(data.safeBottom).toBe(34);
      expect(data.isStandalone).toBe(true);
      expect(data.iosVer).toBe('iOS 18.1');
      // navBottom (852) vs winH (800) -> cut off by 52px -> red verdict
      expect(data.delta).toBe(52);
      expect(data.isGreen).toBe(false);
    });

    it('returns green verdict when navBottom fits within visible window boundary', () => {
      createMockEl('bottom-nav', { top: 740, bottom: 800, height: 60, width: 393 });
      const data = measureViewport();
      expect(data.delta).toBe(0);
      expect(data.isGreen).toBe(true);
    });

    it('records event timeline snapshots with relative millisecond timestamp and label', () => {
      const snap1 = recordSnapshot('test-launch');
      expect(snap1).toBeDefined();
      expect(snap1.label).toBe('test-launch');
      expect(snap1.data).toBeDefined();

      const snap2 = recordSnapshot('test-focus');
      expect(snap2.label).toBe('test-focus');
      expect(snap2.id).toBeGreaterThan(snap1.id);
    });

    it('toggles overlay with toggleViewportDebug', () => {
      toggleViewportDebug();
      expect(elements.has('debug-viewport-overlay')).toBe(true);
    });
  });
});
