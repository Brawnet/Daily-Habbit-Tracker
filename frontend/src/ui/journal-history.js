/**
 * journal-history.js
 *
 * Journals Choice Menu, Journal History search/list, and separate in-page
 * read-only Entry Reader subview for Activities tab.
 */

import { formatShort } from '../domain/day.js';
import { searchEntries } from '../domain/search.js';
import {
  isJournalEntryWritten,
  normalizeJournalTitle,
  parseStructuredJournalBlocks,
  resolveJournalDisplayHeader,
  sanitizeJournalHtml,
} from '../domain/journal.js';
import { htmlToText, isBlank } from '../domain/text.js';
import { CHEVRON_LEFT_SVG } from './journal-prompts.js';

function formatEntryCountLabel(count) {
  return `${count} ${count === 1 ? 'Journal Entry' : 'Journal Entries'}`;
}

function createBackButton({ id, label, onClick }) {
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.id = id;
  backBtn.className =
    'self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#68655F] dark:text-[#A39E93] hover:text-[#1C1B18] dark:hover:text-[#F4F1EA] cursor-pointer py-2 px-1 -ml-1 min-h-[44px] tactile-spring';
  backBtn.innerHTML = `${CHEVRON_LEFT_SVG} <span>${label}</span>`;
  backBtn.addEventListener('click', onClick);
  return backBtn;
}

/**
 * Populates text with `<mark>` highlight spans in a single DOM-node pass.
 * @param {HTMLElement} containerEl
 * @param {string} plainText
 * @param {Array<[number, number]>} highlights
 */
function setHighlightedText(containerEl, plainText, highlights) {
  containerEl.innerHTML = '';
  if (!highlights || highlights.length === 0) {
    containerEl.textContent = plainText;
    return;
  }

  let idx = 0;
  for (const [start, end] of highlights) {
    if (start > idx) {
      const span = document.createElement('span');
      span.textContent = plainText.slice(idx, start);
      containerEl.appendChild(span);
    }
    const mark = document.createElement('mark');
    mark.className = 'bg-amber-200 dark:bg-amber-900/60 text-inherit';
    mark.textContent = plainText.slice(start, end);
    containerEl.appendChild(mark);
    idx = end;
  }
  if (idx < plainText.length) {
    const span = document.createElement('span');
    span.textContent = plainText.slice(idx);
    containerEl.appendChild(span);
  }
}

/**
 * Builds a consistent action choice button for the Journals Menu.
 * @param {{ id: string, primary?: boolean, iconSvg: string, title: string, description: string, badgeLabel: string, onClick: () => void }} opts
 * @returns {HTMLButtonElement}
 */
