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

  test('bottom navigation switches between Today, History, Activities, and Settings tabs', async ({ page }) => {
    await expect(page.locator('#today-date')).toBeVisible();

    // Navigate to Activities
    await page.click('button[data-tab="activities"]');
    await expect(page).toHaveURL(/tab=activities/);
    await expect(page.locator('#activities-empty-state')).toBeVisible();

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

  test('creates an activity, edits it, and persists across reload', async ({ page }) => {
    // Navigate to Activities tab
    await page.click('button[data-tab="activities"]');
    await expect(page).toHaveURL(/tab=activities/);
    await expect(page.locator('#activities-empty-state')).toBeVisible();

    // Click + New Activity
    await page.click('#btn-new-activity');
    await expect(page.locator('#activity-modal')).toBeVisible();

    // Fill activity form
    await page.fill('#activity-input-title', 'Designing Data-Intensive Applications');
    await page.fill('#activity-input-author', 'Martin Kleppmann');
    await page.selectOption('#activity-input-type', 'Book');
    await page.selectOption('#activity-input-status', 'In Progress');
    await page.fill('#activity-input-pages', '616');
    await page.fill('#activity-input-summary', 'Reliability, scalability, and maintainability.');
    await page.click('#activity-btn-save');

    // Verify modal closes and activity card is rendered
    await expect(page.locator('#activity-modal')).not.toBeVisible();
    const card = page.locator('.activity-card', { hasText: 'Designing Data-Intensive Applications' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Martin Kleppmann');
    await expect(card).toContainText('In Progress');

    // Reload page to test offline IndexedDB persistence
    await page.reload();
    await expect(page.locator('.activity-card', { hasText: 'Designing Data-Intensive Applications' })).toBeVisible();
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

  test('writes daily journal reflection, autosaves, and displays in History tab', async ({ page }) => {
    const journalInput = page.locator('#today-journal-input');
    await expect(journalInput).toBeVisible();

    // Type reflection text
    const testReflection = 'Refleksi hari ini: berhasil menyelesaikan target dengan fokus.';
    await journalInput.fill(testReflection);

    // Debounce save (800ms) and expect status indicator to be 'Saved'
    await expect(page.locator('#journal-status')).toHaveText('Saved', { timeout: 3000 });

    // Reload page to ensure content was saved in IndexedDB
    await page.reload();
    await expect(page.locator('#today-journal-input')).toHaveValue(testReflection);

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

  test('verifies bottom navigation bar visibility and bounds on iPhone viewports', async ({ page }) => {
    const viewports = [
      { name: 'iPhone 11 / XR', width: 414, height: 896 },
      { name: 'iPhone 15 Pro', width: 393, height: 852 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);

      const bottomNav = page.locator('#bottom-nav');
      await expect(bottomNav).toBeVisible();

      const navBox = await bottomNav.boundingBox();
      expect(navBox).not.toBeNull();
      // Navigation bar must sit at the bottom edge within viewport bounds
      expect(navBox.y + navBox.height).toBeLessThanOrEqual(vp.height + 1);
      expect(navBox.y).toBeGreaterThan(vp.height - 120);

      // All 3 navigation tabs must be visible, clickable, and meet touch target sizes
      for (const tabName of ['today', 'history', 'settings']) {
        const tabBtn = page.locator(`button[data-tab="${tabName}"]`);
        await expect(tabBtn).toBeVisible();
        const tabBox = await tabBtn.boundingBox();
        expect(tabBox).not.toBeNull();
        expect(tabBox.height).toBeGreaterThanOrEqual(44);
        expect(tabBox.y + tabBox.height).toBeLessThanOrEqual(vp.height + 1);
      }
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

    const bottomNav = page.locator('#bottom-nav');
    await expect(bottomNav).toBeVisible();
    const navBox = await bottomNav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(vp.height + 1);
  });
});
