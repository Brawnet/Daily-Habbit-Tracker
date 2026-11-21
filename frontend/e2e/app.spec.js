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

  test('writes today and backfills past journal entries, searches Journal History, reads and edits in-page, and moves Journal History out of History tab', async ({ page }) => {
    // Navigate to Activities tab -> Journals Choice Hub -> Write a Journal
    await page.click('button[data-tab="activities"]');
    await expect(page.locator('#activities-choice-hub')).toBeVisible();

    await page.click('#choice-journals');
    await expect(page.locator('#journals-menu-view')).toBeVisible();
    await page.click('#btn-choice-write-journal');

    const journalEditor = page.locator('#editor-journal-content');
    await expect(journalEditor).toBeVisible();
    await expect(page.locator('#journal-notes-card')).toHaveCount(0);
    await expect(page.locator('#editor-journal-notes')).toHaveCount(0);

    // Type today's reflection
    const testReflection = 'Refleksi hari ini: berhasil menyelesaikan target dengan fokus.';
    await journalEditor.fill(testReflection);
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });

    // Backfill yesterday via themed 7-day calendar picker
    const yesterday = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    });
    await page.click('#btn-journal-day-picker');
    const calendarPopover = page.locator('#journal-day-calendar-popover');
    await expect(calendarPopover).toBeVisible();
    const yesterdayCell = calendarPopover.locator(`.journal-calendar-day-btn[data-day="${yesterday}"]`);
    if ((await yesterdayCell.count()) === 0) {
      await calendarPopover.locator('#btn-calendar-prev-month').click();
    }
    await yesterdayCell.click();
    await expect(calendarPopover).toHaveCount(0);
    await expect(page.locator('#btn-customize-prompts')).toHaveCount(0);

    const pastReflection = 'Refleksi kemarin: tetap konsisten menjaga fokus.';
    await page.locator('#editor-journal-content').fill(pastReflection);
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });

    // Return to Journals Menu and open Journal History
    await page.click('#btn-back-from-journal-to-activities');
    await expect(page.locator('#journals-menu-view')).toBeVisible();
    await page.click('#btn-choice-journal-history');
    await expect(page.locator('#journal-history-view')).toBeVisible();
    await expect(page.locator('.journal-entry-item')).toHaveCount(2);

    // Search and open Entry Reader
    await page.fill('#journal-history-search', 'kemarin');
    await expect(page.locator('.journal-entry-item')).toHaveCount(1);
    await expect(page.locator('.journal-entry-item mark')).toContainText('kemarin');
    await page.click('.journal-entry-item');

    // Separate in-page Entry Reader (read-only first with Edit Journal button)
    await expect(page.locator('#journal-read-view')).toBeVisible();
    await expect(page.locator('#journal-reader-card')).toContainText(pastReflection);
    await expect(page.locator('#btn-edit-journal-entry')).toBeVisible();

    // Edit past entry and return to refreshed Entry Reader
    await page.click('#btn-edit-journal-entry');
    await expect(page.locator('#btn-journal-day-picker')).toHaveCount(0);
    await expect(page.locator('#input-journal-date')).toHaveCount(0);
    await expect(page.locator('#btn-customize-prompts')).toHaveCount(0);
    const updatedPastReflection = 'Refleksi kemarin (revisi): selesai lebih cepat.';
    await page.locator('#editor-journal-content').fill(updatedPastReflection);
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });
    await page.click('#btn-back-from-journal-to-activities');

    await expect(page.locator('#journal-read-view')).toBeVisible();
    await expect(page.locator('#journal-reader-card')).toContainText('selesai lebih cepat.');

    // Reload page and confirm persistence inside Journal History
    await page.reload();
    await page.click('button[data-tab="activities"]');
    await page.click('#choice-journals');
    await page.click('#btn-choice-journal-history');
    await expect(page.locator('text=Refleksi hari ini')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=selesai lebih cepat.')).toBeVisible({ timeout: 3000 });

    // Switch to History tab and verify Journal History has moved out
    await page.click('button[data-tab="history"]');
    await expect(page.locator('.journal-history-section')).toHaveCount(0);
    await expect(page.locator('.journal-search-input')).toHaveCount(0);
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

  test('renders solid flat floating pill with visible labels, Terracotta active state, #22201E Dark mode, and zero glass effects', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.emulateMedia({ colorScheme: 'light' });

    const bottomNav = page.locator('#bottom-nav');
    await expect(bottomNav).toBeVisible();
    await expect(page.locator('#bottom-nav-indicator')).toHaveCount(0);

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
      await expect(btn).toHaveAttribute('role', 'tab');
      await expect(btn).toHaveAttribute('aria-label', tab.title);
      const btnBox = await btn.boundingBox();
      expect(btnBox).not.toBeNull();
      expect(btnBox.width).toBeGreaterThanOrEqual(44);
      expect(btnBox.height).toBeGreaterThanOrEqual(44);

      const labelEl = btn.locator('.tab-title');
      await expect(labelEl).toHaveText(tab.title);
      const labelBox = await labelEl.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(labelBox.width).toBeGreaterThan(10);
      expect(labelBox.height).toBeGreaterThanOrEqual(10);
    }

    const readNavStyles = async (activeTabId, inactiveTabId) =>
      page.evaluate(
        ({ activeId, inactiveId }) => {
          const nav = document.getElementById('bottom-nav');
          const navStyle = getComputedStyle(nav);
          const beforeStyle = getComputedStyle(nav, '::before');
          const activeBtn = document.getElementById(`tab-btn-${activeId}`);
          const inactiveBtn = document.getElementById(`tab-btn-${inactiveId}`);
          return {
            backgroundColor: navStyle.backgroundColor,
            borderTopWidth: navStyle.borderTopWidth,
            borderTopColor: navStyle.borderTopColor,
            backdropFilter: navStyle.backdropFilter,
            backgroundImage: navStyle.backgroundImage,
            boxShadow: navStyle.boxShadow,
            beforeContent: beforeStyle.content,
            activeColor: getComputedStyle(activeBtn).color,
            inactiveColor: getComputedStyle(inactiveBtn).color,
          };
        },
        { activeId: activeTabId, inactiveId: inactiveTabId }
      );

    const flatZeroGlassShape = {
      borderTopWidth: '1px',
      backdropFilter: 'none',
      backgroundImage: 'none',
      boxShadow: expect.not.stringMatching(/inset|^none$/),
      beforeContent: 'none',
    };

    // Light mode: solid Crisp White (#FFFFFF), #E6E4DF hairline border, zero glass/gradient, Terracotta active (#C86D51)
    expect(await readNavStyles('today', 'activities')).toEqual({
      ...flatZeroGlassShape,
      backgroundColor: 'rgb(255, 255, 255)',
      borderTopColor: 'rgb(230, 228, 223)',
      activeColor: 'rgb(200, 109, 81)',
      inactiveColor: 'rgb(104, 101, 95)',
    });

    const todayBtn = page.locator('button[data-tab="today"]');
    const activitiesBtn = page.locator('button[data-tab="activities"]');
    const todayActiveSvg = await todayBtn.locator('.tab-icon').innerHTML();
    const activitiesInactiveSvg = await activitiesBtn.locator('.tab-icon').innerHTML();

    await activitiesBtn.click();
    await expect(activitiesBtn).toHaveAttribute('aria-selected', 'true');

    const todayInactiveSvg = await todayBtn.locator('.tab-icon').innerHTML();
    const activitiesActiveSvg = await activitiesBtn.locator('.tab-icon').innerHTML();
    expect(todayInactiveSvg).not.toBe(todayActiveSvg);
    expect(activitiesActiveSvg).not.toBe(activitiesInactiveSvg);

    await expect
      .poll(async () => {
        const s = await readNavStyles('activities', 'today');
        return { activeColor: s.activeColor, inactiveColor: s.inactiveColor };
      })
      .toEqual({
        activeColor: 'rgb(200, 109, 81)',
        inactiveColor: 'rgb(104, 101, 95)',
      });

    // Dark mode: solid #22201E (--surface-card), #33302C hairline border, zero blur/gradient, Terracotta active (#D97E63)
    await page.click('button[data-tab="settings"]');
    await page.click('#theme-option-dark');
    await expect(page.locator('#theme-option-dark')).toHaveAttribute('aria-checked', 'true');

    await expect
      .poll(() => readNavStyles('settings', 'today'))
      .toEqual({
        ...flatZeroGlassShape,
        backgroundColor: 'rgb(34, 32, 30)',
        borderTopColor: 'rgb(51, 48, 44)',
        activeColor: 'rgb(217, 126, 99)',
        inactiveColor: 'rgb(163, 158, 147)',
      });
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
    await page.click('#btn-choice-write-journal');
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
    await expect(page.locator('.act-logo-fill').first()).toHaveCSS('fill', 'rgb(34, 32, 30)');

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

    // Emulate dark OS, then click Light -> manual Light overrides dark OS & persists on reload
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.click('#theme-option-light');
    await expect(page.locator('#theme-option-light')).toHaveAttribute('aria-checked', 'true');

    const forcedLightState = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      dataTheme: document.documentElement.getAttribute('data-theme'),
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      storedTheme: localStorage.getItem('habbit.theme'),
    }));
    expect(forcedLightState.hasDarkClass).toBe(false);
    expect(forcedLightState.dataTheme).toBe('light');
    expect(forcedLightState.metaThemeColor).toBe('#F6F5F2');
    expect(forcedLightState.bodyBg).toBe('rgb(246, 245, 242)');
    expect(forcedLightState.storedTheme).toBe('light');

    await page.reload();
    const afterLightReload = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains('dark'),
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    }));
    expect(afterLightReload.hasDarkClass).toBe(false);
    expect(afterLightReload.metaThemeColor).toBe('#F6F5F2');

    await page.click('button[data-tab="settings"]');
    await expect(page.locator('#theme-option-light')).toHaveAttribute('aria-checked', 'true');

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

  async function getLocalDayFormats(page) {
    return page.evaluate(() => {
      const formatIsoDay = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const dayOfMonth = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${dayOfMonth}`;
      };
      const formatLongDay = (date) =>
        `${date.toLocaleDateString('en-US', { weekday: 'long' })}, ${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'long' })} ${date.getFullYear()}`;
      const formatShortDay = (date) =>
        `${date.toLocaleDateString('en-US', { weekday: 'short' })}, ${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getFullYear()}`;

      const todayDate = new Date();
      const yesterdayDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - 1, 12, 0, 0);
      const minBackfillDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - 7, 12, 0, 0);
      return {
        todayStr: formatIsoDay(todayDate),
        yesterdayStr: formatIsoDay(yesterdayDate),
        minDayStr: formatIsoDay(minBackfillDate),
        longToday: formatLongDay(todayDate),
        shortToday: formatShortDay(todayDate),
        longYesterday: formatLongDay(yesterdayDate),
        shortYesterday: formatShortDay(yesterdayDate),
      };
    });
  }

  async function assertNoHorizontalOverflow(page) {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
  }

  test('renders compact Day metadata across Write, Edit, Reader, and Journal History in Light and Dark mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.emulateMedia({ colorScheme: 'light' });

    const dates = await getLocalDayFormats(page);

    const dayMeta = page.locator('#journal-day-meta');
    const dayPickerTrigger = page.getByLabel('Journal Day');
    const calendarPopover = page.locator('#journal-day-calendar-popover');
    const cards = page.locator('.journal-entry-item');
    const readerHeader = page.locator('#journal-reader-header');

    const expectCompactDayMetaRow = async () => {
      await expect(dayMeta).toBeVisible();
      await expect(dayMeta).not.toHaveClass(/editorial-card/);
      expect(await dayMeta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    };

    const expectNoHorizontalOverflow = () => assertNoHorizontalOverflow(page);

    const selectDayFromCalendar = async (targetDayStr) => {
      const triggerBox = await dayPickerTrigger.boundingBox();
      expect(triggerBox).not.toBeNull();
      // Click the left text area of the field (not just any right-side icon) to verify full-field clickability
      await page.mouse.click(triggerBox.x + 12, triggerBox.y + triggerBox.height / 2);
      await expect(calendarPopover).toBeVisible();
      const dayCell = calendarPopover.locator(`.journal-calendar-day-btn[data-day="${targetDayStr}"]`);
      if ((await dayCell.count()) === 0) {
        await calendarPopover.locator('#btn-calendar-prev-month').click();
      }
      await dayCell.click();
      await expect(calendarPopover).toHaveCount(0);
    };

    const expectReaderHeaderClean = async (expectedLongDay, expectedShortDay, expectTodayPill) => {
      await expect(readerHeader).toBeVisible();
      await expect(readerHeader.locator('h1#journal-reader-title')).toHaveText(expectedLongDay);
      await expect(readerHeader.locator('p')).toHaveCount(0);
      await expect(readerHeader).not.toContainText(expectedShortDay);
      if (expectTodayPill) {
        await expect(readerHeader.locator('.badge-sage')).toHaveText('Today');
      } else {
        await expect(readerHeader.locator('.badge-sage')).toHaveCount(0);
      }
    };

    // 1. Write a Journal (Light)
    await page.click('button[data-tab="activities"]');
    await page.click('#choice-journals');
    await page.click('#btn-choice-write-journal');

    await expectCompactDayMetaRow();
    await expectNoHorizontalOverflow();

    await expect(dayPickerTrigger).toHaveAttribute('id', 'btn-journal-day-picker');
    await expect(dayPickerTrigger).toContainText(dates.shortToday);
    await expect(dayPickerTrigger).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const triggerBox = await dayPickerTrigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox.height).toBeGreaterThanOrEqual(44);

    // Open calendar by clicking the text side of the field and inspect Light theme + bounds
    await page.mouse.click(triggerBox.x + 12, triggerBox.y + triggerBox.height / 2);
    await expect(calendarPopover).toBeVisible();
    await expect(calendarPopover).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(calendarPopover).toHaveCSS('border-top-color', 'rgb(230, 228, 223)');
    await expect(calendarPopover.locator('.journal-calendar-day-btn[aria-pressed="true"]')).toHaveCSS(
      'background-color',
      'rgb(158, 75, 75)'
    );
    const todayCellBox = await calendarPopover.locator(`.journal-calendar-day-btn[data-day="${dates.todayStr}"]`).boundingBox();
    expect(todayCellBox.width).toBeGreaterThanOrEqual(44);
    expect(todayCellBox.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow();
    await page.keyboard.press('Escape');
    await expect(calendarPopover).toHaveCount(0);

    // Type and immediately switch Day via calendar without waiting 800ms -> flushes today's draft
    await page.locator('#editor-journal-content').fill('Unsaved draft flushed on Day switch');
    await selectDayFromCalendar(dates.yesterdayStr);
    await expect(dayPickerTrigger).toContainText(dates.shortYesterday);
    await expect(page.locator('#btn-customize-prompts')).toHaveCount(0);
    await expect(page.locator('#editor-journal-content')).toHaveText('');

    await page.locator('#editor-journal-content').fill('Yesterday reflection entry');
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });

    // 2. Journal History cards (Light)
    await page.click('#btn-back-from-journal-to-activities');
    await page.click('#btn-choice-journal-history');
    await expect(cards).toHaveCount(2);

    const todayCard = cards.nth(0);
    await expect(todayCard.locator('.journal-entry-header .journal-entry-title')).toHaveText(dates.shortToday);
    await expect(todayCard.locator('.journal-entry-header .badge-sage')).toHaveText('Today');
    await expect(todayCard).toContainText('Unsaved draft flushed on Day switch');

    const yesterdayCard = cards.nth(1);
    await expect(yesterdayCard.locator('.journal-entry-header .journal-entry-title')).toHaveText(dates.shortYesterday);
    await expect(yesterdayCard.locator('.journal-entry-header .badge-sage')).toHaveCount(0);

    // 3. Entry Reader (Light)
    await yesterdayCard.click();
    await expectReaderHeaderClean(dates.longYesterday, dates.shortYesterday, false);

    // 4. Edit Journal (Light)
    await page.click('#btn-edit-journal-entry');
    await expect(page.locator('#journal-edit-date-banner')).toHaveCount(0);
    await expectCompactDayMetaRow();
    await expect(page.locator('#journal-edit-day-value')).toHaveText(dates.longYesterday);

    // 5. Dark mode verification across all 4 surfaces
    await page.click('button[data-tab="settings"]');
    await page.click('#theme-option-dark');
    await expect(page.locator('#theme-option-dark')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    // Write a Journal (Dark) + themed calendar popover in Dark mode
    await page.click('button[data-tab="activities"]');
    await page.click('#choice-journals');
    await page.click('#btn-choice-write-journal');
    await expectCompactDayMetaRow();
    await expect(dayPickerTrigger).toBeVisible();
    await expect(dayPickerTrigger).toHaveCSS('background-color', 'rgb(34, 32, 30)');
    await expect(dayPickerTrigger).toHaveCSS('border-top-color', 'rgb(51, 48, 44)');
    await expect(dayPickerTrigger).toHaveCSS('color', 'rgb(244, 241, 234)');

    await dayPickerTrigger.click();
    await expect(calendarPopover).toBeVisible();
    await expect(calendarPopover).toHaveCSS('background-color', 'rgb(34, 32, 30)');
    await expect(calendarPopover).toHaveCSS('border-top-color', 'rgb(51, 48, 44)');
    await expect(calendarPopover.locator('.journal-calendar-day-btn[aria-pressed="true"]')).toHaveCSS(
      'background-color',
      'rgb(198, 120, 120)'
    );
    await expectNoHorizontalOverflow();
    await page.keyboard.press('Escape');
    await expect(calendarPopover).toHaveCount(0);

    // Journal History (Dark)
    await page.click('#btn-back-from-journal-to-activities');
    await page.click('#btn-choice-journal-history');
    await expect(todayCard.locator('.journal-entry-header .journal-entry-title')).toHaveCSS('color', 'rgb(244, 241, 234)');
    await expectNoHorizontalOverflow();

    // Entry Reader (Dark)
    await todayCard.click();
    await expectReaderHeaderClean(dates.longToday, dates.shortToday, true);
    await expect(readerHeader.locator('h1#journal-reader-title')).toHaveCSS('color', 'rgb(244, 241, 234)');

    // Edit Journal (Dark)
    await page.click('#btn-edit-journal-entry');
    await expect(page.locator('#journal-edit-date-banner')).toHaveCount(0);
    await expectCompactDayMetaRow();
    await expect(page.locator('#journal-edit-day-value')).toHaveText(dates.longToday);
    await expect(page.locator('#journal-edit-day-value')).toHaveCSS('color', 'rgb(244, 241, 234)');
  });

  test('supports optional Journal Entry title with dynamic Day fallback, title-only written status, and cross-field search highlights in Light & Dark mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.emulateMedia({ colorScheme: 'light' });

    const dates = await getLocalDayFormats(page);

    const titleInput = page.locator('#input-journal-title');
    const dayMeta = page.locator('#journal-day-meta');
    const cards = page.locator('.journal-entry-item');
    const expectNoHorizontalOverflow = () => assertNoHorizontalOverflow(page);

    // 1. Write a Journal: check optional title field metrics, placement, and dynamic placeholder
    await page.click('button[data-tab="activities"]');
    await page.click('#choice-journals');
    await page.click('#btn-choice-write-journal');

    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveAttribute('maxlength', '120');
    await expect(titleInput).toHaveAttribute('placeholder', `Title (defaults to ${dates.longToday})`);
    expect(await titleInput.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    const titleBox = await titleInput.boundingBox();
    const dayMetaBox = await dayMeta.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(dayMetaBox).not.toBeNull();
    expect(titleBox.height).toBeGreaterThanOrEqual(44);
    expect(titleBox.width).toBeGreaterThanOrEqual(44);
    expect(titleBox.y).toBeLessThan(dayMetaBox.y);
    await expectNoHorizontalOverflow();

    // Typing title alone does not inflate prompt word count, then typing prompt counts only prompt words
    await titleInput.fill('Café Deep Focus');
    await expect(page.locator('#journal-total-words')).toHaveText('0 words');
    await page.locator('#editor-journal-content').fill('Planned tomorrow milestone carefully');
    await expect(page.locator('#journal-total-words')).toHaveText('4 words');
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });

    // Switch Day to yesterday -> dynamic placeholder updates; save title-only entry (blank prompt answers)
    await page.click('#btn-journal-day-picker');
    const popover = page.locator('#journal-day-calendar-popover');
    const yesterdayCell = popover.locator(`.journal-calendar-day-btn[data-day="${dates.yesterdayStr}"]`);
    if ((await yesterdayCell.count()) === 0) {
      await popover.locator('#btn-calendar-prev-month').click();
    }
    await yesterdayCell.click();

    await expect(titleInput).toHaveAttribute('placeholder', `Title (defaults to ${dates.longYesterday})`);
    await titleInput.fill('Quiet Victory Yesterday');
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });

    // 2. Reload page and verify persistence + written-status badges (including title-only count)
    await page.reload();
    await page.click('button[data-tab="activities"]');
    await expect(page.locator('#choice-journals')).toContainText('Done ✓');
    await page.click('#choice-journals');
    await expect(page.locator('#journals-menu-view')).toContainText('Today: Written ✓');
    await expect(page.locator('#journals-menu-view')).toContainText('2 Journal Entries documented');

    // 3. Journal History cards + cross-field AND search highlighting both card Title and snippet
    await page.click('#btn-choice-journal-history');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator('.journal-entry-title')).toHaveText('Café Deep Focus');
    await expect(cards.nth(0).locator('.journal-entry-day')).toHaveText(dates.shortToday);
    await expect(cards.nth(1).locator('.journal-entry-title')).toHaveText('Quiet Victory Yesterday');
    await expect(cards.nth(1).locator('.journal-entry-day')).toHaveText(dates.shortYesterday);

    // Search cross-field AND query ("cafe" in title + "milestone" in content)
    await page.fill('#journal-history-search', 'cafe milestone');
    await expect(cards).toHaveCount(1);
    await expect(cards.nth(0).locator('.journal-entry-title mark')).toHaveText('Café');
    await expect(cards.nth(0).locator('mark')).toHaveCount(2);

    // Search title-only entry by title token -> matches & highlights title
    await page.fill('#journal-history-search', 'victory');
    await expect(cards).toHaveCount(1);
    await expect(cards.nth(0).locator('.journal-entry-title mark')).toHaveText('Victory');

    // Open title-only Entry Reader -> H1 custom title + long Day subtitle + "No reflection text."
    await cards.nth(0).click();
    await expect(page.locator('h1#journal-reader-title')).toHaveText('Quiet Victory Yesterday');
    await expect(page.locator('#journal-reader-day-subtitle')).toHaveText(dates.longYesterday);
    await expect(page.locator('#journal-reader-card')).toContainText('No reflection text.');

    // Back -> clear search -> open today's Entry Reader -> Edit Journal -> clear title -> reverts to Day fallback
    await page.click('#btn-back-from-journal-read');
    await page.fill('#journal-history-search', '');
    await expect(cards).toHaveCount(2);
    await cards.nth(0).click();
    await expect(page.locator('h1#journal-reader-title')).toHaveText('Café Deep Focus');
    await expect(page.locator('#journal-reader-day-subtitle')).toHaveText(dates.longToday);

    await page.click('#btn-edit-journal-entry');
    await expect(titleInput).toHaveValue('Café Deep Focus');
    expect((await titleInput.boundingBox()).y).toBeLessThan((await dayMeta.boundingBox()).y);
    await titleInput.fill('');
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });
    await page.click('#btn-back-from-journal-to-activities');

    // Entry Reader & Journal History dynamically fall back to Day with no duplicate subtitle
    await expect(page.locator('h1#journal-reader-title')).toHaveText(dates.longToday);
    await expect(page.locator('#journal-reader-day-subtitle')).toHaveCount(0);
    await page.click('#btn-back-from-journal-read');
    await expect(cards.nth(0).locator('.journal-entry-title')).toHaveText(dates.shortToday);
    await expect(cards.nth(0).locator('.journal-entry-day')).toHaveCount(0);

    // 4. Dark mode check across title input, titled reader, and history card
    await page.click('button[data-tab="settings"]');
    await page.click('#theme-option-dark');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await page.click('button[data-tab="activities"]');
    await page.click('#choice-journals');
    await page.click('#btn-choice-journal-history');
    await expect(cards.nth(1).locator('.journal-entry-title')).toHaveCSS('color', 'rgb(244, 241, 234)');
    await cards.nth(1).click();
    await expect(page.locator('h1#journal-reader-title')).toHaveText('Quiet Victory Yesterday');
    await page.click('#btn-edit-journal-entry');
    await expect(titleInput).toHaveCSS('background-color', 'rgb(34, 32, 30)');
    await expect(titleInput).toHaveCSS('color', 'rgb(244, 241, 234)');
    await expectNoHorizontalOverflow();
  });

  test('Done button returns to Today from Write a Journal and returns to Entry Reader from Edit Journal in Light & Dark modes', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.emulateMedia({ colorScheme: 'light' });

    // Seed a first habit via quick starter so Today shows the Active Habits list & inline + Add Habit control
    await page.getByRole('button', { name: '+ Drink 2L Water' }).click();
    await expect(page.locator('#today-add-habit-trigger')).toBeVisible();

    // Add a Journal-linked Habit directly on Today
    await page.click('#today-add-habit-trigger');
    await page.fill('#today-add-habit-input', 'Daily Evening Reflection');
    await page.selectOption('#today-add-habit-linked-activity', 'journal');
    await page.click('#today-add-habit-submit');
    await expect(page.locator('#today-progress')).toContainText('0/2 done');

    // Deep-link to Write a Journal from the Today Linked Activity badge
    await page.click('.habit-activity-link');
    await expect(page).toHaveURL(/tab=activities/);
    await expect(page).toHaveURL(/subview=journal/);
    await expect(page.locator('#journal-view')).toBeVisible();
    await expect(page.locator('#btn-back-from-journal-to-activities')).toContainText('Back to Journals');

    const doneBtn = page.locator('#btn-journal-done');
    await expect(doneBtn).toBeVisible();
    await expect(doneBtn).toHaveText('Done');
    await expect(doneBtn).toHaveCSS('background-color', 'rgb(158, 75, 75)');
    const doneBox = await doneBtn.boundingBox();
    expect(doneBox).not.toBeNull();
    expect(doneBox.width).toBeGreaterThanOrEqual(44);
    expect(doneBox.height).toBeGreaterThanOrEqual(44);
    await assertNoHorizontalOverflow(page);

    // Fill title + reflection and tap Done immediately (flushes 800ms debounce before leaving)
    await page.fill('#input-journal-title', 'Done Flow Title');
    await page.locator('#editor-journal-content').fill('Finished via bottom Done button.');
    await doneBtn.click();

    // Lands back on Today with subview=journal cleared and linked Habit auto-checked
    await expect(page).toHaveURL(/tab=today/);
    await expect(page).not.toHaveURL(/subview=journal/);
    await expect(page.locator('#today-date')).toBeVisible();
    await expect(page.locator('#today-progress')).toContainText('1/2 done');

    // Subsequent visit to Activities opens Choice Hub instead of jumping back into Write a Journal
    await page.click('button[data-tab="activities"]');
    await expect(page.locator('#activities-choice-hub')).toBeVisible();

    // Open Past Entries -> Entry Reader -> Edit Journal
    await page.click('#choice-journals');
    await page.click('#btn-choice-journal-history');
    await page.locator('.journal-entry-item').first().click();
    await expect(page.locator('#journal-read-view')).toBeVisible();
    await page.click('#btn-edit-journal-entry');
    await expect(page.locator('#btn-back-from-journal-to-activities')).toContainText('Back to Entry');

    // Switch to Dark mode, reopen Edit Journal, modify title & answer, click Done -> returns to Entry Reader (not Today)
    await page.click('button[data-tab="settings"]');
    await page.click('#theme-option-dark');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await page.click('button[data-tab="activities"]');
    await page.click('#choice-journals');
    await page.click('#btn-choice-journal-history');
    await page.locator('.journal-entry-item').first().click();
    await page.click('#btn-edit-journal-entry');

    await expect(doneBtn).toBeVisible();
    await expect(doneBtn).toHaveCSS('background-color', 'rgb(158, 75, 75)');
    await assertNoHorizontalOverflow(page);

    await page.fill('#input-journal-title', 'Edited Reader Headline');
    await page.locator('#editor-journal-content').fill('Updated while editing existing entry.');
    await doneBtn.click();

    await expect(page).toHaveURL(/tab=activities/);
    await expect(page.locator('#journal-read-view')).toBeVisible();
    await expect(page.locator('#journal-reader-title')).toHaveText('Edited Reader Headline');
    await expect(page.locator('#journal-reader-card')).toContainText('Updated while editing existing entry.');
  });
});
