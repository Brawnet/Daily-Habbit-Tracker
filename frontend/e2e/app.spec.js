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
});
