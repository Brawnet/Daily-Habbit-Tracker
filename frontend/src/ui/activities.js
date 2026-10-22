/**
 * Habbit Activities UI View
 * Overhauled Choice Hub:
 * 1. Root: Activities Choice Hub (Books Summary vs Journals)
 * 2. Books Summary: Book Library List (Menu Choice Hub style) + Add New Book
 * 3. Book Menu: Action Choice (Continue Summary vs Read the Summary)
 * 4. Continue Summary: Chapter dropdown (newest top, oldest bottom) + rich list editor with hanging indents
 * 5. Read the Summary: Clean compiled chronological reader view
 * 6. Journals: Standalone Daily Journal reflection workspace
 */

import {
  listBooks,
  addBook,
  getBook,
  saveBookChapter,
  listBookChapters,
  getJournalEntry,
  saveJournalEntry,
  getSetting,
  setSetting,
  onChange,
} from '../data/repo.js';
import {
  CHEVRON_LEFT_SVG,
  LIST_BULLET_SVG,
  LIST_NUMBER_SVG,
  DEFAULT_JOURNAL_PROMPTS,
  loadJournalPrompts,
  saveJournalPrompts,
  compilePromptJournal,
  decompilePromptJournal,
  renderPromptCardsJournal,
  openCustomizePromptsModal,
  hasNonEmptyJournalAnswers,
} from './journal-prompts.js';
import { today } from '../domain/day.js';
import { showToast } from './shell.js';
import { isBlank, htmlToText, htmlToMarkdownText } from '../domain/text.js';
export const JOURNALING_LOGO_SVG = `
<svg class="w-full h-full" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <defs>
    <style>
      .act-logo-fill { fill: #ffffff; }
      @media (prefers-color-scheme: dark) {
        .act-logo-fill { fill: #27272a; }
      }
    </style>
  </defs>
  <g transform="rotate(-7.5 46 51)" stroke-width="3.2">
    <rect class="act-logo-fill" x="26" y="22" width="44" height="53" rx="8" />
    <rect x="26" y="22" width="44" height="53" rx="8" fill="none" />
    <path d="M 27 28 C 17 26 17 33 27 32" />
    <path d="M 27 36 C 17 34 17 41 27 40" />
    <path d="M 27 44 C 17 42 17 49 27 48" />
    <path d="M 27 52 C 17 50 17 57 27 56" />
    <path d="M 27 60 C 17 58 17 65 27 64" />
    <path d="M 27 68 C 17 66 17 73 27 72" />
    <line x1="37" y1="33" x2="60" y2="33" />
    <line x1="37" y1="41" x2="54" y2="41" />
  </g>
  <g transform="translate(53, 67) rotate(138)" stroke-width="3.2">
    <path class="act-logo-fill" d="M 0 0 C -2.5 -3.5 -6 -8 -6 -12 C -6 -15 6 -15 6 -12 C 6 -8 2.5 -3.5 0 0 Z" />
    <line x1="0" y1="0" x2="0" y2="-6.5" stroke-width="2.2" />
    <circle cx="0" cy="-8.5" r="1.1" fill="currentColor" stroke="none" />
    <line x1="-6.5" y1="-15" x2="6.5" y2="-15" />
    <path class="act-logo-fill" d="M -5.2 -15 L -5.2 -33 C -5.2 -36.5 5.2 -36.5 5.2 -33 L 5.2 -15" />
  </g>
</svg>
`.trim();

export const BOOKS_SUMMARY_LOGO_SVG = `
<svg class="w-full h-full" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <defs>
    <style>
      .act-logo-fill { fill: #ffffff; }
      @media (prefers-color-scheme: dark) {
        .act-logo-fill { fill: #27272a; }
      }
    </style>
  </defs>
  <g stroke-width="3">
    <path d="M 17 38 C 17 37 18 36 19 36 M 83 38 C 83 37 82 36 81 36" />
    <path d="M 17 38 L 17 67 C 17 73 33 77 50 72 C 67 77 83 73 83 67 L 83 38" />

    <path class="act-logo-fill" d="M 50 38 C 38 33 24 35 21 38 L 21 66 C 24 69 38 66 50 71 Z" />
    <path class="act-logo-fill" d="M 50 38 C 62 33 76 35 79 38 L 79 66 C 76 69 62 66 50 71 Z" />

    <line x1="50" y1="38" x2="50" y2="71" />

    <path class="act-logo-fill" d="M 35 34.5 Q 35 41.5 28 41.5 Q 35 41.5 35 48.5 Q 35 41.5 42 41.5 Q 35 41.5 35 34.5 Z" />

    <circle cx="27" cy="54" r="1.1" fill="currentColor" stroke="none" />
    <line x1="31" y1="54" x2="43" y2="54" stroke-width="2.6" />

    <circle cx="27" cy="59.5" r="1.1" fill="currentColor" stroke="none" />
    <line x1="31" y1="59.5" x2="41" y2="59.5" stroke-width="2.6" />

    <circle cx="27" cy="65" r="1.1" fill="currentColor" stroke="none" />
    <line x1="31" y1="65" x2="38" y2="65" stroke-width="2.6" />

    <line x1="53.5" y1="41.5" x2="56.5" y2="41.5" stroke-width="2.2" />
    <line x1="71" y1="41.5" x2="75" y2="41.5" stroke-width="2.2" />

    <line x1="53.5" y1="45.5" x2="56.5" y2="45.5" stroke-width="2.2" />
    <line x1="71" y1="45.5" x2="75" y2="45.5" stroke-width="2.2" />

    <line x1="53.5" y1="49.5" x2="56.5" y2="49.5" stroke-width="2.2" />
    <line x1="71" y1="49.5" x2="75" y2="49.5" stroke-width="2.2" />

    <line x1="53.5" y1="53.5" x2="56.5" y2="53.5" stroke-width="2.2" />
    <line x1="71" y1="53.5" x2="75" y2="53.5" stroke-width="2.2" />

    <line x1="53.5" y1="57.5" x2="56.5" y2="57.5" stroke-width="2.2" />
    <line x1="71" y1="57.5" x2="75" y2="57.5" stroke-width="2.2" />

    <line x1="53.5" y1="61.5" x2="56.5" y2="61.5" stroke-width="2.2" />
    <line x1="71" y1="61.5" x2="75" y2="61.5" stroke-width="2.2" />

    <line x1="53.5" y1="65.5" x2="56.5" y2="65.5" stroke-width="2.2" />
    <line x1="71" y1="65.5" x2="74" y2="65.5" stroke-width="2.2" />

    <path class="act-logo-fill" d="M 59 36 L 59 30 C 59 27.5 67 27.5 67 30 L 67 81 L 63 77 L 59 81 Z" />
    <path d="M 59 36 L 59 81 L 63 77 L 67 81 L 67 36" />
    <path d="M 59 36 L 59 30 C 59 27.5 67 27.5 67 30 L 67 36" />
  </g>
</svg>
`.trim();


