import { describe, it, expect } from 'vitest';
import { isIOSStandalone, computeAppHeight } from './viewport.js';

describe('ui/viewport: isIOSStandalone()', () => {
  it('detects standalone mode when navigator.standalone is true (WebKit iOS)', () => {
    const mockWin = { matchMedia: () => ({ matches: false }) };
    const mockNav = { standalone: true, userAgent: 'Mozilla/5.0 (iPhone)' };
    expect(isIOSStandalone(mockWin, mockNav)).toBe(true);
  });

  it('detects iOS standalone mode when display-mode matches on iOS device', () => {
    const mockWin = { matchMedia: (query) => ({ matches: query.includes('standalone') }) };
    const mockNav = { standalone: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)' };
    expect(isIOSStandalone(mockWin, mockNav)).toBe(true);
  });

  it('returns false for Android standalone to prevent desktop/Android PWA layout pollution', () => {
    const mockWin = { matchMedia: (query) => ({ matches: query.includes('standalone') }) };
    const mockNav = { standalone: undefined, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0 Mobile' };
    expect(isIOSStandalone(mockWin, mockNav)).toBe(false);
  });

  it('returns false for desktop browsers and standard non-standalone tabs', () => {
    const mockWin = { matchMedia: () => ({ matches: false }) };
    const mockNav = { standalone: false, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };
    expect(isIOSStandalone(mockWin, mockNav)).toBe(false);
  });
});

describe('ui/viewport: computeAppHeight()', () => {
  it('returns null for non-standalone mode to let CSS 100dvh govern layout', () => {
    const result = computeAppHeight({
      innerHeight: 768,
      screenHeight: 896,
      screenWidth: 414,
      isStandalone: false,
      isPortrait: true,
    });
    expect(result).toBeNull();
  });

  it('returns exact physical screen height in portrait iOS standalone mode (iPhone 11)', () => {
    // Settled or transient launch: screenHeight (896) fills the entire screen
    const result = computeAppHeight({
      innerHeight: 848,
      screenHeight: 896,
      screenWidth: 414,
      isStandalone: true,
      isPortrait: true,
    });
    expect(result).toBe('896px');
  });

  it('returns exact physical screen height in portrait iOS standalone mode (iPhone 15 Pro Dynamic Island)', () => {
    const result = computeAppHeight({
      innerHeight: 793,
      screenHeight: 852,
      screenWidth: 393,
      isStandalone: true,
      isPortrait: true,
    });
    expect(result).toBe('852px');
  });

  it('returns shorter dimension in landscape standalone mode', () => {
    const result = computeAppHeight({
      innerHeight: 414,
      screenHeight: 896,
      screenWidth: 414,
      isStandalone: true,
      isPortrait: false,
    });
    expect(result).toBe('414px');
  });

  it('handles empty or missing parameters gracefully', () => {
    expect(computeAppHeight()).toBeNull();
    expect(computeAppHeight({})).toBeNull();
    expect(computeAppHeight({ isStandalone: true })).toBeNull();
  });
});
