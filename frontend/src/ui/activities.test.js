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

    const journalBtn = root.querySelector('#choice-journals');
    expect(journalBtn).not.toBeNull();
    expect(journalBtn.textContent).toContain('Journals');

    cleanup();
  });

  it('navigates to Journals view, supports bullet/number shortcuts and autosaves', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    // Open Journals
    const journalBtn = root.querySelector('#choice-journals');
    journalBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const journalView = root.querySelector('#journal-view');
    expect(journalView).not.toBeNull();

    const editor = root.querySelector('#editor-journal-content');
    expect(editor).not.toBeNull();

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
