import { test, expect } from '@playwright/test';

test.describe('Habbit App E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Clear IndexedDB before each test to guarantee fresh test isolation
    await page.goto('/');
    await page.evaluate(async () => {
      const dbs = await window.indexedDB.databases?.() || [];
      for (const db of dbs) {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      }
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test('bottom navigation switches between Today, Activities, History, and Settings tabs', async ({ page }) => {
    await expect(page.locator('#today-date')).toBeVisible();

    // Navigate to Activities
    await page.click('button[data-tab="activities"]');
    await expect(page).toHaveURL(/tab=activities/);
    await expect(page.locator('#activities-choice-hub')).toBeVisible();

    // Navigate to Settings
    await page.click('button[data-tab="settings"]');
    await expect(page).toHaveURL(/tab=settings/);
    await expect(page.locator('#heading-habits')).toBeVisible();

    // Navigate to History
    await page.click('button[data-tab="history"]');
    await expect(page).toHaveURL(/tab=history/);

    // Navigate back to Today
    await page.click('button[data-tab="today"]');
    await expect(page).toHaveURL(/tab=today/);
    await expect(page.locator('#today-date')).toBeVisible();
  });

  test('creates a book summary in activities, writes a chapter, and persists across reload', async ({ page }) => {
    // Navigate to Activities tab
    await page.click('button[data-tab="activities"]');
    await expect(page).toHaveURL(/tab=activities/);
    await expect(page.locator('#activities-choice-hub')).toBeVisible();

    // Open Books Summary choice
    await page.click('#choice-books-summary');
    await expect(page.locator('#btn-toggle-add-book')).toBeVisible();

    // Add New Book
    await page.click('#btn-toggle-add-book');
    await expect(page.locator('#form-add-book')).toBeVisible();

    await page.fill('#input-new-book-title', 'Designing Data-Intensive Applications');
    await page.fill('#input-new-book-author', 'Martin Kleppmann');
    await page.click('#btn-save-new-book');

    // Verify book action menu view opens
    await expect(page.locator('#book-action-menu-view')).toBeVisible();
    await expect(page.locator('#book-menu-title')).toContainText('Designing Data-Intensive Applications');

    // Continue Summary (chapter editor)
    await page.click('#btn-choice-continue-summary');
    await expect(page.locator('#editor-chapter-content')).toBeVisible();

    await page.fill('#input-chapter-title', 'Chapter 1: Reliable Systems');
    await page.locator('#editor-chapter-content').fill('Reliability, scalability, and maintainability.');
    await page.click('#btn-save-chapter');

    // Wait for save feedback
    await expect(page.locator('#btn-save-existing-chapter')).toBeVisible({ timeout: 3000 });

    // Reload page to test offline IndexedDB persistence
    await page.reload();
    await page.click('button[data-tab="activities"]');
    await page.click('#choice-books-summary');

    const bookCard = page.locator('.book-item-card', { hasText: 'Designing Data-Intensive Applications' });
    await expect(bookCard).toBeVisible();
    await expect(bookCard).toContainText('Martin Kleppmann');
    await expect(bookCard).toContainText('1 chapter');
  });

  test('creates a habit, completes check-in, and persists across page reload', async ({ page }) => {
    // Navigate to Settings to add habit
    await page.click('button[data-tab="settings"]');
    await page.fill('#input-new-habit', 'Olahraga Pagi 15 Menit');
    await page.click('#btn-add-habit');

    // Verify it appears in active habits list
    await expect(page.locator('#active-habits-list')).toContainText('Olahraga Pagi 15 Menit');

    // Go back to Today tab
    await page.click('button[data-tab="today"]');

    // Verify habit card is visible
    const habitItem = page.locator('li', { hasText: 'Olahraga Pagi 15 Menit' });
    await expect(habitItem).toBeVisible();
    await expect(page.locator('#today-progress')).toContainText('0/1 done');

    // Click check-in button
    const checkinBtn = habitItem.locator('button[data-action="toggle-checkin"]');
    await checkinBtn.click();

    // Progress updates to 1/1 done
    await expect(page.locator('#today-progress')).toContainText('1/1 done');

    // Reload page to test offline IndexedDB persistence
    await page.reload();
    await expect(page.locator('#today-progress')).toContainText('1/1 done');
    await expect(habitItem).toBeVisible();
  });

  test('archives and restores a habit', async ({ page }) => {
    // Add a habit
    await page.click('button[data-tab="settings"]');
    await page.fill('#input-new-habit', 'Membaca Buku');
    await page.click('#btn-add-habit');
    await expect(page.locator('#active-habits-list')).toContainText('Membaca Buku');

    // Archive the habit
    await page.click('button.btn-archive');
    await expect(page.locator('#active-habits-list')).not.toContainText('Membaca Buku');

    // Open archived section
    await page.click('#btn-toggle-archived');
    await expect(page.locator('#archived-habits-list')).toContainText('Membaca Buku');

    // Restore the habit
    await page.click('button.btn-restore');
    await expect(page.locator('#active-habits-list')).toContainText('Membaca Buku');

    // Verify it is back in Today tab
    await page.click('button[data-tab="today"]');
    await expect(page.locator('li', { hasText: 'Membaca Buku' })).toBeVisible();
  });

  test('writes daily journal reflection in activities, autosaves, and displays in History tab', async ({ page }) => {
    // Navigate to Activities tab
    await page.click('button[data-tab="activities"]');
    await expect(page.locator('#activities-choice-hub')).toBeVisible();

    // Open Journals choice
    await page.click('#choice-journals');
    const journalEditor = page.locator('#editor-journal-content');
    await expect(journalEditor).toBeVisible();
    await expect(page.locator('#journal-notes-card')).toHaveCount(0);
    await expect(page.locator('#editor-journal-notes')).toHaveCount(0);

    // Type reflection text
    const testReflection = 'Refleksi hari ini: berhasil menyelesaikan target dengan fokus.';
    await journalEditor.fill(testReflection);

    // Debounce save (800ms) and expect status indicator to be 'Saved'
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });

    // Reload page to ensure content was saved in IndexedDB
    await page.reload();
    await page.click('button[data-tab="activities"]');
    await page.click('#choice-journals');
    await expect(page.locator('#editor-journal-content')).toContainText(testReflection);

    // Switch to History tab and verify journal entry is listed
    await page.click('button[data-tab="history"]');
    await expect(page.locator('text=Refleksi hari ini')).toBeVisible({ timeout: 3000 });
  });

  test('saves sync credentials in Settings tab and shows confirmation toast', async ({ page }) => {
    await page.click('button[data-tab="settings"]');

    await page.fill('#sync-gas-url', 'https://script.google.com/macros/s/test/exec');
    await page.fill('#sync-pin', '1234567890123456');
    await page.click('#btn-save-credentials');

    // Confirmation toast appears
    await expect(page.locator('text=Credentials saved')).toBeVisible();
  });

  async function verifyNavBounds(page, expectedViewportHeight) {
    const bottomNav = page.locator('#bottom-nav');
    await expect(bottomNav).toBeVisible();

    const navBox = await bottomNav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(expectedViewportHeight + 1);
    expect(navBox.y).toBeGreaterThan(expectedViewportHeight - 120);

    for (const tabName of ['today', 'history', 'activities', 'settings']) {
      const tabBtn = page.locator(`button[data-tab="${tabName}"]`);
      await expect(tabBtn).toBeVisible();
      const tabBox = await tabBtn.boundingBox();
      expect(tabBox).not.toBeNull();
      expect(tabBox.height).toBeGreaterThanOrEqual(44);
      expect(tabBox.width).toBeGreaterThanOrEqual(44);
      expect(tabBox.y + tabBox.height).toBeLessThanOrEqual(expectedViewportHeight + 1);
    }
  }

  test('verifies bottom navigation bar visibility and bounds on iPhone viewports', async ({ page }) => {
    const viewports = [
      { name: 'iPhone 11 / XR', width: 414, height: 896 },
      { name: 'iPhone 15 Pro', width: 393, height: 852 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);
      await verifyNavBounds(page, vp.height);
    }
  });

  test('verifies iOS standalone PWA layout sets --app-height and fits bottom-nav', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', {
        value: true,
        configurable: true,
      });
    });

    const vp = { width: 414, height: 896 };
    await page.setViewportSize(vp);
    await page.goto('/');

    const appHeightProp = await page.evaluate(() => {
      return document.documentElement.style.getPropertyValue('--app-height');
    });
    expect(appHeightProp).toMatch(/^\d+px$|^100vh$/);
    await verifyNavBounds(page, vp.height);
  });

  test('verifies Android mobile viewports and standalone layout bounds', async ({ page }) => {
    const vp = { name: 'Pixel 7 (Android)', width: 412, height: 915 };
    await page.setViewportSize(vp);
    await page.waitForTimeout(200);
    await verifyNavBounds(page, vp.height);

    // Simulate Android standalone PWA launch
    await page.addInitScript(() => {
      const origMatchMedia = window.matchMedia;
      window.matchMedia = (query) => {
        if (query.includes('display-mode: standalone')) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          };
        }
        return origMatchMedia ? origMatchMedia(query) : { matches: false };
      };
    });

    await page.reload();
    const appHeightProp = await page.evaluate(() => {
      return document.documentElement.style.getPropertyValue('--app-height');
    });
    expect(appHeightProp).toMatch(/^100vh$/);
    await verifyNavBounds(page, vp.height);
  });

  test('renders floating Liquid Glass pill icon-only with sliding indicator and accessible labels', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });

    const bottomNav = page.locator('#bottom-nav');
    const indicator = page.locator('#bottom-nav-indicator');
    await expect(bottomNav).toBeVisible();
    await expect(indicator).toBeAttached();

    const navPosition = await bottomNav.evaluate((el) => getComputedStyle(el).position);
    expect(navPosition).toBe('absolute');

    const tabs = [
      { id: 'today', title: 'Today' },
      { id: 'activities', title: 'Activities' },
      { id: 'history', title: 'History' },
      { id: 'settings', title: 'Settings' },
    ];

    for (const tab of tabs) {
      const btn = page.locator(`button[data-tab="${tab.id}"]`);
      await expect(btn).toHaveAttribute('aria-label', tab.title);
      const labelBox = await btn.locator('.tab-title').boundingBox();
      expect(labelBox).not.toBeNull();
      expect(labelBox.width).toBeLessThanOrEqual(1);
    }

    const todayBtn = page.locator('button[data-tab="today"]');
    const activitiesBtn = page.locator('button[data-tab="activities"]');
    const todayActiveSvg = await todayBtn.locator('.tab-icon').innerHTML();
    const activitiesInactiveSvg = await activitiesBtn.locator('.tab-icon').innerHTML();
    const initialIndicatorBox = await indicator.boundingBox();

    await activitiesBtn.click();
    await page.waitForTimeout(350);

    const todayInactiveSvg = await todayBtn.locator('.tab-icon').innerHTML();
    const activitiesActiveSvg = await activitiesBtn.locator('.tab-icon').innerHTML();
    const movedIndicatorBox = await indicator.boundingBox();

    expect(todayInactiveSvg).not.toBe(todayActiveSvg);
    expect(activitiesActiveSvg).not.toBe(activitiesInactiveSvg);
    expect(movedIndicatorBox.x).toBeGreaterThan(initialIndicatorBox.x);
  });

  test('centers compact floating pill on wider viewports', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(150);

    const navBox = await page.locator('#bottom-nav').boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox.width).toBeLessThanOrEqual(381);

    const navCenterX = navBox.x + navBox.width / 2;
    expect(Math.abs(navCenterX - 512)).toBeLessThanOrEqual(2);
  });

  test('scrolls bottom-most Settings content clear of floating pill and stacks modals above it', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });

    // Scroll clearance on Settings
    await page.click('button[data-tab="settings"]');
    await expect(page.locator('#settings-about')).toBeVisible();

    await page.evaluate(() => {
      const main = document.getElementById('tab-content');
      main.scrollTop = main.scrollHeight;
    });
    await page.waitForTimeout(100);

    const aboutBox = await page.locator('#settings-about').boundingBox();
    const navBox = await page.locator('#bottom-nav').boundingBox();
    expect(aboutBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(aboutBox.y + aboutBox.height).toBeLessThanOrEqual(navBox.y + 2);

    // Full-screen modal stacking above floating pill
    await page.click('button[data-tab="activities"]');
    await page.click('#choice-journals');
    await page.click('#btn-customize-prompts');

    const modal = page.locator('#modal-customize-prompts');
    await expect(modal).toBeVisible();

    const zOrders = await page.evaluate(() => {
      const modalZ = Number(getComputedStyle(document.getElementById('modal-customize-prompts')).zIndex || 0);
      const navZ = Number(getComputedStyle(document.getElementById('bottom-nav')).zIndex || 0);
      return { modalZ, navZ };
    });
    expect(zOrders.modalZ).toBeGreaterThan(zOrders.navZ);
  });

  test('switches per-Device theme across Light, Dark, and System, persists across reload, and follows live OS updates', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.click('button[data-tab="settings"]');
    await expect(page.locator('#settings-appearance')).toBeVisible();
    await expect(page.locator('#settings-sync')).toBeVisible();

    // Appearance card sits above Sync card
    const appearanceBox = await page.locator('#settings-appearance').boundingBox();
    const syncBox = await page.locator('#settings-sync').boundingBox();
    expect(appearanceBox).not.toBeNull();
    expect(syncBox).not.toBeNull();
    expect(appearanceBox.y).toBeLessThan(syncBox.y);

    // Defaults to System (following light OS)
    await expect(page.locator('#theme-option-system')).toHaveAttribute('aria-checked', 'true');
    const initialThemeState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      dataTheme: document.documentElement.getAttribute('data-theme'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }));
    expect(initialThemeState.hasDarkClass).toBe(false);
    expect(initialThemeState.dataTheme).toBe('light');
    expect(initialThemeState.colorScheme).toBe('light');
    expect(initialThemeState.metaThemeColor).toBe('#F6F5F2');
    expect(initialThemeState.bodyBg).toBe('rgb(246, 245, 242)');

    // Click Dark while OS is still light -> switches immediately without toast
    await page.click('#theme-option-dark');
    await expect(page.locator('#theme-option-dark')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#toast-container').locator('> *')).toHaveCount(0);

    const darkThemeState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      dataTheme: document.documentElement.getAttribute('data-theme'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      storedTheme: localStorage.getItem('habbit.theme'),
    }));
    expect(darkThemeState.hasDarkClass).toBe(true);
    expect(darkThemeState.dataTheme).toBe('dark');
    expect(darkThemeState.colorScheme).toBe('dark');
    expect(darkThemeState.metaThemeColor).toBe('#161514');
    expect(darkThemeState.bodyBg).toBe('rgb(22, 21, 20)');
    expect(darkThemeState.storedTheme).toBe('dark');

    // Activities inline SVG fill adapts to manual Dark mode even on light OS
    await page.click('button[data-tab="activities"]');
    await expect(page.locator('#activities-choice-hub')).toBeVisible();
    const svgFill = await page.locator('.act-logo-fill').first().evaluate((el) => getComputedStyle(el).fill);
    expect(svgFill).toBe('rgb(34, 32, 30)');

    // Reload -> persists Dark before paint and keeps Dark radio selected in Settings
    await page.reload();
    const afterReloadState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    }));
    expect(afterReloadState.hasDarkClass).toBe(true);
    expect(afterReloadState.metaThemeColor).toBe('#161514');

    await page.click('button[data-tab="settings"]');
    await expect(page.locator('#theme-option-dark')).toHaveAttribute('aria-checked', 'true');

    // Emulate dark OS, then click Light -> manual Light overrides dark OS
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.click('#theme-option-light');
    await expect(page.locator('#theme-option-light')).toHaveAttribute('aria-checked', 'true');

    const forcedLightState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      dataTheme: document.documentElement.getAttribute('data-theme'),
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }));
    expect(forcedLightState.hasDarkClass).toBe(false);
    expect(forcedLightState.dataTheme).toBe('light');
    expect(forcedLightState.metaThemeColor).toBe('#F6F5F2');
    expect(forcedLightState.bodyBg).toBe('rgb(246, 245, 242)');

    // Click System -> immediately adopts dark OS, then live-switches to light OS
    await page.click('#theme-option-system');
    await expect(page.locator('#theme-option-system')).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() =>
      page.evaluate(() => ({
        hasDarkClass: document.documentElement.classList.contains('dark'),
        metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      }))
    ).toEqual({
      hasDarkClass: false,
      metaThemeColor: '#F6F5F2',
    });
  });
});
