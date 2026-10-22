import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockElement, MockDocument } from './test-helpers.js';

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
      saveJournalEntry: vi.fn(async (day, content) => {
        const entry = {
          day,
          content: String(content ?? ''),
          updatedAt: new Date().toISOString(),
          printedToDiaryAt: '',
        };
        journalEntries[day] = entry;
        for (const l of listeners) l();
        return entry;
      }),
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

  it('navigates to Journals view, renders Prompt Cards Stack with defaults and formatting shortcuts', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    // Open Journals
    const journalBtn = root.querySelector('#choice-journals');
    journalBtn.click();
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

    // Additional notes card is present
    const notesEditor = root.querySelector('#editor-journal-notes');
    expect(notesEditor).not.toBeNull();

    // Formatting shortcuts exist
    const bulletBtn = root.querySelector('#btn-journal-bullet');
    expect(bulletBtn).not.toBeNull();
    const numberBtn = root.querySelector('#btn-journal-number');
    expect(numberBtn).not.toBeNull();

    // Back to activities
    const backBtn = root.querySelector('#btn-back-from-journal-to-activities');
    expect(backBtn).not.toBeNull();
    backBtn.click();
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

    const editor0 = root.querySelector('#editor-journal-content');
    const notesEditor = root.querySelector('#editor-journal-notes');
    const wordBadge = root.querySelector('#journal-total-words');

    expect(wordBadge.textContent).toBe('0 words');

    // Type in prompt 1
    editor0.innerHTML = '<p>Had a productive planning session</p>';
    editor0.dispatchEvent({ type: 'input' });

    expect(wordBadge.textContent).toBe('5 words');

    // Type in additional notes
    notesEditor.innerHTML = '<p>Remember to stretch before sleep</p>';
    notesEditor.dispatchEvent({ type: 'input' });

    expect(wordBadge.textContent).toBe('10 words');

    // Fast-forward past debounce (800ms)
    await new Promise((r) => setTimeout(r, 850));

    expect(repoModule.saveJournalEntry).toHaveBeenCalled();
    const lastCall = repoModule.saveJournalEntry.mock.calls.at(-1);
    expect(lastCall[1]).toContain('data-prompt-id="jp_day"');
    expect(lastCall[1]).toContain('How was your day?');
    expect(lastCall[1]).toContain('Had a productive planning session');
    expect(lastCall[1]).toContain('Additional Notes');
    expect(lastCall[1]).toContain('Remember to stretch before sleep');
    // Unanswered prompts omitted
    expect(lastCall[1]).not.toContain('What went well today?');
    expect(lastCall[1]).not.toContain('What could be improved?');

    cleanup();
  });

  it('rehydrates prompt answers and additional notes from compiled journal entry on load', async () => {
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
      day: '2026-10-22',
      content: compiledEntry,
    }));

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    root.querySelector('#choice-journals').click();
    await new Promise((r) => setTimeout(r, 10));

    const editor0 = root.querySelector('#editor-journal-content');
    expect(editor0.innerHTML).toBe('Felt very accomplished.');

    const editor1 = root.querySelector('#editor-journal-content-1');
    expect(editor1.innerHTML).toBe('Completed all deep work sprints.');

    const notesEditor = root.querySelector('#editor-journal-notes');
    expect(notesEditor.innerHTML).toBe('Quiet evening tea.');

    cleanup();
  });

  it('customizes prompts: reorders, renames, soft-deletes, and adds new questions via modal', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    root.querySelector('#choice-journals').click();
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

  it('reflects Done badge on Choice Hub when journal has content, and Write Journal when empty', async () => {
    // 1. With empty journal
    repoModule.getJournalEntry = vi.fn(async () => null);
    const root1 = mockDoc.createElement('div');
    const cleanup1 = mount(root1);
    await new Promise((r) => setTimeout(r, 10));

    const journalBtn1 = root1.querySelector('#choice-journals');
    expect(journalBtn1.textContent).toContain('Write Journal →');
    expect(journalBtn1.textContent).not.toContain('Done ✓');
    cleanup1();

    // 2. With answered journal
    repoModule.getJournalEntry = vi.fn(async () => ({
      day: '2026-10-22',
      content: '<div class="journal-prompt-block"><p>Reflected</p></div>',
    }));
    const root2 = mockDoc.createElement('div');
    const cleanup2 = mount(root2);
    await new Promise((r) => setTimeout(r, 10));

    const journalBtn2 = root2.querySelector('#choice-journals');
    expect(journalBtn2.textContent).toContain('Done ✓');
    cleanup2();
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
});
