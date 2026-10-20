/**
 * Habbit History UI Tab (SPEC §10)
 * Renders active habits with 12-week heatmap, streaks, 30-day completion rate,
 * collapsible archived habits section, and journal search & history with full reader view.
 */

import { today, formatShort, formatLong } from '../domain/day.js';
import { currentStreak, longestStreak } from '../domain/streak.js';
import { completionRate, heatmapWeeks } from '../domain/stats.js';
import { searchEntries } from '../domain/search.js';
import {
  listHabits,
  getCheckInDays,
  toggleCheckIn,
  listJournalEntries,
  onChange,
} from '../data/repo.js';
import { navigate, showToast } from './shell.js';

/**
 * Escapes unsafe HTML characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sets snippet text with highlights.
 * Uses both innerHTML for HTML rendering and DOM nodes for mock environments.
 * @param {HTMLElement} containerEl
 * @param {string} content
 * @param {Array<[number, number]>} highlights
 */
function setSnippetContent(containerEl, content, highlights) {
  if (!content) {
    containerEl.innerHTML = '<span class="text-zinc-400 italic">No entry text</span>';
    return;
  }

  if (!highlights || highlights.length === 0) {
    containerEl.textContent = content;
    return;
  }

  let html = '';
  let lastIndex = 0;
  for (const [start, end] of highlights) {
    if (start > lastIndex) {
      html += escapeHtml(content.slice(lastIndex, start));
    }
    const matched = content.slice(start, end);
    html += `<mark class="bg-amber-200 dark:bg-amber-900/60 text-inherit">${escapeHtml(matched)}</mark>`;
    lastIndex = end;
  }
  if (lastIndex < content.length) {
    html += escapeHtml(content.slice(lastIndex));
  }

  containerEl.innerHTML = html;

  // Support mock DOM environments that don't construct child elements from innerHTML
  if (containerEl.children.length === 0 && typeof document !== 'undefined' && typeof document.createElement === 'function') {
    let idx = 0;
    for (const [start, end] of highlights) {
      if (start > idx) {
        const span = document.createElement('span');
        span.textContent = content.slice(idx, start);
        containerEl.appendChild(span);
      }
      const mark = document.createElement('mark');
      mark.className = 'bg-amber-200 dark:bg-amber-900/60 text-inherit';
      mark.textContent = content.slice(start, end);
      containerEl.appendChild(mark);
      idx = end;
    }
    if (idx < content.length) {
      const span = document.createElement('span');
      span.textContent = content.slice(idx);
      containerEl.appendChild(span);
    }
  }
}

/**
 * Mounts the History tab into the provided container element.
 * @param {HTMLElement} el
 * @returns {() => void} cleanup function
 */
