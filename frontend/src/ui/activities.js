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
  onChange,
} from '../data/repo.js';
import { today } from '../domain/day.js';
import { showToast } from './shell.js';

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
  let selectedBookId = null;
  let selectedChapterId = 'new'; // 'new' | chapterId
  let isAddingBook = false;

  // Transient drafts
  let newChapterTitle = '';
  let newChapterContent = '';
  let journalDraft = '';
  let journalStatus = 'Saved';
  let chapterStatus = 'Saved';

  rootEl.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'activities-view flex flex-col gap-6 max-w-lg mx-auto w-full pb-20 pt-2 px-4';
  rootEl.appendChild(container);

  // Load initial journal draft
  getJournalEntry(today())
    .then((entry) => {
      if (entry?.content) {
        journalDraft = entry.content;
      }
    })
    .catch(() => {});

  const unsubscribeRepo = onChange(() => {
    if (isMounted) {
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
    header.className = 'flex flex-col gap-1 text-center py-4';

    const h1 = document.createElement('h1');
    h1.className = 'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50';
    h1.textContent = 'Choose Activity';

    const sub = document.createElement('p');
    sub.className = 'text-sm text-zinc-500 dark:text-zinc-400';
    sub.textContent = 'Select what you want to work on';

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
      'flex items-center justify-between p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 hover:border-indigo-500 dark:hover:border-indigo-500 transition shadow-xs group cursor-pointer text-left';

    const leftB = document.createElement('div');
    leftB.className = 'flex items-center gap-3.5';

    const iconB = document.createElement('div');
    iconB.className =
      'w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xl shrink-0';
    iconB.textContent = '📖';

    const textB = document.createElement('div');
    const titleB = document.createElement('div');
    titleB.className = 'font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 transition';
    titleB.textContent = 'Books Summary';

    const descB = document.createElement('div');
    descB.className = 'text-xs text-zinc-500';
    descB.textContent = 'Document book chapters and key takeaways';

    textB.appendChild(titleB);
    textB.appendChild(descB);
    leftB.appendChild(iconB);
    leftB.appendChild(textB);

    const actionB = document.createElement('span');
    actionB.className =
      'px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0';
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
      'flex items-center justify-between p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 hover:border-indigo-500 dark:hover:border-indigo-500 transition shadow-xs group cursor-pointer text-left';

    const leftJ = document.createElement('div');
    leftJ.className = 'flex items-center gap-3.5';

    const iconJ = document.createElement('div');
    iconJ.className =
      'w-11 h-11 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 flex items-center justify-center text-xl shrink-0';
    iconJ.textContent = '✍️';

    const textJ = document.createElement('div');
    const titleJ = document.createElement('div');
    titleJ.className = 'font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 transition';
    titleJ.textContent = 'Journals';

    const descJ = document.createElement('div');
    descJ.className = 'text-xs text-zinc-500';
    descJ.textContent = 'Daily personal reflections and memories';

    textJ.appendChild(titleJ);
    textJ.appendChild(descJ);
    leftJ.appendChild(iconJ);
    leftJ.appendChild(textJ);

    const actionJ = document.createElement('span');
    actionJ.className =
      'px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0';
    actionJ.textContent = 'Write Journal →';

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
    backBtn.className = 'text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer';
    backBtn.textContent = '← Back to Activities';
    backBtn.addEventListener('click', () => {
      currentView = 'home';
      render();
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'btn-toggle-add-book';
    addBtn.className =
      'px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition shadow-2xs';
    addBtn.textContent = isAddingBook ? '✕ Close' : '+ Add New Book';
    addBtn.addEventListener('click', () => {
      isAddingBook = !isAddingBook;
      render();
    });

    header.appendChild(backBtn);
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
        'w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100';

      const authorInput = document.createElement('input');
      authorInput.type = 'text';
      authorInput.id = 'input-new-book-author';
      authorInput.placeholder = 'Author (optional)';
      authorInput.className =
        'w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100';

      const formActions = document.createElement('div');
      formActions.className = 'flex items-center gap-2 pt-1';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.id = 'btn-save-new-book';
      saveBtn.className =
        'px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg cursor-pointer';
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
      cancelBtn.className = 'px-3 py-2 text-zinc-500 hover:text-zinc-700 text-xs font-medium cursor-pointer';
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
        'p-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center flex flex-col items-center gap-2 text-zinc-500';

      const emptyIcon = document.createElement('span');
      emptyIcon.className = 'text-3xl';
      emptyIcon.textContent = '📖';

      const emptyMain = document.createElement('p');
      emptyMain.className = 'text-sm font-medium';
      emptyMain.textContent = 'No books in your library yet';

      const emptySub = document.createElement('p');
      emptySub.className = 'text-xs text-zinc-400';
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
          'book-item-card flex items-center justify-between p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 hover:border-indigo-500 dark:hover:border-indigo-500 transition shadow-xs group cursor-pointer text-left';

        const chapterCount = chapters.length;
        const countText = chapterCount > 0 ? `${chapterCount} chapter${chapterCount > 1 ? 's' : ''}` : 'No chapters yet';

        const left = document.createElement('div');
        left.className = 'flex items-center gap-3.5';

        const icon = document.createElement('div');
        icon.className =
          'w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center text-lg shrink-0';
        icon.textContent = '📖';

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
          'px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0';
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
    backBtn.className = 'text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer';
    backBtn.textContent = '← Back to Books List';
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
      'w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center text-3xl mx-auto mb-2';
    icon.textContent = '📖';

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
      'w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg shadow-xs shrink-0';
    iconC.textContent = '✍️';

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
    badgeC.className = 'px-3 py-1 rounded-full text-xs font-bold bg-indigo-600 text-white shrink-0';
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
      'w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-lg shrink-0';
    iconR.textContent = '👓';

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
      'px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0';
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
    backBtn.className = 'text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer';
    backBtn.textContent = '← Back to Book Menu';
    backBtn.addEventListener('click', () => {
      currentView = 'book-menu';
      render();
    });

    const readLink = document.createElement('button');
    readLink.type = 'button';
    readLink.id = 'btn-shortcut-read-all';
    readLink.className = 'text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1';
    readLink.textContent = '👓 Read All Chapters';
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
      'w-full min-h-[44px] px-3.5 py-2.5 text-sm font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer';

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
    modeTitle.className = 'text-sm font-bold text-indigo-600 dark:text-indigo-400';
    modeTitle.textContent = isNew ? '✍️ Writing New Chapter' : '✍️ Editing Chapter Summary';

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
      'w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';

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
    bulletBtn.title = 'Insert Bullet / Dot list';
    bulletBtn.className =
      'px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition cursor-pointer flex items-center gap-1 active:scale-95';
    bulletBtn.textContent = '• Dot';

    const numberBtn = document.createElement('button');
    numberBtn.type = 'button';
    numberBtn.id = 'btn-chapter-number';
    numberBtn.title = 'Insert Numbered list';
    numberBtn.className =
      'px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition cursor-pointer flex items-center gap-1 active:scale-95';
    numberBtn.textContent = '1. Number';

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
        if (!content.replace(/<[^>]*>/g, ' ').trim()) {
          showToast('Please enter chapter notes before saving');
          return;
        }

        try {
          const created = await saveBookChapter({
            bookId: book.id,
            title,
            content,
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
      const viewCompiledBtn = document.createElement('button');
      viewCompiledBtn.type = 'button';
      viewCompiledBtn.id = 'btn-view-compiled-reader';
      viewCompiledBtn.className =
        'px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-xl transition cursor-pointer';
      viewCompiledBtn.textContent = '👓 View in Read Summary';
      viewCompiledBtn.addEventListener('click', () => {
        currentView = 'book-read';
        render();
      });
      footer.appendChild(viewCompiledBtn);
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
      const textOnly = html.replace(/<[^>]*>/g, ' ').trim();
      wordCountEl.textContent = `${textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0} words`;
    });

    const initText = contentValue.replace(/<[^>]*>/g, ' ').trim();
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
            content: currentChapter.content,
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
    backBtn.className = 'text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer';
    backBtn.textContent = '← Back to Book Menu';
    backBtn.addEventListener('click', () => {
      currentView = 'book-menu';
      render();
    });

    const writeShortcut = document.createElement('button');
    writeShortcut.type = 'button';
    writeShortcut.id = 'btn-shortcut-continue-summary';
    writeShortcut.className = 'text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer';
    writeShortcut.textContent = 'Continue Summary ✍️';
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
      const clean = (c.content || '').replace(/<[^>]*>/g, ' ').trim();
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
        contentDiv.innerHTML = textToHtml(ch.content);
        contentDiv.textContent = ch.content.replace(/<[^>]*>/g, ' ');
        chEl.appendChild(contentDiv);

        chaptersList.appendChild(chEl);
      });

      readerCard.appendChild(chaptersList);
    }

    wrap.appendChild(readerCard);
    return wrap;
  }

  // --- 6. Journals View ---
  async function renderJournalView() {
    const wrap = document.createElement('div');
    wrap.id = 'journal-view';
    wrap.className = 'flex flex-col gap-4 animate-in fade-in duration-150';

    const backBar = document.createElement('div');
    backBar.className = 'flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'btn-back-from-journal-to-activities';
    backBtn.className = 'text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer';
    backBtn.textContent = '← Back to Activities';
    backBtn.addEventListener('click', () => {
      currentView = 'home';
      render();
    });

    const statusBadge = document.createElement('span');
    statusBadge.id = 'journal-status';
    statusBadge.className = 'text-xs text-zinc-400 dark:text-zinc-500';
    statusBadge.textContent = journalStatus;

    backBar.appendChild(backBtn);
    backBar.appendChild(statusBadge);
    wrap.appendChild(backBar);

    const card = document.createElement('div');
    card.className = 'flex flex-col gap-4 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800';

    const iconJ = document.createElement('span');
    iconJ.className = 'text-xl';
    iconJ.textContent = '✍️';

    const titleWrap = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.className = 'text-base font-bold text-zinc-900 dark:text-zinc-100';
    h2.textContent = 'Daily Journal Reflection';

    const p = document.createElement('p');
    p.className = 'text-xs text-zinc-500';
    p.textContent = 'Personal thoughts, memories, and ideas for today';

    titleWrap.appendChild(h2);
    titleWrap.appendChild(p);
    cardHeader.appendChild(iconJ);
    cardHeader.appendChild(titleWrap);
    card.appendChild(cardHeader);

    const formGroup = document.createElement('div');
    formGroup.className = 'flex flex-col gap-1.5';

    const row = document.createElement('div');
    row.className = 'flex items-center justify-between';

    const label = document.createElement('label');
    label.className = 'text-xs font-semibold text-zinc-500';
    label.textContent = 'Reflections & Notes';

    const toolbar = document.createElement('div');
    toolbar.className = 'flex items-center gap-1.5';

    const bulletBtn = document.createElement('button');
    bulletBtn.type = 'button';
    bulletBtn.id = 'btn-journal-bullet';
    bulletBtn.title = 'Insert Bullet / Dot';
    bulletBtn.className =
      'px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition cursor-pointer flex items-center gap-1 active:scale-95';
    bulletBtn.textContent = '• Dot';

    const numberBtn = document.createElement('button');
    numberBtn.type = 'button';
    numberBtn.id = 'btn-journal-number';
    numberBtn.title = 'Insert Numbered list';
    numberBtn.className =
      'px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition cursor-pointer flex items-center gap-1 active:scale-95';
    numberBtn.textContent = '1. Number';

    toolbar.appendChild(bulletBtn);
    toolbar.appendChild(numberBtn);
    row.appendChild(label);
    row.appendChild(toolbar);

    const jEditor = document.createElement('div');
    jEditor.id = 'editor-journal-content';
    jEditor.setAttribute('contenteditable', 'true');
    jEditor.setAttribute('role', 'textbox');
    jEditor.setAttribute('aria-multiline', 'true');
    jEditor.className =
      'rich-editor w-full min-h-[200px] p-3.5 text-base rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 overflow-y-auto leading-relaxed outline-none [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-7 [&_ol]:my-2 [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-7 [&_ul]:my-2 [&_ul]:space-y-1 [&_li]:pl-1 [&_li]:leading-relaxed [&_p]:my-1.5 [&_p]:leading-relaxed';

    formGroup.appendChild(row);
    formGroup.appendChild(jEditor);
    card.appendChild(formGroup);

    const footer = document.createElement('div');
    footer.className = 'flex items-center justify-between text-xs text-zinc-400';

    const note = document.createElement('span');
    note.textContent = 'Always editable';

    const jWordCount = document.createElement('span');
    jWordCount.id = 'journal-word-count';
    jWordCount.className = 'font-mono';
    jWordCount.textContent = '0 words';

    footer.appendChild(note);
    footer.appendChild(jWordCount);
    card.appendChild(footer);

    const { insertBullet: jBullet, insertNumber: jNum } = attachRichListEditor(
      jEditor,
      journalDraft,
      (html) => {
        journalDraft = html;
        const textOnly = html.replace(/<[^>]*>/g, ' ').trim();
        jWordCount.textContent = `${textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0} words`;

        statusBadge.textContent = 'Saving...';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            await saveJournalEntry(today(), journalDraft);
            statusBadge.textContent = 'Saved';
          } catch {
            statusBadge.textContent = 'Error';
          }
        }, 800);
      }
    );

    const initWords = journalDraft.replace(/<[^>]*>/g, ' ').trim();
    jWordCount.textContent = `${initWords ? initWords.split(/\s+/).filter(Boolean).length : 0} words`;

    bulletBtn.addEventListener('click', (e) => {
      e.preventDefault();
      jBullet();
    });
    numberBtn.addEventListener('click', (e) => {
      e.preventDefault();
      jNum();
    });

    wrap.appendChild(card);
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

  return { insertBullet, insertNumber };
}

