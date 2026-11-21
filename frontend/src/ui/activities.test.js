import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockElement, MockDocument } from './test-helpers.js';
import { today, addDays, formatLong, formatShort } from '../domain/day.js';
import { normalizeJournalTitle } from '../domain/journal.js';

describe('ui/activities.js UI view - Choice Hub & Books Summary', () => {
  let mockDoc;
  let repoModule;
  let shellModule;
  let mount;

  beforeEach(async () => {
    vi.resetModules();
    mockDoc = new MockDocument();
    mockDoc.body = mockDoc.createElement('body');
    global.document = mockDoc;
    global.HTMLElement = MockElement;

    shellModule = {
      navigate: vi.fn(),
      showToast: vi.fn(),
    };
    vi.doMock('./shell.js', () => shellModule);

    let books = [];
    let bookChapters = [];
    let journalEntries = {};
    let settings = {};
    let listeners = new Set();

    repoModule = {
      listBooks: vi.fn(async () => [...books].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))),
      addBook: vi.fn(async ({ title, author = '' }) => {
        const trimmed = (title || '').trim();
        if (!trimmed) throw new Error('Book title cannot be empty');
        const b = {
          id: `book-${Date.now()}-${Math.random()}`,
          title: trimmed,
          author: (author || '').trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        books.push(b);
        for (const l of listeners) l();
        return b;
      }),
      getBook: vi.fn(async (id) => books.find((b) => b.id === id) || null),
      saveBookChapter: vi.fn(async ({ id, bookId, title = '', content = '' }) => {
        let existing = bookChapters.find((c) => c.id === id);
        const now = new Date().toISOString();
        if (existing) {
          existing.title = title;
          existing.content = content;
          existing.updatedAt = now;
          for (const l of listeners) l();
          return existing;
        }
        const ch = {
          id: id || `ch-${Date.now()}-${Math.random()}`,
          bookId,
          title,
          content,
          sortOrder: bookChapters.filter((c) => c.bookId === bookId).length + 1,
          createdAt: now,
          updatedAt: now,
        };
        bookChapters.push(ch);
        for (const l of listeners) l();
        return ch;
      }),
      listBookChapters: vi.fn(async (bookId) =>
        bookChapters
          .filter((c) => c.bookId === bookId)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      ),
      getJournalEntry: vi.fn(async (day) => journalEntries[day] || null),
      listJournalEntries: vi.fn(async () =>
        Object.values(journalEntries).sort((a, b) => b.day.localeCompare(a.day))
      ),
      saveJournalEntry: vi.fn(async (day, content, options = {}) => {
        const resolvedTitle =
          options && options.title !== undefined
            ? normalizeJournalTitle(options.title)
            : normalizeJournalTitle(journalEntries[day]?.title);
        const entry = {
          day,
          title: resolvedTitle,
          content: String(content ?? ''),
          updatedAt: new Date().toISOString(),
          printedToDiaryAt: journalEntries[day]?.printedToDiaryAt || '',
        };
        journalEntries[day] = entry;
        for (const l of listeners) l();
        return entry;
      }),
      _seedJournalEntry: (entry) => {
        journalEntries[entry.day] = entry;
      },
      getSetting: vi.fn(async (key) => settings[key] || null),
      setSetting: vi.fn(async (key, val) => {
        settings[key] = val;
        for (const l of listeners) l();
      }),
      onChange: vi.fn((l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      }),
    };
    vi.doMock('../data/repo.js', () => repoModule);

    const activitiesUi = await import('./activities.js');
    mount = activitiesUi.mount;
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
    delete global.HTMLElement;
    vi.restoreAllMocks();
  });

  it('renders root Choice Hub with Books Summary and Journals choices', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    const choiceHub = root.querySelector('#activities-choice-hub');
    expect(choiceHub).not.toBeNull();

    const booksBtn = root.querySelector('#choice-books-summary');
    expect(booksBtn).not.toBeNull();
    expect(booksBtn.textContent).toContain('Books Summary');
    const booksIcon = booksBtn.children[0].children[0];
    expect(booksIcon.innerHTML).toContain('<svg');
    expect(booksIcon.innerHTML).toContain('viewBox="0 0 100 100"');

    const journalBtn = root.querySelector('#choice-journals');
    expect(journalBtn).not.toBeNull();
    expect(journalBtn.textContent).toContain('Journals');
    const journalIcon = journalBtn.children[0].children[0];
    expect(journalIcon.innerHTML).toContain('<svg');
    expect(journalIcon.innerHTML).toContain('viewBox="0 0 100 100"');
    cleanup();
  });

  it('navigates through Journals Choice Hub to Write a Journal, renders Prompt Cards Stack with defaults and formatting shortcuts', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    // Open Journals Menu
    const journalBtn = root.querySelector('#choice-journals');
    journalBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(root.querySelector('#journals-menu-view')).not.toBeNull();
    const writeBtn = root.querySelector('#btn-choice-write-journal');
    expect(writeBtn).not.toBeNull();
    writeBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const journalView = root.querySelector('#journal-view');
    expect(journalView).not.toBeNull();

    // All 3 default prompt cards are present
    const editor0 = root.querySelector('#editor-journal-content');
    expect(editor0).not.toBeNull();
    expect(editor0.getAttribute('aria-label')).toBe('How was your day?');

    const editor1 = root.querySelector('#editor-journal-content-1');
    expect(editor1).not.toBeNull();
    expect(editor1.getAttribute('aria-label')).toBe('What went well today?');

    const editor2 = root.querySelector('#editor-journal-content-2');
    expect(editor2).not.toBeNull();
    expect(editor2.getAttribute('aria-label')).toBe('What could be improved?');

    // Additional notes card is not rendered
    expect(root.querySelector('#journal-notes-card')).toBeNull();
    expect(root.querySelector('#editor-journal-notes')).toBeNull();
    expect(journalView.textContent).not.toContain('Additional Notes / Free Reflection');

    // Formatting shortcuts exist
    const bulletBtn = root.querySelector('#btn-journal-bullet');
    expect(bulletBtn).not.toBeNull();
    const numberBtn = root.querySelector('#btn-journal-number');
    expect(numberBtn).not.toBeNull();

    // Back to Journals Menu, then back to Activities Choice Hub
    const backBtn = root.querySelector('#btn-back-from-journal-to-activities');
    expect(backBtn).not.toBeNull();
    backBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(root.querySelector('#journals-menu-view')).not.toBeNull();
    const backToActivitiesBtn = root.querySelector('#btn-back-from-journals-menu');
    expect(backToActivitiesBtn).not.toBeNull();
    backToActivitiesBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(root.querySelector('#activities-choice-hub')).not.toBeNull();
    cleanup();
  });

  it('autosaves typed prompt answers debounced and updates live word count', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 10));
    root.querySelector('#btn-choice-write-journal').click();
    await new Promise((r) => setTimeout(r, 10));

    const editor0 = root.querySelector('#editor-journal-content');
    const editor1 = root.querySelector('#editor-journal-content-1');
    const wordBadge = root.querySelector('#journal-total-words');

    expect(wordBadge.textContent).toBe('0 words');

    // Type in prompt 1
    editor0.innerHTML = '<p>Had a productive planning session</p>';
    editor0.dispatchEvent({ type: 'input' });

    expect(wordBadge.textContent).toBe('5 words');

    // Type in prompt 2
    editor1.innerHTML = '<p>Finished the morning workout early</p>';
    editor1.dispatchEvent({ type: 'input' });

    expect(wordBadge.textContent).toBe('10 words');

    // Fast-forward past debounce (800ms)
    await new Promise((r) => setTimeout(r, 850));

    expect(repoModule.saveJournalEntry).toHaveBeenCalled();
    const lastCall = repoModule.saveJournalEntry.mock.calls.at(-1);
    expect(lastCall[0]).toBe(today());
    expect(lastCall[1]).toContain('data-prompt-id="jp_day"');
    expect(lastCall[1]).toContain('How was your day?');
    expect(lastCall[1]).toContain('Had a productive planning session');
    expect(lastCall[1]).toContain('data-prompt-id="jp_well"');
    expect(lastCall[1]).toContain('What went well today?');
    expect(lastCall[1]).toContain('Finished the morning workout early');
    expect(lastCall[1]).not.toContain('Additional Notes');
    expect(lastCall[1]).not.toContain('journal-notes-block');
    // Unanswered prompts omitted
    expect(lastCall[1]).not.toContain('What could be improved?');

    cleanup();
  });

  it('rehydrates prompt answers from compiled journal entry on load without rendering an additional notes card', async () => {
    const compiledEntry = `
<div class="journal-prompt-block" data-prompt-id="jp_day">
  <h3 class="font-bold">How was your day?</h3>
  <div class="journal-prompt-answer">Felt very accomplished.</div>
</div>

<div class="journal-prompt-block" data-prompt-id="jp_well">
  <h3 class="font-bold">What went well today?</h3>
  <div class="journal-prompt-answer">Completed all deep work sprints.</div>
</div>

<div class="journal-notes-block">
  <h3 class="font-bold">Additional Notes</h3>
  <div class="journal-notes-answer">Quiet evening tea.</div>
</div>
`.trim();

    repoModule.getJournalEntry = vi.fn(async () => ({
      day: today(),
      content: compiledEntry,
    }));

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 10));
    root.querySelector('#btn-choice-write-journal').click();
    await new Promise((r) => setTimeout(r, 10));

    const editor0 = root.querySelector('#editor-journal-content');
    expect(editor0.innerHTML).toBe('Felt very accomplished.');

    const editor1 = root.querySelector('#editor-journal-content-1');
    expect(editor1.innerHTML).toBe('Completed all deep work sprints.');

    expect(root.querySelector('#journal-notes-card')).toBeNull();
    expect(root.querySelector('#editor-journal-notes')).toBeNull();
    expect(root.querySelector('#journal-total-words').textContent).toBe('8 words');

    cleanup();
  });

  it('customizes prompts: reorders, renames, soft-deletes, and adds new questions via modal', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 10));
    root.querySelector('#btn-choice-write-journal').click();
    await new Promise((r) => setTimeout(r, 10));

    // Open Customize Prompts modal
    const customizeBtn = root.querySelector('#btn-customize-prompts');
    expect(customizeBtn).not.toBeNull();
    customizeBtn.click();

    const modal = mockDoc.getElementById('modal-customize-prompts');
    expect(modal).not.toBeNull();

    // Check list of prompts
    const list = modal.querySelector('#customize-prompts-list');
    expect(list).not.toBeNull();

    // Add a new question
    const addInput = modal.querySelector('#input-add-prompt');
    const addBtn = modal.querySelector('#btn-submit-add-prompt');
    expect(addInput).not.toBeNull();
    expect(addBtn).not.toBeNull();

    addInput.value = 'What made you smile today?';
    addBtn.click();

    // Verify setSetting called with the new prompt
    expect(repoModule.setSetting).toHaveBeenCalledWith(
      'journalPrompts',
      expect.stringContaining('What made you smile today?')
    );

    // Close modal
    const doneBtn = modal.querySelector('#btn-done-customize-modal');
    expect(doneBtn).not.toBeNull();
    doneBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    // Modal is removed
    expect(mockDoc.getElementById('modal-customize-prompts')).toBeNull();

    cleanup();
  });

  it('does not overwrite a same-day notes-only or freeform Journal Entry when customizing prompts', async () => {
    repoModule.getJournalEntry = vi.fn(async () => ({
      day: today(),
      content: '<div class="journal-notes-block"><h3 class="font-bold">Additional Notes</h3><div class="journal-notes-answer">Legacy thoughts.</div></div>',
    }));

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 10));
    root.querySelector('#btn-choice-write-journal').click();
    await new Promise((r) => setTimeout(r, 10));

    root.querySelector('#btn-customize-prompts').click();
    const modal = mockDoc.getElementById('modal-customize-prompts');
    modal.querySelector('#input-add-prompt').value = 'New gratitude prompt?';
    modal.querySelector('#btn-submit-add-prompt').click();
    modal.querySelector('#btn-done-customize-modal').click();
    await new Promise((r) => setTimeout(r, 10));

    expect(repoModule.saveJournalEntry).not.toHaveBeenCalled();

    cleanup();
  });

  it('reflects Done badge on Choice Hub when journal has content, and Open Journals when empty', async () => {
    // 1. With empty journal
    repoModule.getJournalEntry = vi.fn(async () => null);
    const root1 = mockDoc.createElement('div');
    const cleanup1 = mount(root1);
    await new Promise((r) => setTimeout(r, 10));

    const journalBtn1 = root1.querySelector('#choice-journals');
    expect(journalBtn1.textContent).toContain('Open Journals →');
    expect(journalBtn1.textContent).not.toContain('Done ✓');
    cleanup1();

    // 2. With answered journal
    repoModule.getJournalEntry = vi.fn(async () => ({
      day: today(),
      content: '<div class="journal-prompt-block"><p>Reflected</p></div>',
    }));
    const root2 = mockDoc.createElement('div');
    const cleanup2 = mount(root2);
    await new Promise((r) => setTimeout(r, 10));

    const journalBtn2 = root2.querySelector('#choice-journals');
    expect(journalBtn2.textContent).toContain('Done ✓');
    cleanup2();
  });

  it('shows today status and total Journal Entry count on Journals Choice Menu, and preserves subview=journal deep link', async () => {
    const todayDay = today();
    repoModule._seedJournalEntry({
      day: todayDay,
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Solid focus</div></div>',
    });
    repoModule._seedJournalEntry({
      day: addDays(todayDay, -10),
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Earlier day</div></div>',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));

    const menu = root.querySelector('#journals-menu-view');
    expect(menu).not.toBeNull();
    expect(menu.textContent).toContain('2 Journal Entries documented');
    expect(root.querySelector('#btn-choice-write-journal')).not.toBeNull();
    expect(root.querySelector('#btn-choice-journal-history')).not.toBeNull();
    cleanup();

    // Deep link skips Journals Choice Menu directly to Write a Journal
    global.window = { location: { search: '?tab=activities&subview=journal' } };
    const deepRoot = mockDoc.createElement('div');
    const deepCleanup = mount(deepRoot);
    await new Promise((r) => setTimeout(r, 15));

    expect(deepRoot.querySelector('#journals-menu-view')).toBeNull();
    expect(deepRoot.querySelector('#journal-view')).not.toBeNull();
    deepCleanup();
  });

  it('supports bounded 7-day backfill inline Day picker in Write a Journal, flushes pending saves on switch, and saves to selected past Day', async () => {
    const todayDay = today();
    const pastDay = addDays(todayDay, -3);
    const blankPastDay = addDays(todayDay, -2);
    const minDay = addDays(todayDay, -7);

    repoModule._seedJournalEntry({
      day: todayDay,
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Today notes</div></div>',
    });
    repoModule._seedJournalEntry({
      day: pastDay,
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Three days ago text</div></div>',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-choice-write-journal').click();
    await new Promise((r) => setTimeout(r, 15));

    const metaBar = root.querySelector('#journal-day-meta');
    expect(metaBar).not.toBeNull();
    expect(metaBar.classList.contains('journal-day-meta')).toBe(true);
    expect(metaBar.classList.contains('editorial-card')).toBe(false);

    const dateLabel = metaBar.querySelector('label');
    expect(dateLabel).not.toBeNull();
    expect(dateLabel.getAttribute('for')).toBe('btn-journal-day-picker');
    expect(dateLabel.textContent).toBe('Journal Day');

    let dayTrigger = root.querySelector('#btn-journal-day-picker');
    expect(dayTrigger).not.toBeNull();
    expect(dayTrigger.type).toBe('button');
    expect(dayTrigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(dayTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(dayTrigger.textContent).toContain(formatShort(todayDay));
    expect(dayTrigger.classList.contains('min-h-[44px]')).toBe(true);
    expect(dayTrigger.classList.contains('min-w-[44px]')).toBe(true);
    expect(dayTrigger.parentElement.classList.contains('editorial-card')).toBe(false);
    expect(root.querySelector('#journal-day-calendar-popover')).toBeNull();
    expect(root.querySelector('#btn-customize-prompts')).not.toBeNull();

    const pickDayFromCalendar = (targetDayStr) => {
      const trigger = root.querySelector('#btn-journal-day-picker');
      expect(trigger).not.toBeNull();
      trigger.click();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      const popover = root.querySelector('#journal-day-calendar-popover');
      expect(popover).not.toBeNull();
      expect(popover.getAttribute('role')).toBe('dialog');

      const findDayBtn = (dayStr) =>
        popover.querySelectorAll('.journal-calendar-day-btn').find((b) => b.dataset.day === dayStr) || null;

      let dayBtn = findDayBtn(targetDayStr);
      if (!dayBtn && targetDayStr < todayDay) {
        const prevMonthBtn = popover.querySelector('#btn-calendar-prev-month');
        if (prevMonthBtn && !prevMonthBtn.disabled) {
          prevMonthBtn.click();
          dayBtn = findDayBtn(targetDayStr);
        }
      }
      expect(dayBtn).not.toBeNull();
      expect(dayBtn.disabled).toBe(false);
      dayBtn.click();
    };

    // Inspect calendar bounds: today is enabled, tomorrow & day before minDay are disabled
    dayTrigger.click();
    const initialPopover = root.querySelector('#journal-day-calendar-popover');
    expect(initialPopover).not.toBeNull();
    const allDayBtns = initialPopover.querySelectorAll('.journal-calendar-day-btn');
    const tomorrowStr = addDays(todayDay, 1);
    const tomorrowBtn = allDayBtns.find((b) => b.dataset.day === tomorrowStr);
    if (tomorrowBtn) expect(tomorrowBtn.disabled).toBe(true);
    const tooOldStr = addDays(minDay, -1);
    const tooOldBtn = allDayBtns.find((b) => b.dataset.day === tooOldStr);
    if (tooOldBtn) expect(tooOldBtn.disabled).toBe(true);
    const minDayBtn = allDayBtns.find((b) => b.dataset.day === minDay);
    if (minDayBtn) expect(minDayBtn.disabled).toBe(false);
    // Close via trigger toggle
    dayTrigger.click();
    expect(root.querySelector('#journal-day-calendar-popover')).toBeNull();

    // Type without waiting for 800ms debounce, then switch Day via themed calendar -> flushes pending save before loading pastDay
    const todayEditor = root.querySelector('#editor-journal-content');
    todayEditor.innerHTML = '<p>Draft before switching day</p>';
    todayEditor.dispatchEvent({ type: 'input' });

    pickDayFromCalendar(pastDay);
    await new Promise((r) => setTimeout(r, 15));

    expect(repoModule.saveJournalEntry).toHaveBeenCalledWith(
      todayDay,
      expect.stringContaining('Draft before switching day'),
      { title: '' }
    );
    expect(root.querySelector('#btn-journal-day-picker').textContent).toContain(formatShort(pastDay));
    expect(root.querySelector('#btn-customize-prompts')).toBeNull();
    const editor0 = root.querySelector('#editor-journal-content');
    expect(editor0.innerHTML).toBe('Three days ago text');

    // Edit and autosave -> saves specifically to pastDay
    editor0.innerHTML = '<p>Backfilled update for three days ago</p>';
    editor0.dispatchEvent({ type: 'input' });
    await new Promise((r) => setTimeout(r, 850));

    const lastCall = repoModule.saveJournalEntry.mock.calls.at(-1);
    expect(lastCall[0]).toBe(pastDay);
    expect(lastCall[1]).toContain('Backfilled update for three days ago');

    // Switch to a blank past Day via calendar -> renders empty prompt cards and keeps Customize Prompts hidden
    pickDayFromCalendar(blankPastDay);
    await new Promise((r) => setTimeout(r, 15));

    expect(root.querySelector('#btn-customize-prompts')).toBeNull();
    expect(root.querySelector('#editor-journal-content').innerHTML).toBe('');

    // Reopen calendar and use Today quick-jump button -> shows Customize Prompts again
    root.querySelector('#btn-journal-day-picker').click();
    root.querySelector('#btn-calendar-jump-today').click();
    await new Promise((r) => setTimeout(r, 15));

    expect(root.querySelector('#btn-customize-prompts')).not.toBeNull();

    cleanup();
  });

  it('renders Journal History empty state CTA, keyword search highlights, and separate in-page Entry Reader', async () => {
    // 1. Empty state CTA jumps straight to Write a Journal
    const rootEmpty = mockDoc.createElement('div');
    const cleanupEmpty = mount(rootEmpty);
    await new Promise((r) => setTimeout(r, 15));

    rootEmpty.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    rootEmpty.querySelector('#btn-choice-journal-history').click();
    await new Promise((r) => setTimeout(r, 15));

    expect(rootEmpty.querySelector('#journal-history-view')).not.toBeNull();
    const emptyWriteBtn = rootEmpty.querySelector('#btn-empty-write-today-journal');
    expect(emptyWriteBtn).not.toBeNull();
    emptyWriteBtn.click();
    await new Promise((r) => setTimeout(r, 15));
    expect(rootEmpty.querySelector('#journal-view')).not.toBeNull();
    cleanupEmpty();

    // 2. Populated list with search highlights & separate in-page reader
    const todayDay = today();
    const olderDay = addDays(todayDay, -15);
    repoModule._seedJournalEntry({
      day: todayDay,
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Morning coffee walk</div></div>',
    });
    repoModule._seedJournalEntry({
      day: olderDay,
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Read stoic philosophy</div></div>',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-choice-journal-history').click();
    await new Promise((r) => setTimeout(r, 15));

    let items = root.querySelectorAll('.journal-entry-item');
    expect(items.length).toBe(2);
    expect(items[0].dataset.day).toBe(todayDay);
    expect(items[1].dataset.day).toBe(olderDay);

    for (const [card, dayStr, expectTodayBadge] of [
      [items[0], todayDay, true],
      [items[1], olderDay, false],
    ]) {
      const cardHeader = card.querySelector('.journal-entry-header');
      expect(cardHeader).not.toBeNull();
      const headline = cardHeader.querySelector('.journal-entry-headline');
      expect(headline).not.toBeNull();
      const titleEl = headline.querySelector('.journal-entry-title');
      expect(titleEl).not.toBeNull();
      expect(titleEl.textContent).toBe(formatShort(dayStr));
      expect(titleEl.classList.contains('text-base')).toBe(true);
      expect(titleEl.classList.contains('font-serif')).toBe(true);
      expect(titleEl.classList.contains('font-semibold')).toBe(true);

      const badgeEl = cardHeader.querySelector('.badge-sage');
      if (expectTodayBadge) {
        expect(badgeEl).not.toBeNull();
        expect(badgeEl.textContent).toBe('Today');
      } else {
        expect(badgeEl).toBeNull();
      }
    }

    const assertReaderHeader = (readerCard, dayStr, expectTodayBadge) => {
      expect(readerCard).not.toBeNull();
      const readerHeader = readerCard.querySelector('#journal-reader-header');
      expect(readerHeader).not.toBeNull();
      const readerTitle = readerHeader.querySelector('#journal-reader-title');
      expect(readerTitle).not.toBeNull();
      expect(readerTitle.tagName).toBe('H1');
      expect(readerTitle.textContent).toBe(formatLong(dayStr));
      expect(readerHeader.querySelectorAll('p').length).toBe(0);
      expect(readerHeader.textContent).not.toContain(formatShort(dayStr));
      if (expectTodayBadge) {
        expect(readerHeader.textContent).toContain('Today');
      } else {
        expect(readerHeader.textContent).not.toContain('Today');
      }
    };

    // Open today's Entry Reader first to verify Today badge and clean single header
    items[0].click();
    await new Promise((r) => setTimeout(r, 15));
    assertReaderHeader(root.querySelector('#journal-reader-card'), todayDay, true);

    root.querySelector('#btn-back-from-journal-read').click();
    await new Promise((r) => setTimeout(r, 15));

    const searchInput = root.querySelector('#journal-history-search');
    expect(searchInput).not.toBeNull();
    expect(searchInput.style.fontSize).toBe('16px');

    searchInput.value = 'stoic';
    searchInput.dispatchEvent({ type: 'input' });
    await new Promise((r) => setTimeout(r, 10));

    items = root.querySelectorAll('.journal-entry-item');
    expect(items.length).toBe(1);
    expect(items[0].dataset.day).toBe(olderDay);
    const markEl = items[0].querySelector('mark');
    expect(markEl).not.toBeNull();
    expect(markEl.textContent.toLowerCase()).toBe('stoic');

    // Open separate in-page Entry Reader for olderDay
    items[0].click();
    await new Promise((r) => setTimeout(r, 15));

    const readerView = root.querySelector('#journal-read-view');
    expect(readerView).not.toBeNull();
    expect(root.querySelector('#journal-history-view')).toBeNull();
    const readerCard = root.querySelector('#journal-reader-card');
    assertReaderHeader(readerCard, olderDay, false);
    expect(readerCard.textContent).toContain('Read stoic philosophy');
    expect(root.querySelector('#btn-back-from-journal-read')).not.toBeNull();
    expect(root.querySelector('#btn-edit-journal-entry')).not.toBeNull();

    cleanup();
  });

  it('allows editing an old past Journal Entry from Entry Reader, preserves answered archived prompts, and returns to updated reader', async () => {
    const oldDay = addDays(today(), -20);
    await repoModule.setSetting(
      'journalPrompts',
      JSON.stringify([
        { id: 'jp_day', prompt: 'How was your day?', order: 0, archived: false },
        { id: 'jp_old', prompt: 'Legacy Evening Question?', order: 1, archived: true },
      ])
    );

    repoModule._seedJournalEntry({
      day: oldDay,
      content: `
<div class="journal-prompt-block" data-prompt-id="jp_day">
  <h3 class="font-bold">How was your day?</h3>
  <div class="journal-prompt-answer">Quiet Sunday</div>
</div>
<div class="journal-prompt-block" data-prompt-id="jp_old">
  <h3 class="font-bold">Legacy Evening Question?</h3>
  <div class="journal-prompt-answer">Original archived answer</div>
</div>
      `.trim(),
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-choice-journal-history').click();
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('.journal-entry-item').click();
    await new Promise((r) => setTimeout(r, 15));

    // Enter Edit Journal mode from Entry Reader
    root.querySelector('#btn-edit-journal-entry').click();
    await new Promise((r) => setTimeout(r, 15));

    expect(root.querySelector('#journal-view')).not.toBeNull();
    expect(root.querySelector('#btn-journal-day-picker')).toBeNull();
    expect(root.querySelector('#input-journal-date')).toBeNull();
    expect(root.querySelector('#journal-edit-date-banner')).toBeNull();
    expect(root.querySelector('#journal-view').textContent).not.toContain('Editing Journal Entry');

    const editMetaBar = root.querySelector('#journal-day-meta');
    expect(editMetaBar).not.toBeNull();
    expect(editMetaBar.classList.contains('journal-day-meta')).toBe(true);
    expect(editMetaBar.classList.contains('editorial-card')).toBe(false);
    expect(editMetaBar.classList.contains('bg-[#FBF2F2]')).toBe(false);

    const editDayValue = root.querySelector('#journal-edit-day-value');
    expect(editDayValue).not.toBeNull();
    expect(editDayValue.tagName).toBe('TIME');
    expect(editDayValue.getAttribute('datetime')).toBe(oldDay);
    expect(editDayValue.textContent).toBe(formatLong(oldDay));

    expect(root.querySelector('#btn-customize-prompts')).toBeNull();

    // Archived prompt with saved answer MUST be rendered and editable
    const archivedEditor = root.querySelector('#editor-journal-content-1');
    expect(archivedEditor).not.toBeNull();
    expect(archivedEditor.getAttribute('aria-label')).toBe('Legacy Evening Question?');
    expect(archivedEditor.innerHTML).toBe('Original archived answer');
    expect(root.querySelector('#journal-view').textContent).toContain('Archived');

    // Edit archived answer and immediately tap Done/Back -> flushes save and returns to refreshed reader
    archivedEditor.innerHTML = '<p>Revised archived reflection</p>';
    archivedEditor.dispatchEvent({ type: 'input' });

    root.querySelector('#btn-back-from-journal-to-activities').click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.saveJournalEntry).toHaveBeenCalledWith(
      oldDay,
      expect.stringContaining('Revised archived reflection'),
      { title: '' }
    );

    const refreshedReader = root.querySelector('#journal-read-view');
    expect(refreshedReader).not.toBeNull();
    expect(refreshedReader.textContent).toContain('Revised archived reflection');

    cleanup();
  });

  it('preserves Additional Notes alongside prompt answers when editing mixed historical Journal Entries', async () => {
    const todayDay = today();
    const oldDay = addDays(todayDay, -12);
    repoModule._seedJournalEntry({
      day: oldDay,
      content: `
<div class="journal-prompt-block" data-prompt-id="jp_day">
  <h3 class="font-bold">How was your day?</h3>
  <div class="journal-prompt-answer">Steady progress today.</div>
</div>
<div class="journal-notes-block">
  <h3 class="font-bold">Additional Notes</h3>
  <div class="journal-notes-answer">Kept reading before bed.</div>
</div>`.trim(),
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-choice-journal-history').click();
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('.journal-entry-item').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-edit-journal-entry').click();
    await new Promise((r) => setTimeout(r, 15));

    expect(root.querySelector('#journal-notes-card')).toBeNull();
    expect(root.querySelector('#editor-journal-content').innerHTML).toBe('Steady progress today.');
    const legacyNotesEditor = root.querySelector('#editor-journal-content-3');
    expect(legacyNotesEditor).not.toBeNull();
    expect(legacyNotesEditor.getAttribute('aria-label')).toBe('Additional Notes');
    expect(legacyNotesEditor.innerHTML).toBe('Kept reading before bed.');

    root.querySelector('#editor-journal-content').innerHTML = '<p>Updated steady progress.</p>';
    root.querySelector('#editor-journal-content').dispatchEvent({ type: 'input' });
    root.querySelector('#btn-back-from-journal-to-activities').click();
    await new Promise((r) => setTimeout(r, 20));

    const lastCall = repoModule.saveJournalEntry.mock.calls.at(-1);
    expect(lastCall[0]).toBe(oldDay);
    expect(lastCall[1]).toContain('Updated steady progress.');
    expect(lastCall[1]).toContain('Kept reading before bed.');

    cleanup();
  });

  it('navigates to Books list, shows empty state, and adds a new book', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    // Open Books Summary
    root.querySelector('#choice-books-summary').click();
    await new Promise((r) => setTimeout(r, 10));

    const booksListView = root.querySelector('#books-list-view');
    expect(booksListView).not.toBeNull();

    const emptyState = root.querySelector('#books-empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState.textContent).toContain('No books in your library yet');

    // Toggle Add Book form
    const toggleAddBtn = root.querySelector('#btn-toggle-add-book');
    toggleAddBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const titleInput = root.querySelector('#input-new-book-title');
    const authorInput = root.querySelector('#input-new-book-author');
    const saveBtn = root.querySelector('#btn-save-new-book');

    expect(titleInput).not.toBeNull();
    expect(authorInput).not.toBeNull();

    titleInput.value = 'Atomic Habits';
    authorInput.value = 'James Clear';
    saveBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(repoModule.addBook).toHaveBeenCalledWith({
      title: 'Atomic Habits',
      author: 'James Clear',
    });
    expect(shellModule.showToast).toHaveBeenCalledWith('Book added');

    // Should transition directly to the book action menu
    const bookActionMenu = root.querySelector('#book-action-menu-view');
    expect(bookActionMenu).not.toBeNull();
    expect(root.querySelector('#book-menu-title').textContent).toBe('Atomic Habits');

    cleanup();
  });

  it('allows writing chapters in Continue Summary and reading compiled book in Read Summary', async () => {
    // Seed repo with a book
    const book = await repoModule.addBook({ title: 'Deep Work', author: 'Cal Newport' });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    // Open Books Summary
    root.querySelector('#choice-books-summary').click();
    await new Promise((r) => setTimeout(r, 10));

    // Select the book
    const bookCard = root.querySelector('.book-item-card');
    expect(bookCard).not.toBeNull();
    expect(bookCard.textContent).toContain('Deep Work');
    bookCard.click();
    await new Promise((r) => setTimeout(r, 10));

    // Action menu choices
    const continueBtn = root.querySelector('#btn-choice-continue-summary');
    const readBtn = root.querySelector('#btn-choice-read-summary');
    expect(continueBtn).not.toBeNull();
    expect(readBtn).not.toBeNull();

    // Click Continue Summary
    continueBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const editView = root.querySelector('#book-edit-view');
    expect(editView).not.toBeNull();

    const chapterSelect = root.querySelector('#chapter-select');
    expect(chapterSelect).not.toBeNull();
    // Initially has "+ Write New Chapter"
    expect(chapterSelect.children.length).toBe(1);

    const titleInput = root.querySelector('#input-chapter-title');
    const editor = root.querySelector('#editor-chapter-content');
    const saveChapterBtn = root.querySelector('#btn-save-chapter');

    titleInput.value = 'Chapter 1: Deep Work is Valuable';
    editor.innerHTML = 'Focus without distraction is a superpower.';
    saveChapterBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(repoModule.saveBookChapter).toHaveBeenCalledWith({
      bookId: book.id,
      title: 'Chapter 1: Deep Work is Valuable',
      content: 'Focus without distraction is a superpower.',
    });

    // Check that dropdown now lists the saved chapter
    const updatedSelect = root.querySelector('#chapter-select');
    expect(updatedSelect.children.length).toBe(2);

    // Click Read All Chapters button
    const readAllBtn = root.querySelector('#btn-shortcut-read-all');
    readAllBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const readerView = root.querySelector('#book-read-view');
    expect(readerView).not.toBeNull();
    const readerCard = root.querySelector('#book-reader-card');
    expect(readerCard.textContent).toContain('Deep Work');
    expect(readerCard.textContent).toContain('Chapter 1: Deep Work is Valuable');
    expect(readerCard.textContent).toContain('Focus without distraction is a superpower.');

    cleanup();
  });

  it('renders optional title input above compact Day metadata in Write and Edit modes, autosaves/flushes with dynamic Day placeholder, and leaves word count prompt-only', async () => {
    const todayDay = today();
    const pastDay = addDays(todayDay, -2);
    repoModule._seedJournalEntry({
      day: pastDay,
      title: 'Existing Past Headline',
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Steady climb</div></div>',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-choice-write-journal').click();
    await new Promise((r) => setTimeout(r, 15));

    const titleInput = root.querySelector('#input-journal-title');
    const dayMeta = root.querySelector('#journal-day-meta');
    expect(titleInput).not.toBeNull();
    expect(titleInput.tagName).toBe('INPUT');
    expect(titleInput.type).toBe('text');
    expect(titleInput.style.fontSize).toBe('16px');
    expect(titleInput.classList.contains('min-h-[44px]')).toBe(true);
    expect(titleInput.classList.contains('min-w-[44px]')).toBe(true);
    expect(titleInput.getAttribute('maxlength')).toBe('120');
    expect(titleInput.getAttribute('placeholder')).toBe(`Title (defaults to ${formatLong(todayDay)})`);

    const titleLabel = root.querySelector('label');
    expect(titleLabel).not.toBeNull();

    // Title input sits above #journal-day-meta inside the workspace children
    const workspace = dayMeta.parentElement;
    const titleWrapIndex = workspace.children.indexOf(titleInput.parentElement);
    const dayMetaIndex = workspace.children.indexOf(dayMeta);
    expect(titleWrapIndex).toBeGreaterThan(-1);
    expect(dayMetaIndex).toBeGreaterThan(titleWrapIndex);

    // Typing title schedules autosave WITHOUT changing prompt word count
    titleInput.value = '  Breakthrough Focus  ';
    titleInput.dispatchEvent({ type: 'input' });
    expect(root.querySelector('#journal-total-words').textContent).toBe('0 words');

    // Switch Day immediately before 800ms debounce -> flushes title to todayDay and updates placeholder & value
    root.querySelector('#btn-journal-day-picker').click();
    const pastBtn = root
      .querySelector('#journal-day-calendar-popover')
      .querySelectorAll('.journal-calendar-day-btn')
      .find((b) => b.dataset.day === pastDay);
    pastBtn.click();
    await new Promise((r) => setTimeout(r, 15));

    expect(repoModule.saveJournalEntry).toHaveBeenCalledWith(todayDay, '', {
      title: 'Breakthrough Focus',
    });

    const pastTitleInput = root.querySelector('#input-journal-title');
    expect(pastTitleInput.value).toBe('Existing Past Headline');
    expect(pastTitleInput.getAttribute('placeholder')).toBe(`Title (defaults to ${formatLong(pastDay)})`);

    // Clear title on pastDay -> debounced autosave persists title: ''
    pastTitleInput.value = '   ';
    pastTitleInput.dispatchEvent({ type: 'input' });
    await new Promise((r) => setTimeout(r, 850));

    expect(repoModule.saveJournalEntry.mock.calls.at(-1)).toEqual([
      pastDay,
      expect.stringContaining('Steady climb'),
      { title: '' },
    ]);

    // Back to Journals Menu -> Journal History -> Entry Reader -> Edit Journal
    root.querySelector('#btn-back-from-journal-to-activities').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-choice-journal-history').click();
    await new Promise((r) => setTimeout(r, 15));

    const pastCard = root.querySelectorAll('.journal-entry-item').find((c) => c.dataset.day === pastDay);
    expect(pastCard).not.toBeNull();
    // Cleared title falls back dynamically to formatShort(pastDay) without duplicate subtitle
    expect(pastCard.querySelector('.journal-entry-title').textContent).toBe(formatShort(pastDay));
    expect(pastCard.querySelector('.journal-entry-day')).toBeNull();

    pastCard.click();
    await new Promise((r) => setTimeout(r, 15));
    expect(root.querySelector('#journal-reader-title').textContent).toBe(formatLong(pastDay));
    expect(root.querySelector('#journal-reader-day-subtitle')).toBeNull();

    // Edit Journal also places #input-journal-title above #journal-day-meta with dynamic Day placeholder
    root.querySelector('#btn-edit-journal-entry').click();
    await new Promise((r) => setTimeout(r, 15));
    const editTitleInput = root.querySelector('#input-journal-title');
    const editDayMeta = root.querySelector('#journal-day-meta');
    expect(editTitleInput).not.toBeNull();
    expect(editTitleInput.getAttribute('placeholder')).toBe(`Title (defaults to ${formatLong(pastDay)})`);
    expect(editDayMeta.parentElement.children.indexOf(editTitleInput.parentElement)).toBeLessThan(
      editDayMeta.parentElement.children.indexOf(editDayMeta)
    );

    // Add title back in Edit Journal and tap Done/Back immediately -> flushes and updates Entry Reader
    editTitleInput.value = 'Restored Reflection Title';
    editTitleInput.dispatchEvent({ type: 'input' });
    root.querySelector('#btn-back-from-journal-to-activities').click();
    await new Promise((r) => setTimeout(r, 20));

    expect(root.querySelector('#journal-reader-title').textContent).toBe('Restored Reflection Title');
    const subtitleEl = root.querySelector('#journal-reader-day-subtitle');
    expect(subtitleEl).not.toBeNull();
    expect(subtitleEl.tagName).toBe('TIME');
    expect(subtitleEl.textContent).toBe(formatLong(pastDay));

    cleanup();
  });

  it('treats title-only today Journal Entry as written across Choice Hub, Journals Menu, History, and Entry Reader', async () => {
    const todayDay = today();
    repoModule._seedJournalEntry({
      day: todayDay,
      title: 'Title Only Today',
      content: '',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    // Choice Hub Done ✓ badge
    expect(root.querySelector('#choice-journals').textContent).toContain('Done ✓');

    // Journals Menu status & count
    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    const menu = root.querySelector('#journals-menu-view');
    expect(menu.textContent).toContain('Today: Written ✓');
    expect(menu.textContent).toContain('1 Journal Entry documented');

    // Journal History card
    root.querySelector('#btn-choice-journal-history').click();
    await new Promise((r) => setTimeout(r, 15));
    const items = root.querySelectorAll('.journal-entry-item');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('.journal-entry-title').textContent).toBe('Title Only Today');
    expect(items[0].querySelector('.journal-entry-day').textContent).toBe(formatShort(todayDay));

    // Entry Reader shows custom H1, long Day subtitle, and No reflection text.
    items[0].click();
    await new Promise((r) => setTimeout(r, 15));
    expect(root.querySelector('#journal-reader-title').textContent).toBe('Title Only Today');
    expect(root.querySelector('#journal-reader-day-subtitle').textContent).toBe(formatLong(todayDay));
    expect(root.querySelector('#journal-reader-card').textContent).toContain('No reflection text.');

    cleanup();
  });

  it('highlights search matches with <mark> in both Journal History card title and preview snippet', async () => {
    const todayDay = today();
    const olderDay = addDays(todayDay, -10);

    repoModule._seedJournalEntry({
      day: todayDay,
      title: 'Café Morning Strategy',
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Planned next milestone clearly.</div></div>',
    });
    repoModule._seedJournalEntry({
      day: olderDay,
      title: '',
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Routine Tuesday notes.</div></div>',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-choice-journal-history').click();
    await new Promise((r) => setTimeout(r, 15));

    // Untouched initial list checks titled vs untitled card structures
    let cards = root.querySelectorAll('.journal-entry-item');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.journal-entry-title').textContent).toBe('Café Morning Strategy');
    expect(cards[0].querySelector('.journal-entry-day').textContent).toBe(formatShort(todayDay));
    expect(cards[1].querySelector('.journal-entry-title').textContent).toBe(formatShort(olderDay));
    expect(cards[1].querySelector('.journal-entry-day')).toBeNull();

    // Cross-field AND query: "cafe" (in title) + "milestone" (in content)
    const searchInput = root.querySelector('#journal-history-search');
    searchInput.value = 'cafe milestone';
    searchInput.dispatchEvent({ type: 'input' });
    await new Promise((r) => setTimeout(r, 10));

    cards = root.querySelectorAll('.journal-entry-item');
    expect(cards).toHaveLength(1);
    const titleMarks = cards[0].querySelector('.journal-entry-title').querySelectorAll('mark');
    expect(titleMarks.map((m) => m.textContent)).toEqual(['Café']);
    const allMarks = cards[0].querySelectorAll('mark');
    expect(allMarks.map((m) => m.textContent)).toEqual(['Café', 'milestone']);

    cleanup();
  });

  it('renders bottom Done button in Write a Journal that flushes pending autosave, clears subview=journal, and navigates to Today', async () => {
    const todayDay = today();
    let currentHref = 'http://localhost/?tab=activities&subview=journal';
    const replaceState = vi.fn((_state, _title, nextUrl) => {
      const parsed = new URL(nextUrl, 'http://localhost/');
      currentHref = parsed.toString();
      global.window.location.href = currentHref;
      global.window.location.search = parsed.search;
    });
    global.window = {
      location: {
        href: currentHref,
        search: '?tab=activities&subview=journal',
      },
      history: {
        replaceState,
      },
    };

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    expect(root.querySelector('#journal-view')).not.toBeNull();
    const backBtn = root.querySelector('#btn-back-from-journal-to-activities');
    expect(backBtn.textContent).toContain('Back to Journals');

    const doneBtn = root.querySelector('#btn-journal-done');
    expect(doneBtn).not.toBeNull();
    expect(doneBtn.textContent.trim()).toBe('Done');
    expect(doneBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(doneBtn.classList.contains('min-w-[44px]')).toBe(true);

    // Edit title & prompt answer and click Done immediately (before 800ms debounce fires)
    const titleInput = root.querySelector('#input-journal-title');
    titleInput.value = 'Done Flow Headline';
    titleInput.dispatchEvent({ type: 'input' });

    const editor = root.querySelector('#editor-journal-content');
    editor.innerHTML = 'Shipped cleanly';
    editor.dispatchEvent({ type: 'input' });

    expect(repoModule.saveJournalEntry).not.toHaveBeenCalled();

    doneBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.saveJournalEntry).toHaveBeenCalledTimes(1);
    expect(repoModule.saveJournalEntry).toHaveBeenCalledWith(
      todayDay,
      expect.stringContaining('Shipped cleanly'),
      { title: 'Done Flow Headline' }
    );
    expect(replaceState).toHaveBeenCalled();
    expect(new URLSearchParams(global.window.location.search).get('subview')).toBeNull();
    expect(shellModule.navigate).toHaveBeenCalledWith('today');
    expect(shellModule.showToast).toHaveBeenCalledWith('Your journal has been saved', {
      position: 'top',
      duration: 3000,
    });

    cleanup();
  });

  it('returns to Entry Reader without navigating to Today when clicking Done in Edit Journal, and keeps top Back links intact', async () => {
    const pastDay = addDays(today(), -4);
    repoModule._seedJournalEntry({
      day: pastDay,
      title: 'Original Edit Title',
      content: '<div class="journal-prompt-block" data-prompt-id="jp_day"><h3>How was your day?</h3><div class="journal-prompt-answer">Initial draft</div></div>',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 15));

    // Write a Journal -> Back to Journals goes to menu without navigate()
    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-choice-write-journal').click();
    await new Promise((r) => setTimeout(r, 15));

    const writeBackBtn = root.querySelector('#btn-back-from-journal-to-activities');
    expect(writeBackBtn.textContent).toContain('Back to Journals');
    writeBackBtn.click();
    await new Promise((r) => setTimeout(r, 15));

    expect(root.querySelector('#journals-menu-view')).not.toBeNull();
    expect(shellModule.navigate).not.toHaveBeenCalled();
    expect(shellModule.showToast).not.toHaveBeenCalled();

    // Open Past Entries -> Entry Reader -> Edit Journal
    root.querySelector('#btn-choice-journal-history').click();
    await new Promise((r) => setTimeout(r, 15));
    const entryCard = root.querySelectorAll('.journal-entry-item').find((c) => c.dataset.day === pastDay);
    entryCard.click();
    await new Promise((r) => setTimeout(r, 15));
    root.querySelector('#btn-edit-journal-entry').click();
    await new Promise((r) => setTimeout(r, 15));

    const editBackBtn = root.querySelector('#btn-back-from-journal-to-activities');
    expect(editBackBtn.textContent).toContain('Back to Entry');

    const editDoneBtn = root.querySelector('#btn-journal-done');
    expect(editDoneBtn).not.toBeNull();
    expect(editDoneBtn.textContent.trim()).toBe('Done');
    expect(editDoneBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(editDoneBtn.classList.contains('min-w-[44px]')).toBe(true);

    // Edit title & prompt answer, click bottom Done immediately (before 800ms debounce)
    const editTitleInput = root.querySelector('#input-journal-title');
    editTitleInput.value = 'Revised Edit Title';
    editTitleInput.dispatchEvent({ type: 'input' });

    const editEditor = root.querySelector('#editor-journal-content');
    editEditor.innerHTML = 'Refined reflection content';
    editEditor.dispatchEvent({ type: 'input' });

    expect(repoModule.saveJournalEntry).not.toHaveBeenCalled();

    editDoneBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.saveJournalEntry).toHaveBeenCalledTimes(1);
    expect(repoModule.saveJournalEntry).toHaveBeenCalledWith(
      pastDay,
      expect.stringContaining('Refined reflection content'),
      { title: 'Revised Edit Title' }
    );
    expect(shellModule.navigate).not.toHaveBeenCalled();
    expect(shellModule.showToast).toHaveBeenCalledWith('Your journal has been saved', {
      position: 'top',
      duration: 3000,
    });
    expect(root.querySelector('#journal-read-view')).not.toBeNull();
    expect(root.querySelector('#journal-reader-title').textContent).toBe('Revised Edit Title');
    expect(root.querySelector('#journal-reader-card').textContent).toContain('Refined reflection content');

    cleanup();
  });
});