const PENCIL_WRITE_SVG = `
<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
</svg>
`.trim();

const BOOK_OPEN_SVG = `
<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
</svg>
`.trim();

const PLUS_SVG = `
<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 4v16m8-8H4" />
</svg>
`.trim();


/**
 * Mounts the Activities tab into rootEl.
 *
 * @param {HTMLElement} rootEl
 * @returns {() => void} cleanup
 */
export function mount(rootEl) {
  if (!rootEl) return () => {};

  let isMounted = true;
  let renderToken = 0;
  let debounceTimer = null;

  // View state: 'home' | 'journal' | 'books-list' | 'book-menu' | 'book-edit' | 'book-read'
  let currentView = 'home';
  try {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('subview') === 'journal' || params.get('view') === 'journal') {
        currentView = 'journal';
      }
    }
  } catch {}

  let selectedBookId = null;
  let selectedChapterId = 'new'; // 'new' | chapterId
  let isAddingBook = false;

  // Transient drafts
  let newChapterTitle = '';
  let newChapterContent = '';
  let journalDraft = '';
  let journalStatus = 'Saved';
  let chapterStatus = 'Saved';
  let cachedPrompts = JSON.parse(JSON.stringify(DEFAULT_JOURNAL_PROMPTS));
  loadJournalPrompts(getSetting, setSetting)
    .then((p) => {
      if (Array.isArray(p) && p.length > 0) {
        cachedPrompts = p;
        if (isMounted && currentView === 'journal') {
          render();
        }
      }
    })
    .catch(() => {});
  rootEl.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'activities-view flex flex-col gap-6 max-w-lg mx-auto w-full pb-20 pt-2 px-4';
  rootEl.appendChild(container);

  // Load initial journal draft
  getJournalEntry(today())
    .then((entry) => {
      if (entry?.content) {
        journalDraft = entry.content;
        if (isMounted) {
          render();
        }
      }
    })
    .catch(() => {});

  const unsubscribeRepo = onChange(() => {
    if (isMounted && currentView !== 'book-edit' && currentView !== 'journal') {
      render();
    }
  });

  async function render() {
    const token = ++renderToken;
    container.innerHTML = '';

    let contentEl = null;
    try {
      if (currentView === 'journal') {
        contentEl = await renderJournalView();
      } else if (currentView === 'books-list') {
        contentEl = await renderBooksListView();
      } else if (currentView === 'book-menu') {
        contentEl = await renderBookMenuView();
      } else if (currentView === 'book-edit') {
        contentEl = await renderBookEditView();
      } else if (currentView === 'book-read') {
        contentEl = await renderBookReadView();
      } else {
        contentEl = renderHomeChoiceHub();
      }
    } catch (err) {
      console.error('Error rendering activities view:', err);
      contentEl = document.createElement('div');
      contentEl.className = 'p-4 text-sm text-red-500 text-center';
      contentEl.textContent = 'Failed to load activity view.';
    }

    if (!isMounted || token !== renderToken) return;
    if (contentEl) {
      container.appendChild(contentEl);
    }
  }

  // --- 1. Root Choice Hub ---
  function renderHomeChoiceHub() {
    const wrap = document.createElement('div');
    wrap.id = 'activities-choice-hub';
    wrap.className = 'flex flex-col gap-6';

    const header = document.createElement('header');
    header.className = 'flex flex-col items-center gap-2 text-center py-4';

    const pill = document.createElement('span');
    pill.className =
      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60';
    pill.textContent = 'Activities Hub';

    const h1 = document.createElement('h1');
    h1.className = 'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50';
    h1.textContent = 'Choose Activity';

    const sub = document.createElement('p');
    sub.className = 'text-sm text-zinc-500 dark:text-zinc-400 max-w-xs';
    sub.textContent = 'Pick what you want to focus on and document today';

    header.appendChild(pill);
    header.appendChild(h1);
    header.appendChild(sub);
    wrap.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'flex flex-col gap-3.5';

    // Choice 1: Books Summary
    const btnBooks = document.createElement('button');
    btnBooks.type = 'button';
    btnBooks.id = 'choice-books-summary';
    btnBooks.className =
      'group flex items-center justify-between p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md active:scale-[0.985] transition-all duration-150 cursor-pointer text-left w-full';

    const leftB = document.createElement('div');
    leftB.className = 'flex items-center gap-4';

    const iconB = document.createElement('div');
    iconB.className =
      'w-14 h-14 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-2 shrink-0 border border-zinc-200/80 dark:border-zinc-700/80 shadow-xs group-hover:scale-105 transition-transform';
    iconB.innerHTML = BOOKS_SUMMARY_LOGO_SVG;

    const textB = document.createElement('div');
    const titleB = document.createElement('div');
    titleB.className = 'font-semibold text-base text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors';
    titleB.textContent = 'Books Summary';

    const descB = document.createElement('div');
    descB.className = 'text-xs text-zinc-500 dark:text-zinc-400 leading-snug';
    descB.textContent = 'Document book chapters and key takeaways';

    textB.appendChild(titleB);
    textB.appendChild(descB);
    leftB.appendChild(iconB);
    leftB.appendChild(textB);

    const actionB = document.createElement('span');
    actionB.className =
      'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950/60 dark:group-hover:text-indigo-400 transition-colors shrink-0';
    actionB.textContent = 'Open Books →';
    btnBooks.appendChild(leftB);
    btnBooks.appendChild(actionB);
    btnBooks.addEventListener('click', () => {
      currentView = 'books-list';
      selectedBookId = null;
      isAddingBook = false;
      render();
    });

    // Choice 2: Journals
    const btnJournal = document.createElement('button');
    btnJournal.type = 'button';
    btnJournal.id = 'choice-journals';
    btnJournal.className =
      'group flex items-center justify-between p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md active:scale-[0.985] transition-all duration-150 cursor-pointer text-left w-full';

    const leftJ = document.createElement('div');
    leftJ.className = 'flex items-center gap-4';

    const iconJ = document.createElement('div');
    iconJ.className =
      'w-14 h-14 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-2 shrink-0 border border-zinc-200/80 dark:border-zinc-700/80 shadow-xs group-hover:scale-105 transition-transform';
    iconJ.innerHTML = JOURNALING_LOGO_SVG;

    const textJ = document.createElement('div');
    const titleJ = document.createElement('div');
    titleJ.className = 'font-semibold text-base text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors';
    titleJ.textContent = 'Journals';

    const descJ = document.createElement('div');
    descJ.className = 'text-xs text-zinc-500 dark:text-zinc-400 leading-snug';
    descJ.textContent = 'Daily personal reflections and memories';

    textJ.appendChild(titleJ);
    textJ.appendChild(descJ);
    leftJ.appendChild(iconJ);
    leftJ.appendChild(textJ);

    const actionJ = document.createElement('span');
    const isTodayJournalDone = Boolean(journalDraft && journalDraft.trim());
    if (isTodayJournalDone) {
      actionJ.className =
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 transition-colors shrink-0';
      actionJ.textContent = 'Done ✓';
    } else {
      actionJ.className =
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950/60 dark:group-hover:text-indigo-400 transition-colors shrink-0';
      actionJ.textContent = 'Write Journal →';
    }
    btnJournal.appendChild(leftJ);
    btnJournal.appendChild(actionJ);
    btnJournal.addEventListener('click', () => {
      currentView = 'journal';
      render();
    });

    grid.appendChild(btnBooks);
    grid.appendChild(btnJournal);
    wrap.appendChild(grid);

    return wrap;
  }

  // --- 2. Books List Hub ---
  async function renderBooksListView() {
    const wrap = document.createElement('div');
    wrap.id = 'books-list-view';
    wrap.className = 'flex flex-col gap-5';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'btn-back-to-activities';
    backBtn.className =
      'min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer';
    backBtn.innerHTML = `${CHEVRON_LEFT_SVG} <span>Back to Activities</span>`;
    backBtn.addEventListener('click', () => {
      currentView = 'home';
      render();
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'btn-toggle-add-book';
    addBtn.className =
      'min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white cursor-pointer transition-all shadow-xs';
    addBtn.innerHTML = isAddingBook ? '✕ Close' : `${PLUS_SVG} <span>Add New Book</span>`;
    addBtn.addEventListener('click', () => {
      isAddingBook = !isAddingBook;
      render();
    });
    header.appendChild(addBtn);
    wrap.appendChild(header);

    const titles = document.createElement('div');
    titles.className = 'flex flex-col gap-1';

    const h1 = document.createElement('h1');
    h1.className = 'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50';
    h1.textContent = 'Books Summary';

    const p = document.createElement('p');
    p.className = 'text-sm text-zinc-500 dark:text-zinc-400';
    p.textContent = 'Select a book from your library';

    titles.appendChild(h1);
    titles.appendChild(p);
    wrap.appendChild(titles);

    // Add Book Form
    if (isAddingBook) {
      const addForm = document.createElement('div');
      addForm.id = 'form-add-book';
      addForm.className =
        'p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-3 shadow-xs';

      const formTitle = document.createElement('div');
      formTitle.className = 'text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300';
      formTitle.textContent = 'Add a New Book';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.id = 'input-new-book-title';
      titleInput.placeholder = 'Book Title *';
      titleInput.className =
        'w-full min-h-[44px] px-3.5 py-2 text-base rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100';
      titleInput.style.fontSize = '16px';

      const authorInput = document.createElement('input');
      authorInput.type = 'text';
      authorInput.id = 'input-new-book-author';
      authorInput.placeholder = 'Author (optional)';
      authorInput.className =
        'w-full min-h-[44px] px-3.5 py-2 text-base rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100';
      authorInput.style.fontSize = '16px';

      const formActions = document.createElement('div');
      formActions.className = 'flex items-center gap-2 pt-1';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.id = 'btn-save-new-book';
      saveBtn.className =
        'min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl cursor-pointer flex items-center justify-center';
      saveBtn.textContent = 'Save Book';
      saveBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const author = authorInput.value.trim();
        if (!title) {
          showToast('Book title is required');
          return;
        }
        try {
          const newBook = await addBook({ title, author });
          selectedBookId = newBook.id;
          isAddingBook = false;
          currentView = 'book-menu';
          showToast('Book added');
          render();
        } catch (err) {
          showToast(err.message || 'Failed to add book');
        }
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.id = 'btn-cancel-new-book';
      cancelBtn.className = 'min-h-[44px] px-3 py-2 text-zinc-500 hover:text-zinc-700 text-xs font-medium cursor-pointer flex items-center justify-center';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        isAddingBook = false;
        render();
      });

      formActions.appendChild(saveBtn);
      formActions.appendChild(cancelBtn);

      addForm.appendChild(formTitle);
      addForm.appendChild(titleInput);
      addForm.appendChild(authorInput);
      addForm.appendChild(formActions);
      wrap.appendChild(addForm);
    }

    // Books List
    const books = await listBooks();
    const list = document.createElement('div');
    list.id = 'books-list-container';
    list.className = 'flex flex-col gap-3';

    if (books.length === 0) {
      const empty = document.createElement('div');
      empty.id = 'books-empty-state';
      empty.className =
        'p-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center flex flex-col items-center gap-2.5 text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/40';

      const emptyIcon = document.createElement('div');
      emptyIcon.className =
        'w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-2.5 mb-2 border border-zinc-200/80 dark:border-zinc-700/80 shadow-xs';
      emptyIcon.innerHTML = BOOKS_SUMMARY_LOGO_SVG;

      const emptyMain = document.createElement('p');
      emptyMain.className = 'text-sm font-semibold text-zinc-800 dark:text-zinc-200';
      emptyMain.textContent = 'No books in your library yet';

      const emptySub = document.createElement('p');
      emptySub.className = 'text-xs text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed';
      emptySub.textContent = 'Click "+ Add New Book" above to get started.';

      empty.appendChild(emptyIcon);
      empty.appendChild(emptyMain);
      empty.appendChild(emptySub);
      list.appendChild(empty);
    } else {
      for (const book of books) {
        const chapters = await listBookChapters(book.id);
        const card = document.createElement('button');
        card.type = 'button';
        card.className =
          'book-item-card group flex items-center justify-between p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-xs active:scale-[0.985] transition-all cursor-pointer text-left w-full';

        const chapterCount = chapters.length;
        const countText = chapterCount > 0 ? `${chapterCount} chapter${chapterCount > 1 ? 's' : ''}` : 'No chapters yet';

        const left = document.createElement('div');
        left.className = 'flex items-center gap-3.5';

        const icon = document.createElement('div');
        icon.className =
          'w-11 h-11 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-1.5 shrink-0 border border-zinc-200/80 dark:border-zinc-700/80 shadow-xs';
        icon.innerHTML = BOOKS_SUMMARY_LOGO_SVG;

        const text = document.createElement('div');
        const titleEl = document.createElement('div');
        titleEl.className = 'book-item-title font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 transition';
        titleEl.textContent = book.title;

        const subEl = document.createElement('div');
        subEl.className = 'text-xs text-zinc-500';
        subEl.textContent = `${book.author ? `by ${book.author} · ` : ''}${countText}`;

        text.appendChild(titleEl);
        text.appendChild(subEl);
        left.appendChild(icon);
        left.appendChild(text);

        const selectBadge = document.createElement('span');
        selectBadge.className =
          'px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950/60 dark:group-hover:text-indigo-400 transition-colors shrink-0';
        selectBadge.textContent = 'Select →';
        card.appendChild(left);
        card.appendChild(selectBadge);

        card.addEventListener('click', () => {
          selectedBookId = book.id;
          selectedChapterId = 'new';
          newChapterTitle = '';
          newChapterContent = '';
          currentView = 'book-menu';
          render();
        });

        list.appendChild(card);
      }
    }

    wrap.appendChild(list);
    return wrap;
  }

  // --- 3. Book Action Choice View ---
  async function renderBookMenuView() {
    const wrap = document.createElement('div');
    wrap.id = 'book-action-menu-view';
    wrap.className = 'flex flex-col gap-6 animate-in fade-in duration-150';

    const book = await getBook(selectedBookId);
    if (!book) {
      currentView = 'books-list';
      return renderBooksListView();
    }
    const chapters = await listBookChapters(book.id);

    // Back to Books List
    const backBar = document.createElement('div');
    backBar.className = 'flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'btn-back-to-books-list';
    backBtn.className =
      'min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer';
    backBtn.innerHTML = `${CHEVRON_LEFT_SVG} <span>Back to Books List</span>`;
    backBtn.addEventListener('click', () => {
      currentView = 'books-list';
      render();
    });

    backBar.appendChild(backBtn);
    wrap.appendChild(backBar);

    // Book Header Info
    const bookInfo = document.createElement('div');
    bookInfo.className = 'flex flex-col gap-1 text-center py-2';

    const icon = document.createElement('div');
    icon.className =
      'w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-2.5 mx-auto mb-2 border border-zinc-200/80 dark:border-zinc-700/80 shadow-xs';
    icon.innerHTML = BOOKS_SUMMARY_LOGO_SVG;

    const titleH1 = document.createElement('h1');
    titleH1.id = 'book-menu-title';
    titleH1.className = 'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50';
    titleH1.textContent = book.title;

    bookInfo.appendChild(icon);
    bookInfo.appendChild(titleH1);

    if (book.author) {
      const authorP = document.createElement('p');
      authorP.className = 'text-sm font-medium text-zinc-500';
      authorP.textContent = `by ${book.author}`;
      bookInfo.appendChild(authorP);
    }

    const chapCountP = document.createElement('p');
    chapCountP.className = 'text-xs text-zinc-400 mt-1';
    chapCountP.textContent = `${chapters.length} chapters documented`;
    bookInfo.appendChild(chapCountP);

    wrap.appendChild(bookInfo);

    // Action Choices
    const choicesContainer = document.createElement('div');
    choicesContainer.className = 'flex flex-col gap-3.5 pt-2';

    // Choice 1: Continue Summary
    const btnContinue = document.createElement('button');
    btnContinue.type = 'button';
    btnContinue.id = 'btn-choice-continue-summary';
    btnContinue.className =
      'flex items-center justify-between p-4 rounded-2xl border-2 border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition shadow-xs group cursor-pointer text-left';

    const leftC = document.createElement('div');
    leftC.className = 'flex items-center gap-3.5';

    const iconC = document.createElement('div');
    iconC.className =
      'w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center p-2.5 shadow-xs shrink-0 group-hover:scale-105 transition-transform';
    iconC.innerHTML = PENCIL_WRITE_SVG;

    const textC = document.createElement('div');
    const titleC = document.createElement('div');
    titleC.className = 'font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 transition';
    titleC.textContent = 'Continue Summary';

    const descC = document.createElement('div');
    descC.className = 'text-xs text-zinc-500 dark:text-zinc-400';
    descC.textContent = 'Write or edit chapters (newest at top)';

    textC.appendChild(titleC);
    textC.appendChild(descC);
    leftC.appendChild(iconC);
    leftC.appendChild(textC);

    const badgeC = document.createElement('span');
    badgeC.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-600 text-white shrink-0 group-hover:shadow-xs transition';
    badgeC.textContent = 'Write →';

    btnContinue.appendChild(leftC);
    btnContinue.appendChild(badgeC);
    btnContinue.addEventListener('click', () => {
      selectedChapterId = 'new';
      newChapterTitle = '';
      newChapterContent = '';
      currentView = 'book-edit';
      render();
    });

    // Choice 2: Read the Summary
    const btnRead = document.createElement('button');
    btnRead.type = 'button';
    btnRead.id = 'btn-choice-read-summary';
    btnRead.className =
      'flex items-center justify-between p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 hover:border-zinc-400 dark:hover:border-zinc-600 transition shadow-xs group cursor-pointer text-left';

    const leftR = document.createElement('div');
    leftR.className = 'flex items-center gap-3.5';

    const iconR = document.createElement('div');
    iconR.className =
      'w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center p-2.5 shrink-0 group-hover:scale-105 transition-transform';
    iconR.innerHTML = BOOK_OPEN_SVG;

    const textR = document.createElement('div');
    const titleR = document.createElement('div');
    titleR.className = 'font-bold text-zinc-900 dark:text-zinc-100 transition';
    titleR.textContent = 'Read the Summary';

    const descR = document.createElement('div');
    descR.className = 'text-xs text-zinc-500 dark:text-zinc-400';
    descR.textContent = 'Read all compiled chapters in chronological order';

    textR.appendChild(titleR);
    textR.appendChild(descR);
    leftR.appendChild(iconR);
    leftR.appendChild(textR);

    const badgeR = document.createElement('span');
    badgeR.className =
      'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition shrink-0';
    badgeR.textContent = 'Read →';

    btnRead.appendChild(leftR);
    btnRead.appendChild(badgeR);
    btnRead.addEventListener('click', () => {
      currentView = 'book-read';
      render();
    });

    choicesContainer.appendChild(btnContinue);
    choicesContainer.appendChild(btnRead);
    wrap.appendChild(choicesContainer);

    return wrap;
  }

  // --- 4. Continue Summary View (Editor with Chapter Dropdown) ---
  async function renderBookEditView() {
    const wrap = document.createElement('div');
    wrap.id = 'book-edit-view';
    wrap.className = 'flex flex-col gap-4 animate-in fade-in duration-150';

    const book = await getBook(selectedBookId);
    if (!book) {
      currentView = 'books-list';
      return renderBooksListView();
    }
    const chapters = await listBookChapters(book.id);
    const sortedChapters = [...chapters].reverse();

    const backBar = document.createElement('div');
    backBar.className = 'flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'btn-back-to-book-menu';
    backBtn.className =
      'min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer';
    backBtn.innerHTML = `${CHEVRON_LEFT_SVG} <span>Back to Book Menu</span>`;
    backBtn.addEventListener('click', () => {
      currentView = 'book-menu';
      render();
    });

    const readLink = document.createElement('button');
    readLink.type = 'button';
    readLink.id = 'btn-shortcut-read-all';
    readLink.className =
      'min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer';
    readLink.innerHTML = `${BOOK_OPEN_SVG} <span>Read All Chapters</span>`;
    readLink.addEventListener('click', () => {
      currentView = 'book-read';
      render();
    });
    backBar.appendChild(backBtn);
    backBar.appendChild(readLink);
    wrap.appendChild(backBar);

    // Book Info Header
    const bookHeader = document.createElement('div');
    bookHeader.className = 'flex items-center justify-between';

    const leftH = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.className = 'text-base font-bold text-zinc-900 dark:text-zinc-100';
    h2.textContent = book.title;
    leftH.appendChild(h2);

    if (book.author) {
      const authorP = document.createElement('p');
      authorP.className = 'text-xs text-zinc-500';
      authorP.textContent = `by ${book.author}`;
      leftH.appendChild(authorP);
    }

    const habitBadge = document.createElement('span');
    habitBadge.className =
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
    habitBadge.textContent = 'Auto-marks habit on Today';

    bookHeader.appendChild(leftH);
    bookHeader.appendChild(habitBadge);
    wrap.appendChild(bookHeader);

    // Chapter Dropdown Card
    const dropdownCard = document.createElement('div');
    dropdownCard.className = 'flex flex-col gap-2 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800';

    const dropdownLabel = document.createElement('div');
    dropdownLabel.className = 'flex items-center justify-between';

    const labelEl = document.createElement('label');
    labelEl.htmlFor = 'chapter-select';
    labelEl.className = 'text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400';
    labelEl.textContent = 'Select Chapter';

    const sortHint = document.createElement('span');
    sortHint.className = 'text-[11px] text-zinc-400';
    sortHint.textContent = 'Newest at top ↓ Oldest at bottom';

    dropdownLabel.appendChild(labelEl);
    dropdownLabel.appendChild(sortHint);
    dropdownCard.appendChild(dropdownLabel);

    const select = document.createElement('select');
    select.id = 'chapter-select';
    select.className =
      'w-full min-h-[44px] px-3.5 py-2.5 text-base font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer';
    select.style.fontSize = '16px';
    const newOpt = document.createElement('option');
    newOpt.value = 'new';
    newOpt.textContent = `✍️ + Write New Chapter (Active Draft)`;
    newOpt.selected = selectedChapterId === 'new';
    select.appendChild(newOpt);

    for (let i = 0; i < sortedChapters.length; i++) {
      const ch = sortedChapters[i];
      const opt = document.createElement('option');
      opt.value = ch.id;
      const badge = i === 0 ? '(Latest Saved)' : '';
      opt.textContent = `📖 ${ch.title} ${badge}`;
      opt.selected = selectedChapterId === ch.id;
      select.appendChild(opt);
    }

    select.addEventListener('change', (e) => {
      selectedChapterId = e.target.value;
      render();
    });

    dropdownCard.appendChild(select);
    wrap.appendChild(dropdownCard);

    // Active Chapter Editor Card
    const isNew = selectedChapterId === 'new';
    const currentChapter = isNew
      ? null
      : chapters.find((c) => c.id === selectedChapterId) || sortedChapters[0];

    const editCard = document.createElement('div');
    editCard.className =
      'flex flex-col gap-4 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs';

    const titleValue = isNew ? newChapterTitle : currentChapter?.title || '';
    const contentValue = isNew ? newChapterContent : currentChapter?.content || '';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800';

    const modeTitle = document.createElement('span');
    modeTitle.className = 'text-sm font-bold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1.5';
    modeTitle.innerHTML = `${PENCIL_WRITE_SVG} <span>${isNew ? 'Writing New Chapter' : 'Editing Chapter Summary'}</span>`;

    const statusSpan = document.createElement('span');
    statusSpan.id = 'chapter-save-status';
    statusSpan.className = 'text-xs text-zinc-400 dark:text-zinc-500';
    statusSpan.textContent = chapterStatus;

    cardHeader.appendChild(modeTitle);
    cardHeader.appendChild(statusSpan);
    editCard.appendChild(cardHeader);

    // Title input field
    const titleGroup = document.createElement('div');
    titleGroup.className = 'flex flex-col gap-1.5';

    const titleLabel = document.createElement('label');
    titleLabel.htmlFor = 'input-chapter-title';
    titleLabel.className = 'text-xs font-semibold text-zinc-500';
    titleLabel.textContent = 'Chapter Title';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'input-chapter-title';
    titleInput.placeholder = `e.g. Chapter ${chapters.length + 1}: Key Principles`;
    titleInput.value = titleValue;
    titleInput.className =
      'w-full min-h-[44px] px-3.5 py-2 text-base rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
    titleInput.style.fontSize = '16px';
    titleGroup.appendChild(titleLabel);
    titleGroup.appendChild(titleInput);
    editCard.appendChild(titleGroup);

    // Content Editor field with List buttons
    const contentGroup = document.createElement('div');
    contentGroup.className = 'flex flex-col gap-1.5';

    const contentHeader = document.createElement('div');
    contentHeader.className = 'flex items-center justify-between';

    const contentLabel = document.createElement('label');
    contentLabel.className = 'text-xs font-semibold text-zinc-500';
    contentLabel.textContent = 'Summary & Takeaways';

    const toolbar = document.createElement('div');
    toolbar.className = 'flex items-center gap-1.5';

    const bulletBtn = document.createElement('button');
    bulletBtn.type = 'button';
    bulletBtn.id = 'btn-chapter-bullet';
    bulletBtn.title = 'Insert Bullet list';
    bulletBtn.className =
      'min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition cursor-pointer inline-flex items-center gap-1.5 active:scale-95';
    bulletBtn.innerHTML = `${LIST_BULLET_SVG} <span>Bullet</span>`;

    const numberBtn = document.createElement('button');
    numberBtn.type = 'button';
    numberBtn.id = 'btn-chapter-number';
    numberBtn.title = 'Insert Numbered list';
    numberBtn.className =
      'min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition cursor-pointer inline-flex items-center gap-1.5 active:scale-95';
    numberBtn.innerHTML = `${LIST_NUMBER_SVG} <span>Numbered</span>`;
    toolbar.appendChild(bulletBtn);
    toolbar.appendChild(numberBtn);
    contentHeader.appendChild(contentLabel);
    contentHeader.appendChild(toolbar);

    const contentEditor = document.createElement('div');
    contentEditor.id = 'editor-chapter-content';
    contentEditor.setAttribute('contenteditable', 'true');
    contentEditor.setAttribute('role', 'textbox');
    contentEditor.setAttribute('aria-multiline', 'true');
    contentEditor.className =
      'rich-editor w-full min-h-[180px] p-3.5 text-base rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 overflow-y-auto leading-relaxed outline-none [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-7 [&_ol]:my-2 [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-7 [&_ul]:my-2 [&_ul]:space-y-1 [&_li]:pl-1 [&_li]:leading-relaxed [&_p]:my-1.5 [&_p]:leading-relaxed';

    contentGroup.appendChild(contentHeader);
    contentGroup.appendChild(contentEditor);
    editCard.appendChild(contentGroup);

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'flex items-center justify-between pt-1';

    const wordCountEl = document.createElement('span');
    wordCountEl.id = 'chapter-word-count';
    wordCountEl.className = 'text-xs text-zinc-400 font-mono';
    wordCountEl.textContent = '0 words';
    footer.appendChild(wordCountEl);

    if (isNew) {
      const saveChBtn = document.createElement('button');
      saveChBtn.type = 'button';
      saveChBtn.id = 'btn-save-chapter';
      saveChBtn.className =
        'px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm active:scale-95';
      saveChBtn.textContent = 'Save Chapter ✓';
      saveChBtn.addEventListener('click', async () => {
        const title = (titleInput.value || newChapterTitle || '').trim() || `Chapter ${chapters.length + 1}`;
        const content = contentEditor.innerHTML || contentEditor.textContent || newChapterContent || '';
        if (isBlank(content)) {
          showToast('Please enter chapter notes before saving');
          return;
        }

        try {
          const created = await saveBookChapter({
            bookId: book.id,
            title,
            content: htmlToMarkdownText(content),
          });
          selectedChapterId = created.id;
          newChapterTitle = '';
          newChapterContent = '';
          showToast(`Saved "${title}"`);
          render();
        } catch (err) {
          showToast(err.message || 'Failed to save chapter');
        }
      });
      footer.appendChild(saveChBtn);
    } else {
      const rightBtns = document.createElement('div');
      rightBtns.className = 'flex items-center gap-2';

      const saveExistingBtn = document.createElement('button');
      saveExistingBtn.type = 'button';
      saveExistingBtn.id = 'btn-save-existing-chapter';
      saveExistingBtn.className =
        'min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs active:scale-95';
      saveExistingBtn.textContent = 'Save Changes ✓';
      saveExistingBtn.addEventListener('click', async () => {
        if (!currentChapter) return;
        try {
          await saveBookChapter({
            id: currentChapter.id,
            bookId: currentChapter.bookId,
            title: currentChapter.title,
            content: htmlToMarkdownText(currentChapter.content),
          });
          showToast('Chapter updated');
          statusSpan.textContent = 'Saved';
        } catch (err) {
          showToast(err.message || 'Failed to save');
        }
      });

      const viewCompiledBtn = document.createElement('button');
      viewCompiledBtn.type = 'button';
      viewCompiledBtn.id = 'btn-view-compiled-reader';
      viewCompiledBtn.className =
        'min-h-[44px] px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-xl transition cursor-pointer inline-flex items-center gap-1.5';
      viewCompiledBtn.innerHTML = `${BOOK_OPEN_SVG} <span>Read Summary</span>`;
      viewCompiledBtn.addEventListener('click', () => {
        currentView = 'book-read';
        render();
      });

      rightBtns.appendChild(saveExistingBtn);
      rightBtns.appendChild(viewCompiledBtn);
      footer.appendChild(rightBtns);
    }

    editCard.appendChild(footer);

    titleInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (isNew) {
        newChapterTitle = val;
      } else if (currentChapter) {
        currentChapter.title = val;
        scheduleChapterAutosave();
      }
    });

    const { insertBullet, insertNumber } = attachRichListEditor(contentEditor, contentValue, (html) => {
      if (isNew) {
        newChapterContent = html;
      } else if (currentChapter) {
        currentChapter.content = html;
        scheduleChapterAutosave();
      }
      const textOnly = htmlToText(html);
      wordCountEl.textContent = `${textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0} words`;
    });

    const initText = htmlToText(contentValue);
    wordCountEl.textContent = `${initText ? initText.split(/\s+/).filter(Boolean).length : 0} words`;
    bulletBtn.addEventListener('click', (e) => {
      e.preventDefault();
      insertBullet();
    });
    numberBtn.addEventListener('click', (e) => {
      e.preventDefault();
      insertNumber();
    });

    function scheduleChapterAutosave() {
      if (!currentChapter) return;
      statusSpan.textContent = 'Saving...';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          await saveBookChapter({
            id: currentChapter.id,
            bookId: currentChapter.bookId,
            title: currentChapter.title,
            content: htmlToMarkdownText(currentChapter.content),
          });
          statusSpan.textContent = 'Saved';
        } catch {
          statusSpan.textContent = 'Error';
        }
      }, 800);
    }

    wrap.appendChild(editCard);
    return wrap;
  }

  // --- 5. Read the Summary View (Compiled Reader) ---
  async function renderBookReadView() {
    const wrap = document.createElement('div');
    wrap.id = 'book-read-view';
    wrap.className = 'flex flex-col gap-4 animate-in fade-in duration-150';

    const book = await getBook(selectedBookId);
    if (!book) {
      currentView = 'books-list';
      return renderBooksListView();
    }
    const chapters = await listBookChapters(book.id);

    const backBar = document.createElement('div');
    backBar.className = 'flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'btn-back-from-read-to-menu';
    backBtn.className =
      'min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer';
    backBtn.innerHTML = `${CHEVRON_LEFT_SVG} <span>Back to Book Menu</span>`;
    backBtn.addEventListener('click', () => {
      currentView = 'book-menu';
      render();
    });

    const writeShortcut = document.createElement('button');
    writeShortcut.type = 'button';
    writeShortcut.id = 'btn-shortcut-continue-summary';
    writeShortcut.className =
      'min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 active:scale-95 transition-all cursor-pointer';
    writeShortcut.innerHTML = `<span>Continue Summary</span> ${PENCIL_WRITE_SVG}`;
    writeShortcut.addEventListener('click', () => {
      selectedChapterId = 'new';
      currentView = 'book-edit';
      render();
    });

    backBar.appendChild(backBtn);
    backBar.appendChild(writeShortcut);
    wrap.appendChild(backBar);

    // Book Reader Card
    const readerCard = document.createElement('article');
    readerCard.id = 'book-reader-card';
    readerCard.className =
      'flex flex-col gap-6 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm leading-relaxed';

    const totalWords = chapters.reduce((acc, c) => {
      const clean = htmlToText(c.content);
      return acc + (clean ? clean.split(/\s+/).filter(Boolean).length : 0);
    }, 0);

    const rHeader = document.createElement('header');
    rHeader.className = 'pb-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-1';

    const overline = document.createElement('span');
    overline.className = 'text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400';
    overline.textContent = 'Complete Book Summary';

    const bookTitleH1 = document.createElement('h1');
    bookTitleH1.className = 'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mt-1';
    bookTitleH1.textContent = book.title;

    rHeader.appendChild(overline);
    rHeader.appendChild(bookTitleH1);

    if (book.author) {
      const authorP = document.createElement('p');
      authorP.className = 'text-sm font-medium text-zinc-500';
      authorP.textContent = `by ${book.author}`;
      rHeader.appendChild(authorP);
    }

    const metaDiv = document.createElement('div');
    metaDiv.className = 'flex items-center gap-3 text-xs text-zinc-400 mt-2';
    metaDiv.textContent = `${chapters.length} Chapters Documented • ${totalWords} Total Words`;
    rHeader.appendChild(metaDiv);
    readerCard.appendChild(rHeader);

    if (chapters.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-sm text-zinc-400 italic py-4 text-center';
      empty.textContent = 'No chapters summarized yet. Tap "Continue Summary" to write your first chapter.';
      readerCard.appendChild(empty);
    } else {
      const chaptersList = document.createElement('div');
      chaptersList.className = 'flex flex-col gap-6 divide-y divide-zinc-100 dark:divide-zinc-800/80';

      chapters.forEach((ch, idx) => {
        const chEl = document.createElement('section');
        chEl.className = idx > 0 ? 'pt-6 flex flex-col gap-2' : 'flex flex-col gap-2';

        const chHeading = document.createElement('h2');
        chHeading.className = 'text-base font-bold text-zinc-900 dark:text-zinc-100';
        chHeading.textContent = ch.title;
        chEl.appendChild(chHeading);

        const contentDiv = document.createElement('div');
        contentDiv.className =
          'flex flex-col gap-2 text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-7 [&_ol]:my-2 [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-7 [&_ul]:my-2 [&_ul]:space-y-1 [&_li]:pl-1 [&_li]:leading-relaxed [&_p]:my-1.5 [&_p]:leading-relaxed';
        renderSummaryContent(contentDiv, ch.content);
        chEl.appendChild(contentDiv);

        chaptersList.appendChild(chEl);
      });

      readerCard.appendChild(chaptersList);
    }

    wrap.appendChild(readerCard);
    return wrap;
  }

  // --- 6. Journals View (Prototype) ---
  async function renderJournalView() {
    const wrap = document.createElement('div');
    wrap.id = 'journal-view';
    wrap.className = 'flex flex-col gap-4 animate-in fade-in duration-150 relative';

    let prompts = cachedPrompts;
    const { answers, additionalNotes } = decompilePromptJournal(journalDraft, prompts);
    let currentNotes = additionalNotes;

    function handleUpdateAnswers(updatedNotes) {
      if (typeof updatedNotes === 'string') {
        currentNotes = updatedNotes;
      }
      const statusBadge =
        wrap.querySelector('#journal-status') ||
        wrap.querySelector('#journal-status-badge');
      if (statusBadge) statusBadge.textContent = 'Saving...';

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const compiled = compilePromptJournal(prompts, answers, currentNotes);
          journalDraft = compiled;
          await saveJournalEntry(today(), compiled);
          if (statusBadge) statusBadge.textContent = 'Saved';
        } catch {
          if (statusBadge) statusBadge.textContent = 'Error';
        }
      }, 800);
    }

    function handleSavePrompts(newPrompts) {
      cachedPrompts = newPrompts;
      prompts = newPrompts;
      saveJournalPrompts(setSetting, newPrompts);
      if (hasNonEmptyJournalAnswers(answers, currentNotes) || (journalDraft && journalDraft.trim())) {
        const compiled = compilePromptJournal(newPrompts, answers, currentNotes);
        journalDraft = compiled;
        saveJournalEntry(today(), compiled).catch(() => {});
      }
    }
    function handleOpenCustomizeModal() {
      openCustomizePromptsModal({
        prompts,
        onSave: (p) => {
          handleSavePrompts(p);
        },
        onClose: () => {
          render();
        },
      });
    }

    const cardsEl = renderPromptCardsJournal({
      prompts,
      answers,
      additionalNotes: currentNotes,
      status: journalStatus,
      onUpdateAnswers: handleUpdateAnswers,
      onOpenCustomizeModal: handleOpenCustomizeModal,
      onBack: () => {
        currentView = 'home';
        render();
      },
    });

    wrap.appendChild(cardsEl);
    return wrap;
  }

  // Initial render
  render();

  return () => {
    isMounted = false;
    clearTimeout(debounceTimer);

    unsubscribeRepo();
  };
}
/**
 * Rich Editor helper supporting hanging indents (list-outside) and auto-conversion:
 * - Typing "1." or "1" + space -> converts automatically to a numbered list
 * - Typing "-" or "*" or "•" + space -> converts automatically to a bullet dot list
 * - Wrapped lines stay indented after the number/dot (never wrapping before it)
 */
