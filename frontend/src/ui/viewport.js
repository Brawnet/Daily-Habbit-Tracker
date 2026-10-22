/**
 * Viewport layout helpers for iOS PWA standalone shell sizing.
 *
 * Provides pure calculations to resolve --app-height in pixels for iOS standalone mode,
 * ensuring the layout fills the full physical screen height without status-bar subtraction.
 */

/**
 * Detects whether the current runtime is an iOS Home Screen standalone PWA.
 * Targets iOS WebKit exclusively to avoid polluting Android or Desktop PWAs.
 *
 * @param {Window} [win]
 * @param {Navigator} [nav]
 * @returns {boolean}
 */
export function isIOSStandalone(
  win = typeof window !== 'undefined' ? window : undefined,
  nav = typeof navigator !== 'undefined' ? navigator : undefined
) {
  if (!win || !nav) return false;
  // Standard WebKit standalone property
  if (nav.standalone === true) return true;

  const ua = nav.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);

  if (isIOS && typeof win.matchMedia === 'function') {
    try {
      return win.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Computes the exact CSS height in pixels for the root shell in iOS standalone mode.
 *
 * @param {Object} [params]
 * @param {number} [params.innerHeight] - window.innerHeight
 * @param {number} [params.screenHeight] - window.screen?.height
 * @param {number} [params.screenWidth] - window.screen?.width
 * @param {boolean} [params.isStandalone] - Whether running as iOS standalone PWA
 * @param {boolean} [params.isPortrait] - Whether current orientation is portrait
 * @returns {string|null} Pixel string (e.g. '896px') or null for standard browser mode
 */
export function computeAppHeight({
  innerHeight = 0,
  screenHeight = 0,
  screenWidth = 0,
  isStandalone = false,
  isPortrait = true,
} = {}) {
  // Only override --app-height in iOS standalone mode; browser tabs and desktop PWAs use CSS 100dvh
  if (!isStandalone) {
    return null;
  }

  const screenH = typeof screenHeight === 'number' && screenHeight > 0 ? screenHeight : 0;
  const screenW = typeof screenWidth === 'number' && screenWidth > 0 ? screenWidth : 0;
  const innerH = typeof innerHeight === 'number' && innerHeight > 0 ? innerHeight : 0;

  if (isPortrait) {
    // In iOS portrait standalone, viewport renders full-bleed behind status bar.
    // Use physical screen height to prevent WebKit's transient status-bar subtraction (e.g. 848px vs 896px).
    const portraitH = screenH > 0 ? screenH : innerH;
    return portraitH > 0 ? `${Math.round(portraitH)}px` : null;
  }

  // In landscape standalone, height is bounded by the shorter screen dimension or innerHeight
  const landscapeH = screenH > 0 && screenW > 0 ? Math.min(screenH, screenW) : innerH;
  return landscapeH > 0 ? `${Math.round(landscapeH)}px` : null;
}