/**
 * Converts plain text or HTML to formatted content with hanging-indented lists (<ol class="list-outside">)
 */
function textToHtml(content) {
  if (!content) return '<p><br></p>';
  if (content.includes('<p>') || content.includes('<li>')) return content;
  const blocks = content.split('\n\n');
  return blocks
    .map((block) => {
      const lines = block.split('\n');
      const isBullet = lines.every((l) => /^\s*•\s/.test(l));
      const isNumber = lines.every((l) => /^\s*\d+\.\s/.test(l));

      if (isBullet) {
        const items = lines
          .map((l) => `<li class="pl-1 leading-relaxed">${escapeHtml(l.replace(/^\s*•\s*/, ''))}</li>`)
          .join('');
        return `<ul class="list-disc list-outside pl-7 my-2 space-y-1">${items}</ul>`;
      }
      if (isNumber) {
        const items = lines
          .map((l) => `<li class="pl-1 leading-relaxed">${escapeHtml(l.replace(/^\s*\d+\.\s*/, ''))}</li>`)
          .join('');
        return `<ol class="list-decimal list-outside pl-7 my-2 space-y-1">${items}</ol>`;
      }

      return `<p class="my-1.5 leading-relaxed">${lines.map(escapeHtml).join('<br>')}</p>`;
    })
    .join('');
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