function attachRichListEditor(editorEl, initialContent, onUpdate) {
  editorEl.innerHTML = textToHtml(initialContent);

  function insertBullet() {
    editorEl.focus();
    if (typeof document !== 'undefined' && document.execCommand) {
      document.execCommand('insertUnorderedList', false, null);
    }
    onUpdate(editorEl.innerHTML);
  }

  function insertNumber() {
    editorEl.focus();
    if (typeof document !== 'undefined' && document.execCommand) {
      document.execCommand('insertOrderedList', false, null);
    }
    onUpdate(editorEl.innerHTML);
  }

  // Auto-convert on typing "1." or "1" or "-" or "*" + space
  editorEl.addEventListener('beforeinput', (e) => {
    if (e.data === ' ' && typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed) return;
      const node = sel.anchorNode;
      if (node && node.nodeType === Node.TEXT_NODE) {
        const textBefore = node.textContent.substring(0, sel.anchorOffset);
        if (/^\s*1\.?$/.test(textBefore)) {
          e.preventDefault();
          node.textContent = node.textContent.substring(sel.anchorOffset);
          if (document.execCommand) {
            document.execCommand('insertOrderedList', false, null);
          }
          onUpdate(editorEl.innerHTML);
          return;
        }
        if (/^\s*[-*•]$/.test(textBefore)) {
          e.preventDefault();
          node.textContent = node.textContent.substring(sel.anchorOffset);
          if (document.execCommand) {
            document.execCommand('insertUnorderedList', false, null);
          }
          onUpdate(editorEl.innerHTML);
          return;
        }
      }
    }
  });

  editorEl.addEventListener('keyup', (e) => {
    if ((e.key === ' ' || e.key === 'Spacebar') && typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed) return;
      const node = sel.anchorNode;
      if (node && node.nodeType === Node.TEXT_NODE) {
        const textBefore = node.textContent.substring(0, sel.anchorOffset);
        if (/^\s*1\.?\s$/.test(textBefore)) {
          node.textContent = node.textContent.replace(/^\s*1\.?\s/, '');
          if (document.execCommand) {
            document.execCommand('insertOrderedList', false, null);
          }
          onUpdate(editorEl.innerHTML);
        } else if (/^\s*[-*•]\s$/.test(textBefore)) {
          node.textContent = node.textContent.replace(/^\s*[-*•]\s/, '');
          if (document.execCommand) {
            document.execCommand('insertUnorderedList', false, null);
          }
          onUpdate(editorEl.innerHTML);
        }
      }
    }
  });

  editorEl.addEventListener('input', () => {
    onUpdate(editorEl.innerHTML);
  });

  editorEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      setTimeout(() => {
        onUpdate(editorEl.innerHTML);
      }, 0);
    }
  });

  return { insertBullet, insertNumber };
}

