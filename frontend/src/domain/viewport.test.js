import { describe, it, expect } from 'vitest';
import { computeAppHeight } from './viewport.js';

describe('domain/viewport: computeAppHeight()', () => {
  it('returns null for browser tab mode to let CSS 100dvh govern layout', () => {
    const result = computeAppHeight({
      innerHeight: 768,
      visualViewportHeight: 768,
      screenHeight: 896,
      safeTop: 48,
      isStandalone: false,
      isPortrait: true,
    });
    expect(result).toBeNull();
  });

  it('computes exact screen height for settled iPhone 11 standalone portrait', () => {
    // Settled iPhone 11 / XR: screen is 896pt, window reports 896px
    const result = computeAppHeight({
      innerHeight: 896,
      visualViewportHeight: 896,
      screenHeight: 896,
      safeTop: 48,
      isStandalone: true,
      isPortrait: true,
    });
    expect(result).toBe('896px');
  });

  it('compensates for WebKit status-bar subtraction during iPhone 11 launch transient (848px + 48px)', () => {
    // iPhone 11 at launch: innerHeight is 848 (896 - 48 safeTop)
    const result = computeAppHeight({
      innerHeight: 848,
      visualViewportHeight: 848,
      screenHeight: 896,
      safeTop: 48,
      isStandalone: true,
      isPortrait: true,
    });
    expect(result).toBe('896px');
  });

  it('computes exact screen height for settled iPhone 15 Pro (Dynamic Island 852px)', () => {
    const result = computeAppHeight({
      innerHeight: 852,
      visualViewportHeight: 852,
      screenHeight: 852,
      safeTop: 59,
      isStandalone: true,
      isPortrait: true,
    });
    expect(result).toBe('852px');
  });

  it('compensates for Dynamic Island status-bar omission during launch transient (793px + 59px)', () => {
    // 852 - 59 = 793px
    const result = computeAppHeight({
      innerHeight: 793,
      visualViewportHeight: 793,
      screenHeight: 852,
      safeTop: 59,
      isStandalone: true,
      isPortrait: true,
    });
    expect(result).toBe('852px');
  });

  it('computes usable height in standalone landscape mode', () => {
    const result = computeAppHeight({
      innerHeight: 414,
      visualViewportHeight: 414,
      screenHeight: 896,
      safeTop: 0,
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