export function mount(el) {
  if (!el) {
    throw new Error('mount requires a valid DOM element');
  }

  el.innerHTML = '';

  let isMounted = true;
  let currentRenderId = 0;
  let cachedEntries = [];
  let currentQuery = '';
  let currentReaderEl = null;
  let removeKeydownListener = null;

  // Root wrapper
  const root = document.createElement('div');
  root.className = 'history-tab flex flex-col gap-6 p-4 max-w-2xl mx-auto w-full pb-20';

  // --- 1. Active Habits Section ---
  const activeHabitsSection = document.createElement('section');
  activeHabitsSection.className = 'active-habits-section flex flex-col gap-3';
  const activeHeading = document.createElement('h2');
  activeHeading.className = 'text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100';
  activeHeading.textContent = 'Habits';
  activeHabitsSection.appendChild(activeHeading);

  const activeHabitsList = document.createElement('div');
  activeHabitsList.className = 'active-habits-list flex flex-col gap-4';
  activeHabitsSection.appendChild(activeHabitsList);
  root.appendChild(activeHabitsSection);

  // --- 2. Archived Habits Section (Collapsible) ---
  const archivedDetails = document.createElement('details');
  archivedDetails.className = 'group border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 p-4 transition-colors';

  const archivedSummary = document.createElement('summary');
  archivedSummary.className = 'font-semibold text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none py-1';
  archivedSummary.textContent = 'Archived Habits (0)';
  archivedDetails.appendChild(archivedSummary);

  const archivedHabitsList = document.createElement('div');
  archivedHabitsList.className = 'archived-habits-list mt-4 flex flex-col gap-4';
  archivedDetails.appendChild(archivedHabitsList);
  root.appendChild(archivedDetails);

  // --- 3. Journal Search & History Section ---
  const journalSection = document.createElement('section');
  journalSection.className = 'journal-history-section flex flex-col gap-3';

  const journalHeading = document.createElement('h2');
  journalHeading.className = 'text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100';
  journalHeading.textContent = 'Journal History';
  journalSection.appendChild(journalHeading);

  // Search input box
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'relative w-full';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search entries by keyword or date...';
  searchInput.setAttribute('aria-label', 'Search entries by keyword or date...');
  searchInput.className = 'journal-search-input w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base';
  searchInput.style.fontSize = '16px';
  searchWrapper.appendChild(searchInput);
  journalSection.appendChild(searchWrapper);

  searchInput.addEventListener('input', () => {
    currentQuery = searchInput.value;
    renderJournalList();
  });

  // Journal entries list container
  const journalEntriesList = document.createElement('div');
  journalEntriesList.className = 'journal-entries-list flex flex-col gap-2.5';
  journalSection.appendChild(journalEntriesList);
  root.appendChild(journalSection);

  el.appendChild(root);

  /**
   * Closes reader view if open.
   */
  function closeReaderView() {
    if (removeKeydownListener) {
      removeKeydownListener();
    }
    if (currentReaderEl) {
      currentReaderEl.remove();
      currentReaderEl = null;
    }
  }

  /**
   * Opens full reader view modal.
   * @param {import('../shared/contracts.js').JournalEntry} entry
   */
  function openReaderView(entry) {
    closeReaderView();

    const isToday = entry.day === today();

    const backdrop = document.createElement('div');
    backdrop.className = 'reader-modal-backdrop fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', `Journal entry for ${formatShort(entry.day)}`);

    const dialog = document.createElement('div');
    dialog.className = 'reader-dialog bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden';

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'font-bold text-base text-zinc-900 dark:text-zinc-100';
    title.textContent = formatLong(entry.day);
    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-zinc-500 dark:text-zinc-400';
    subtitle.textContent = formatShort(entry.day);
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);

    const closeIconBtn = document.createElement('button');
    closeIconBtn.type = 'button';
    closeIconBtn.className = 'reader-close-btn p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center';
    closeIconBtn.setAttribute('aria-label', 'Close reader');
    closeIconBtn.innerHTML = `
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    `;
    closeIconBtn.addEventListener('click', closeReaderView);
    header.appendChild(closeIconBtn);
    dialog.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'p-5 overflow-y-auto flex-1';
    const contentEl = document.createElement('div');
    contentEl.className = 'journal-reader-text text-sm sm:text-base text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words leading-relaxed select-text';
    contentEl.textContent = entry.content || 'No entry text';
    body.appendChild(contentEl);
    dialog.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'flex items-center justify-end gap-3 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0';

    if (isToday) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-edit-today px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl transition cursor-pointer min-h-[44px] flex items-center justify-center';
      editBtn.textContent = 'Edit in Today';
      editBtn.addEventListener('click', () => {
        closeReaderView();
        navigate('today');
      });
      footer.appendChild(editBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-close px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer min-h-[44px] flex items-center justify-center';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', closeReaderView);
    footer.appendChild(closeBtn);

    dialog.appendChild(footer);
    backdrop.appendChild(dialog);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeReaderView();
      }
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeReaderView();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', onKeyDown);
      removeKeydownListener = () => {
        document.removeEventListener('keydown', onKeyDown);
        removeKeydownListener = null;
      };
    }

    currentReaderEl = backdrop;
    el.appendChild(backdrop);
  }

  /**
   * Renders a habit history card (for active or archived habit).
   * @param {import('../shared/contracts.js').Habit} habit
   * @param {Set<string>} checkInDays
   * @param {boolean} isArchived
   * @returns {HTMLElement}
   */
  function renderHabitCard(habit, checkInDays, isArchived) {
    const card = document.createElement('div');
    card.className = 'habit-card bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs flex flex-col gap-3';
    card.dataset.habitId = habit.id;
    card.dataset.archived = isArchived ? 'true' : 'false';

    // Habit Name Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-2';

    const name = document.createElement('h3');
    name.className = 'text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate';
    name.textContent = habit.name;
    header.appendChild(name);

    if (isArchived) {
      const badge = document.createElement('span');
      badge.className = 'text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0';
      badge.textContent = 'Archived';
      header.appendChild(badge);
    }
    card.appendChild(header);

    // Stats row
    const curStreak = currentStreak(checkInDays, today());
    const maxStreak = longestStreak(checkInDays);
    const createdDay = (habit.createdAt && habit.createdAt.length >= 10) ? habit.createdAt.slice(0, 10) : today();
    const rate = completionRate(checkInDays, { todayDay: today(), createdDay, windowDays: 30 });
    const ratePct = `${Math.round(rate * 100)}%`;

    const statsRow = document.createElement('div');
    statsRow.className = 'stats-row flex flex-wrap items-center gap-3 text-xs font-medium text-zinc-600 dark:text-zinc-400';

    const curStreakSpan = document.createElement('span');
    curStreakSpan.className = 'stat-current-streak flex items-center gap-1';
    curStreakSpan.dataset.stat = 'current-streak';
    curStreakSpan.textContent = `🔥 ${curStreak}`;
    statsRow.appendChild(curStreakSpan);

    const maxStreakSpan = document.createElement('span');
    maxStreakSpan.className = 'stat-longest-streak flex items-center gap-1';
    maxStreakSpan.dataset.stat = 'longest-streak';
    maxStreakSpan.textContent = `🏆 ${maxStreak}`;
    statsRow.appendChild(maxStreakSpan);

    const rateSpan = document.createElement('span');
    rateSpan.className = 'stat-completion-rate flex items-center gap-1';
    rateSpan.dataset.stat = 'completion-rate';
    rateSpan.textContent = `30d: ${ratePct}`;
    statsRow.appendChild(rateSpan);

    card.appendChild(statsRow);

    // 12-week Heatmap
    const weeks = heatmapWeeks(checkInDays, today(), 12);

    const heatmapScroll = document.createElement('div');
    heatmapScroll.className = 'heatmap-wrapper overflow-x-auto pb-1 -mx-1 px-1';

    const grid = document.createElement('div');
    grid.className = 'heatmap-grid grid grid-rows-7 grid-flow-col gap-1 w-max';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', `${habit.name} 12-week activity heatmap`);
    grid.dataset.testid = 'heatmap-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateRows = 'repeat(7, minmax(0, 1fr))';
    grid.style.gridAutoFlow = 'column';
    grid.style.gap = '4px';

    for (let w = 0; w < weeks.length; w++) {
      const week = weeks[w];
      for (let d = 0; d < week.length; d++) {
        const cell = week[d];
        if (cell.editable) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `heatmap-cell editable w-7 h-7 min-w-[28px] min-h-[28px] rounded flex items-center justify-center text-[10px] font-medium transition cursor-pointer select-none ${
            cell.done
              ? 'bg-emerald-500 dark:bg-emerald-600 text-white ring-2 ring-offset-1 ring-emerald-500 dark:ring-emerald-400 dark:ring-offset-zinc-900'
              : 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 ring-2 ring-offset-1 ring-zinc-400 dark:ring-zinc-500 dark:ring-offset-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`;
          btn.style.width = '28px';
          btn.style.height = '28px';
          btn.style.minWidth = '28px';
          btn.style.minHeight = '28px';
          btn.setAttribute('aria-label', `${habit.name} on ${cell.day}: ${cell.done ? 'Done' : 'Not done'}`);
          btn.setAttribute('aria-pressed', cell.done ? 'true' : 'false');
          btn.dataset.day = cell.day;
          btn.dataset.habitId = habit.id;
          btn.dataset.done = cell.done ? 'true' : 'false';
          btn.dataset.editable = 'true';
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
              btn.disabled = true;
              await toggleCheckIn(habit.id, cell.day);
            } catch (err) {
              console.error('Failed to toggle check-in', err);
              showToast('Failed to update check-in');
            } finally {
              btn.disabled = false;
            }
          });
          grid.appendChild(btn);
        } else {
          const cellDiv = document.createElement('div');
          let cellColorClass = 'bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60';
          if (cell.done) {
            cellColorClass = 'bg-emerald-500 dark:bg-emerald-600 text-white';
          } else if (cell.future) {
            cellColorClass = 'bg-zinc-50/50 dark:bg-zinc-900/40 border border-dashed border-zinc-200 dark:border-zinc-800 opacity-30 pointer-events-none';
          }
          cellDiv.className = `heatmap-cell w-7 h-7 min-w-[28px] min-h-[28px] rounded flex items-center justify-center text-[10px] select-none ${cellColorClass}`;
          cellDiv.style.width = '28px';
          cellDiv.style.height = '28px';
          cellDiv.style.minWidth = '28px';
          cellDiv.style.minHeight = '28px';
          cellDiv.setAttribute('aria-label', `${habit.name} on ${cell.day}: ${cell.future ? 'Future' : cell.done ? 'Done' : 'Not done'}`);
          cellDiv.dataset.day = cell.day;
          cellDiv.dataset.done = cell.done ? 'true' : 'false';
          cellDiv.dataset.editable = 'false';
          if (cell.future) {
            cellDiv.dataset.future = 'true';
          }
          grid.appendChild(cellDiv);
        }
      }
    }

    heatmapScroll.appendChild(grid);
    card.appendChild(heatmapScroll);

    return card;
  }

  /**
   * Renders journal entries list filtered by current query.
   */
  function renderJournalList() {
    journalEntriesList.innerHTML = '';

    const results = searchEntries(cachedEntries, currentQuery);

    if (cachedEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-center py-6 text-sm text-zinc-500 dark:text-zinc-400';
      empty.textContent = 'No journal entries yet.';
      journalEntriesList.appendChild(empty);
      return;
    }

    if (results.length === 0) {
      const noMatch = document.createElement('div');
      noMatch.className = 'text-center py-6 text-sm text-zinc-500 dark:text-zinc-400';
      noMatch.textContent = 'No matching entries found.';
      journalEntriesList.appendChild(noMatch);
      return;
    }

    for (const item of results) {
      const { entry, highlights } = item;
      const entryBtn = document.createElement('button');
      entryBtn.type = 'button';
      entryBtn.className = 'journal-entry-item text-left w-full p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col gap-1.5 cursor-pointer';
      entryBtn.dataset.day = entry.day;
      entryBtn.setAttribute('aria-label', `Read journal entry for ${formatShort(entry.day)}`);

      const dateHeader = document.createElement('div');
      dateHeader.className = 'flex items-center justify-between w-full';
      const dateText = document.createElement('span');
      dateText.className = 'text-xs font-semibold text-zinc-500 dark:text-zinc-400';
      dateText.textContent = formatShort(entry.day);
      dateHeader.appendChild(dateText);
      entryBtn.appendChild(dateHeader);

      const snippetEl = document.createElement('div');
      snippetEl.className = 'line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300 break-words whitespace-pre-wrap';
      setSnippetContent(snippetEl, entry.content || '', highlights);
      entryBtn.appendChild(snippetEl);

      entryBtn.addEventListener('click', () => {
        openReaderView(entry);
      });

      journalEntriesList.appendChild(entryBtn);
    }
  }

  /**
   * Fetches latest habits, check-ins, and journal entries, then updates DOM.
   */
  async function loadDataAndRender() {
    const renderId = ++currentRenderId;
    try {
      const [allHabits, allEntries] = await Promise.all([
        listHabits({ includeArchived: true }),
        listJournalEntries(),
      ]);

      if (!isMounted || renderId !== currentRenderId) return;

      const habitsWithCheckIns = await Promise.all(
        allHabits.map(async (habit) => {
          const checkInDays = await getCheckInDays(habit.id);
          return { habit, checkInDays };
        })
      );

      if (!isMounted || renderId !== currentRenderId) return;

      const active = habitsWithCheckIns.filter(({ habit }) => !habit.archived);
      const archived = habitsWithCheckIns.filter(({ habit }) => habit.archived);

      active.sort((a, b) => a.habit.sortOrder - b.habit.sortOrder);
      archived.sort((a, b) => a.habit.sortOrder - b.habit.sortOrder);

      // Render Active Habits
      activeHabitsList.innerHTML = '';
      if (active.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center py-6 text-sm text-zinc-500 dark:text-zinc-400';
        empty.textContent = 'No active habits yet.';
        activeHabitsList.appendChild(empty);
      } else {
        for (const { habit, checkInDays } of active) {
          activeHabitsList.appendChild(renderHabitCard(habit, checkInDays, false));
        }
      }

      // Render Archived Habits
      archivedHabitsList.innerHTML = '';
      archivedSummary.textContent = `Archived Habits (${archived.length})`;

      if (archived.length === 0) {
        const emptyArchived = document.createElement('div');
        emptyArchived.className = 'text-center py-3 text-xs text-zinc-500 dark:text-zinc-400';
        emptyArchived.textContent = 'No archived habits.';
        archivedHabitsList.appendChild(emptyArchived);
      } else {
        for (const { habit, checkInDays } of archived) {
          archivedHabitsList.appendChild(renderHabitCard(habit, checkInDays, true));
        }
      }

      // Render Journal Entries
      cachedEntries = allEntries;
      renderJournalList();
    } catch (err) {
      if (!isMounted) return;
      console.error('Failed to load history data', err);
    }
  }

  // Subscribe to repo changes
  const unsubscribe = onChange(() => {
    loadDataAndRender();
  });

  // Initial load
  loadDataAndRender();

  // Cleanup
  return () => {
    isMounted = false;
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
    closeReaderView();
    el.innerHTML = '';
  };
}