/**
 * Converts plain text or HTML to formatted content with hanging-indented lists (<ol class="list-outside">)
 */
function renderSummaryContent(containerEl, content) {
  if (!content) return;
  if (content.includes('<p>') || content.includes('<li>')) {
    containerEl.innerHTML = content;
    if (!containerEl.children.length) {
      containerEl.textContent = content.replace(/<[^>]*>/g, ' ');
    }
    return;
  }
  const blocks = content.split('\n\n');
  blocks.forEach((block) => {
    const lines = block.split('\n');
    const isBullet = lines.every((l) => /^\s*[•\-\*]\s/.test(l));
    const isNumber = lines.every((l) => /^\s*\d+\.\s/.test(l));

    if (isBullet) {
      const ul = document.createElement('ul');
      ul.className = 'list-disc list-outside pl-7 my-2 space-y-1';
      lines.forEach((l) => {
        const li = document.createElement('li');
        li.className = 'pl-1 leading-relaxed';
        li.textContent = l.replace(/^\s*[•\-\*]\s*/, '');
        ul.appendChild(li);
      });
      containerEl.appendChild(ul);
    } else if (isNumber) {
      const ol = document.createElement('ol');
      ol.className = 'list-decimal list-outside pl-7 my-2 space-y-1';
      lines.forEach((l) => {
        const li = document.createElement('li');
        li.className = 'pl-1 leading-relaxed';
        li.textContent = l.replace(/^\s*\d+\.\s*/, '');
        ol.appendChild(li);
      });
      containerEl.appendChild(ol);
    } else {
      const p = document.createElement('p');
      p.className = 'my-1.5 leading-relaxed';
      p.textContent = lines.join(' ');
      containerEl.appendChild(p);
    }
  });
}

function textToHtml(content) {
  if (!content) return '<p><br></p>';
  const temp = document.createElement('div');
  renderSummaryContent(temp, content);
  return temp.innerHTML || content;
}
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