function createChoiceButton({ id, primary = false, iconSvg, title, description, badgeLabel, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.className = primary
    ? 'flex items-center justify-between p-4 min-h-[44px] rounded-xl border-2 border-[#B56565] bg-[#FBF2F2] dark:bg-[rgba(181,101,101,0.2)] hover:bg-[#F7E6E6] dark:hover:bg-[rgba(181,101,101,0.3)] transition-all group cursor-pointer text-left tactile-spring'
    : 'editorial-card flex items-center justify-between p-4 min-h-[44px] hover:border-[#68655F] dark:hover:border-[#A39E93] transition group cursor-pointer text-left tactile-spring bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';

  const left = document.createElement('div');
  left.className = 'flex items-center gap-3.5';

  const iconBox = document.createElement('div');
  iconBox.className = primary
    ? 'w-11 h-11 rounded-lg bg-[#9E4B4B] text-[#FAF8F5] flex items-center justify-center p-2.5 shrink-0 group-hover:scale-105 transition-transform'
    : 'w-11 h-11 rounded-lg bg-[#EFECE6] dark:bg-[#2C2926] text-[#1C1B18] dark:text-[#F4F1EA] flex items-center justify-center p-2.5 shrink-0 group-hover:scale-105 transition-transform';
  iconBox.innerHTML = iconSvg;

  const textWrap = document.createElement('div');
  const titleEl = document.createElement('div');
  titleEl.className = primary
    ? 'font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA] group-hover:text-[#9E4B4B] dark:group-hover:text-[#D99191] transition'
    : 'font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA] transition';
  titleEl.textContent = title;

  const descEl = document.createElement('div');
  descEl.className = 'text-xs text-[#68655F] dark:text-[#A39E93]';
  descEl.textContent = description;

  textWrap.appendChild(titleEl);
  textWrap.appendChild(descEl);
  left.appendChild(iconBox);
  left.appendChild(textWrap);

  const badge = document.createElement('span');
  badge.className = primary
    ? 'px-3.5 py-1.5 rounded-full text-xs font-mono font-semibold bg-[#9E4B4B] text-[#FAF8F5] shrink-0 transition'
    : 'badge-rose px-3.5 py-1.5 rounded-full text-xs font-mono font-semibold transition shrink-0';
  badge.textContent = badgeLabel;

  btn.appendChild(left);
  btn.appendChild(badge);
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Renders the 2-choice Journals Menu (Write a Journal vs Journal History).
 */
export function renderJournalsChoiceMenu({
  isTodayDone,
  entryCount,
  logoSvg,
  pencilSvg,
  bookSvg,
  onBack,
  onWriteJournal,
  onOpenHistory,
}) {
  const wrap = document.createElement('div');
  wrap.id = 'journals-menu-view';
  wrap.className = 'flex flex-col gap-5 animate-in fade-in duration-150';

  wrap.appendChild(
    createBackButton({
      id: 'btn-back-from-journals-menu',
      label: 'Back to Activities',
      onClick: onBack,
    })
  );

  const headerInfo = document.createElement('div');
  headerInfo.className = 'flex flex-col items-center text-center gap-2 py-4 px-2';

  const icon = document.createElement('div');
  icon.className =
    'w-16 h-16 rounded-2xl bg-[#FBF2F2] dark:bg-[rgba(181,101,101,0.2)] text-[#9E4B4B] dark:text-[#D99191] flex items-center justify-center p-3 border border-[#E6E4DF] dark:border-[#33302C] shadow-none mb-2';
  icon.innerHTML = logoSvg;

  const titleH1 = document.createElement('h1');
  titleH1.id = 'journals-menu-title';
  titleH1.className =
    'text-2xl font-serif font-semibold tracking-tight text-[#1C1B18] dark:text-[#F4F1EA]';
  titleH1.textContent = 'Journals';

  const statusPill = document.createElement('span');
  statusPill.className = isTodayDone
    ? 'badge-sage inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-mono font-semibold'
    : 'badge-rose inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-mono font-semibold';
  statusPill.textContent = isTodayDone ? 'Today: Written ✓' : 'Today: Not written yet';

  const countP = document.createElement('p');
  countP.className = 'text-xs font-mono text-[#68655F] dark:text-[#A39E93] mt-1';
  countP.textContent = `${formatEntryCountLabel(entryCount)} documented`;

  headerInfo.appendChild(icon);
  headerInfo.appendChild(titleH1);
  headerInfo.appendChild(statusPill);
  headerInfo.appendChild(countP);
  wrap.appendChild(headerInfo);

  const choicesContainer = document.createElement('div');
  choicesContainer.className = 'flex flex-col gap-3.5 pt-2';

  choicesContainer.appendChild(
    createChoiceButton({
      id: 'btn-choice-write-journal',
      primary: true,
      iconSvg: pencilSvg,
      title: 'Write a Journal',
      description: 'Write today’s reflection or backfill up to 7 days',
      badgeLabel: 'Write →',
      onClick: onWriteJournal,
    })
  );

  choicesContainer.appendChild(
    createChoiceButton({
      id: 'btn-choice-journal-history',
      primary: false,
      iconSvg: bookSvg,
      title: 'Journal History',
      description: 'Search, read, and edit past Journal Entries',
      badgeLabel: 'Read →',
      onClick: onOpenHistory,
    })
  );

  wrap.appendChild(choicesContainer);
  return wrap;
}

/**
 * Renders the Journal History list & offline search view inside Activities.
 */
export function renderJournalHistoryView({
  entries,
  todayDay,
  query = '',
  onQueryChange,
  onBack,
  onSelectEntry,
  onWriteToday,
}) {
  const nonEmptyEntries = (entries || []).filter(isJournalEntryWritten);
  let currentQuery = query || '';

  const wrap = document.createElement('div');
  wrap.id = 'journal-history-view';
  wrap.className = 'flex flex-col gap-4 animate-in fade-in duration-150';

  const topBar = document.createElement('div');
  topBar.className = 'flex items-center justify-between gap-2';

  const backBtn = createBackButton({
    id: 'btn-back-from-journal-history',
    label: 'Back to Journals',
    onClick: onBack,
  });

  const countBadge = document.createElement('span');
  countBadge.className = 'badge-rose px-3 py-1 rounded-full text-xs font-mono font-semibold';
  countBadge.textContent = formatEntryCountLabel(nonEmptyEntries.length);

  topBar.appendChild(backBtn);
  topBar.appendChild(countBadge);
  wrap.appendChild(topBar);

  const heading = document.createElement('h1');
  heading.className = 'text-2xl font-serif font-semibold tracking-tight text-[#1C1B18] dark:text-[#F4F1EA]';
  heading.textContent = 'Journal History';
  wrap.appendChild(heading);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'journal-history-search';
  searchInput.value = currentQuery;
  searchInput.placeholder = 'Search Journal Entries by title, keyword, or Day...';
  searchInput.setAttribute('aria-label', 'Search Journal Entries by title, keyword, or Day...');
  searchInput.style.fontSize = '16px';
  searchInput.className =
    'journal-search-input w-full min-h-[44px] px-4 py-2.5 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#FFFFFF] dark:bg-[#22201E] text-[#1C1B18] dark:text-[#F4F1EA] placeholder-[#68655F] focus:outline-none focus:ring-2 focus:ring-[#9E4B4B]';
  wrap.appendChild(searchInput);

  const entriesListEl = document.createElement('div');
  entriesListEl.id = 'journal-history-list';
  entriesListEl.className = 'flex flex-col gap-2.5';
  wrap.appendChild(entriesListEl);

  function renderList() {
    entriesListEl.innerHTML = '';

    if (nonEmptyEntries.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.id = 'journal-history-empty-state';
      emptyCard.className =
        'editorial-card flex flex-col items-center justify-center p-8 text-center gap-3 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';

      const emptyText = document.createElement('p');
      emptyText.className = 'text-sm text-[#68655F] dark:text-[#A39E93]';
      emptyText.textContent = 'No Journal Entries yet. Start capturing your reflections today.';

      const ctaBtn = document.createElement('button');
      ctaBtn.type = 'button';
      ctaBtn.id = 'btn-empty-write-today-journal';
      ctaBtn.className =
        'min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#9E4B4B] text-[#FAF8F5] hover:opacity-90 active:scale-95 transition cursor-pointer tactile-spring';
      ctaBtn.textContent = "Write Today's Journal";
      ctaBtn.addEventListener('click', onWriteToday);

      emptyCard.appendChild(emptyText);
      emptyCard.appendChild(ctaBtn);
      entriesListEl.appendChild(emptyCard);
      return;
    }

    const originalByDay = new Map();
    const searchableEntries = nonEmptyEntries.map((entry) => {
      originalByDay.set(entry.day, entry);
      return {
        ...entry,
        title: normalizeJournalTitle(entry.title),
        content: htmlToText(entry.content),
      };
    });

    const results = searchEntries(searchableEntries, currentQuery);
    if (results.length === 0) {
      const noMatch = document.createElement('div');
      noMatch.className = 'text-center py-6 text-sm text-[#68655F] dark:text-[#A39E93]';
      noMatch.textContent = 'No matching Journal Entries found.';
      entriesListEl.appendChild(noMatch);
      return;
    }

    for (const item of results) {
      const { entry, highlights, titleHighlights } = item;
      const originalEntry = originalByDay.get(entry.day) || entry;
      const { headline, daySubtitle, hasCustomTitle } = resolveJournalDisplayHeader(originalEntry, 'short');

      const entryBtn = document.createElement('button');
      entryBtn.type = 'button';
      entryBtn.className =
        'journal-entry-item editorial-card group text-left w-full min-h-[44px] p-4 hover:border-[#9E4B4B] dark:hover:border-[#D99191] transition flex flex-col gap-1.5 cursor-pointer tactile-spring bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';
      entryBtn.dataset.day = originalEntry.day;
      entryBtn.setAttribute(
        'aria-label',
        hasCustomTitle
          ? `Read Journal Entry: ${headline} (${formatShort(originalEntry.day)})`
          : `Read Journal Entry for ${headline}`
      );

      const cardHeader = document.createElement('div');
      cardHeader.className = 'journal-entry-header flex items-start justify-between gap-2 w-full';

      const headlineWrap = document.createElement('div');
      headlineWrap.className = 'journal-entry-headline flex flex-col gap-0.5 min-w-0';

      const titleText = document.createElement('span');
      titleText.className =
        'journal-entry-title text-base font-serif font-semibold leading-snug text-[#1C1B18] dark:text-[#F4F1EA] group-hover:text-[#9E4B4B] dark:group-hover:text-[#D99191] transition-colors break-words';
      setHighlightedText(titleText, headline, hasCustomTitle ? titleHighlights : []);
      headlineWrap.appendChild(titleText);

      if (daySubtitle) {
        const daySubEl = document.createElement('time');
        daySubEl.setAttribute('datetime', originalEntry.day);
        daySubEl.className = 'journal-entry-day text-xs font-mono text-[#68655F] dark:text-[#A39E93]';
        daySubEl.textContent = daySubtitle;
        headlineWrap.appendChild(daySubEl);
      }

      cardHeader.appendChild(headlineWrap);

      if (originalEntry.day === todayDay) {
        const todayBadge = document.createElement('span');
        todayBadge.className =
          'badge-sage mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold shrink-0';
        todayBadge.textContent = 'Today';
        cardHeader.appendChild(todayBadge);
      }

      entryBtn.appendChild(cardHeader);

      if (entry.content) {
        const snippetEl = document.createElement('div');
        snippetEl.className =
          'line-clamp-2 text-sm text-[#68655F] dark:text-[#A39E93] break-words whitespace-pre-wrap';
        setHighlightedText(snippetEl, entry.content, highlights);
        entryBtn.appendChild(snippetEl);
      }

      entryBtn.addEventListener('click', () => {
        onSelectEntry(originalEntry);
      });

      entriesListEl.appendChild(entryBtn);
    }
  }

  searchInput.addEventListener('input', () => {
    currentQuery = searchInput.value;
    if (typeof onQueryChange === 'function') {
      onQueryChange(currentQuery);
    }
    renderList();
  });

  renderList();
  return wrap;
}

/**
 * Renders the separate in-page read-only Entry Reader subview.
 */
export function renderJournalReaderView({ entry, isToday, onBack, onEdit }) {
  const wrap = document.createElement('div');
  wrap.id = 'journal-read-view';
  wrap.className = 'flex flex-col gap-4 animate-in fade-in duration-150';

  const topBar = document.createElement('div');
  topBar.className = 'flex flex-wrap items-center justify-between gap-2';

  const backBtn = createBackButton({
    id: 'btn-back-from-journal-read',
    label: 'Back to Journal History',
    onClick: onBack,
  });

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.id = 'btn-edit-journal-entry';
  editBtn.className =
    'min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-semibold bg-[#9E4B4B] text-[#FAF8F5] hover:opacity-90 active:scale-95 transition cursor-pointer tactile-spring';
  editBtn.textContent = 'Edit Journal';
  editBtn.addEventListener('click', onEdit);

  topBar.appendChild(backBtn);
  topBar.appendChild(editBtn);
  wrap.appendChild(topBar);

  const readerCard = document.createElement('div');
  readerCard.id = 'journal-reader-card';
  readerCard.className =
    'editorial-card p-6 sm:p-8 flex flex-col gap-6 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';

  const header = document.createElement('header');
  header.id = 'journal-reader-header';
  header.className = 'border-b border-[#E6E4DF] dark:border-[#33302C] pb-4 flex flex-col gap-1.5';

  const titleRow = document.createElement('div');
  titleRow.className = 'flex items-center justify-between gap-2 flex-wrap';

  const { headline, daySubtitle } = resolveJournalDisplayHeader(entry, 'long');

  const titleEl = document.createElement('h1');
  titleEl.id = 'journal-reader-title';
  titleEl.className =
    'text-2xl font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA] tracking-tight break-words';
  titleEl.textContent = headline;
  titleRow.appendChild(titleEl);

  if (isToday) {
    const todayPill = document.createElement('span');
    todayPill.className = 'badge-sage px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold shrink-0';
    todayPill.textContent = 'Today';
    titleRow.appendChild(todayPill);
  }

  header.appendChild(titleRow);
  if (daySubtitle) {
    const daySubEl = document.createElement('time');
    daySubEl.id = 'journal-reader-day-subtitle';
    daySubEl.setAttribute('datetime', entry.day);
    daySubEl.className = 'text-xs font-mono font-medium text-[#68655F] dark:text-[#A39E93]';
    daySubEl.textContent = daySubtitle;
    header.appendChild(daySubEl);
  }
  readerCard.appendChild(header);

  const contentEl = document.createElement('div');
  contentEl.className =
    'journal-reader-text flex flex-col gap-4 text-sm sm:text-base text-[#1C1B18] dark:text-[#F4F1EA] break-words leading-relaxed select-text';

  if (isBlank(entry.content)) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'text-sm text-[#68655F] dark:text-[#A39E93] italic';
    emptyMsg.textContent = 'No reflection text.';
    contentEl.appendChild(emptyMsg);
  } else {
    const blocks = parseStructuredJournalBlocks(entry.content);
    if (blocks.length === 1 && blocks[0].type === 'freeform') {
      const p = document.createElement('div');
      p.className = 'whitespace-pre-wrap';
      p.textContent = htmlToText(blocks[0].contentHtml) || blocks[0].contentHtml;
      contentEl.appendChild(p);
    } else {
      for (const block of blocks) {
        const sectionEl = document.createElement('section');
        sectionEl.className =
          'journal-reader-section flex flex-col gap-2 p-4 rounded-xl bg-[#F6F5F2] dark:bg-[#161514] border border-[#E6E4DF] dark:border-[#33302C]';

        const h4 = document.createElement('h4');
        h4.className = 'font-serif font-semibold text-sm text-[#1C1B18] dark:text-[#F4F1EA] leading-snug';
        h4.textContent = block.title;
        sectionEl.appendChild(h4);

        const answerDiv = document.createElement('div');
        answerDiv.className =
          'journal-reader-answer text-sm text-[#1C1B18] dark:text-[#F4F1EA] leading-relaxed [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-6 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-6 [&_ul]:my-1.5 [&_p]:my-1';
        answerDiv.innerHTML = sanitizeJournalHtml(block.contentHtml);
        if (answerDiv.children.length === 0 && !answerDiv.textContent) {
          answerDiv.textContent = htmlToText(block.contentHtml);
        }
        sectionEl.appendChild(answerDiv);
        contentEl.appendChild(sectionEl);
      }
    }
  }

  readerCard.appendChild(contentEl);
  wrap.appendChild(readerCard);
  return wrap;
}
