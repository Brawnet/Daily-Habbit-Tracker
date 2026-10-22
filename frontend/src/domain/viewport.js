/**
 * Viewport domain logic for iOS PWA standalone shell sizing.
 *
 * Implements pure calculations to resolve --app-height in pixels for standalone mode,
 * compensating for WebKit status-bar subtraction anomalies and transient launch timing.
 */

/**
 * Computes the exact CSS height string for the root shell layout.
 *
 * @param {Object} params
 * @param {number} [params.innerHeight] - window.innerHeight
 * @param {number} [params.visualViewportHeight] - window.visualViewport?.height
 * @param {number} [params.screenHeight] - window.screen?.height
 * @param {number} [params.safeTop] - Resolved safe-area-inset-top in pixels
 * @param {boolean} [params.isStandalone] - Whether running as Home Screen standalone PWA
 * @param {boolean} [params.isPortrait] - Whether current orientation is portrait
 * @returns {string|null} Pixel string (e.g. '896px') or null for browser tab (which uses 100dvh)
 */
export function computeAppHeight({
  innerHeight = 0,
  visualViewportHeight = 0,
  screenHeight = 0,
  safeTop = 0,
  isStandalone = false,
  isPortrait = true,
} = {}) {
  // In standard browser tabs (non-standalone), defer to CSS 100dvh
  if (!isStandalone) {
    return null;
  }

  // Ensure safe positive numbers
  const innerH = typeof innerHeight === 'number' && innerHeight > 0 ? innerHeight : 0;
  const vvH = typeof visualViewportHeight === 'number' && visualViewportHeight > 0 ? visualViewportHeight : innerH;
  const screenH = typeof screenHeight === 'number' && screenHeight > 0 ? screenHeight : 0;
  const topSafe = typeof safeTop === 'number' && safeTop >= 0 ? safeTop : 0;

  if (innerH === 0 && vvH === 0 && screenH === 0) {
    return null;
  }

  // Standalone portrait mode
  if (isPortrait) {
    // If screen height is known and matches or bounds innerHeight
    if (screenH > 0) {
      // Check if innerHeight is short by approximately topSafe (WebKit status bar omission)
      const isShortBySafeTop = topSafe > 0 && Math.abs(screenH - (innerH + topSafe)) <= 4;
      if (isShortBySafeTop) {
        return `${Math.round(screenH)}px`;
      }
      // If innerHeight or visualViewport already matches full screen height
      if (Math.abs(innerH - screenH) <= 2 || Math.abs(vvH - screenH) <= 2) {
        return `${Math.round(screenH)}px`;
      }
      // If innerHeight + topSafe exceeds screenHeight, bound by screenH
      if (innerH + topSafe >= screenH) {
        return `${Math.round(screenH)}px`;
      }
    }

    // Fallback using visualViewport / innerHeight + safeTop compensation
    const bestH = Math.max(innerH, vvH);
    const resolvedH = topSafe > 0 && screenH > 0 && bestH < screenH ? Math.min(bestH + topSafe, screenH) : bestH;
    return `${Math.round(resolvedH)}px`;
  }

  // Standalone landscape mode: use visualViewport or innerHeight
  const landscapeH = Math.max(innerH, vvH);
  if (landscapeH > 0) {
    return `${Math.round(landscapeH)}px`;
  }

  return screenH > 0 ? `${Math.round(screenH)}px` : null;
}
