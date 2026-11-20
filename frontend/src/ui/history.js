/**
 * Habbit History UI Tab (SPEC §10)
 * Renders active habits with 12-week heatmap, streaks, 30-day completion rate,
 * and collapsible archived habits section.
 */

import { today } from '../domain/day.js';
import { currentStreak, longestStreak } from '../domain/streak.js';
import { completionRate, heatmapWeeks } from '../domain/stats.js';
import {
  listHabits,
  getCheckInDays,
  toggleCheckIn,
  onChange,
} from '../data/repo.js';
import { showToast } from './shell.js';

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

  // Root wrapper
  const root = document.createElement('div');
  root.className = 'history-tab flex flex-col gap-6 p-4 max-w-2xl mx-auto w-full pb-20';

  // --- 1. Active Habits Section ---
  const activeHabitsSection = document.createElement('section');
  activeHabitsSection.className = 'active-habits-section flex flex-col gap-3';
  const activeHeading = document.createElement('h2');
  activeHeading.className = 'text-lg font-serif font-semibold tracking-tight text-[#1C1B18] dark:text-[#F4F1EA]';
  activeHeading.textContent = 'Habits';
  activeHabitsSection.appendChild(activeHeading);

  const activeHabitsList = document.createElement('div');
  activeHabitsList.className = 'active-habits-list flex flex-col gap-4';
  activeHabitsSection.appendChild(activeHabitsList);
  root.appendChild(activeHabitsSection);

  // --- 2. Archived Habits Section (Collapsible) ---
  const archivedDetails = document.createElement('details');
  archivedDetails.className = 'group editorial-card p-4 transition-colors bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';

  const archivedSummary = document.createElement('summary');
  archivedSummary.className = 'font-serif font-semibold text-sm text-[#1C1B18] dark:text-[#F4F1EA] cursor-pointer select-none py-1';
  archivedSummary.textContent = 'Archived Habits (0)';
  archivedDetails.appendChild(archivedSummary);

  const archivedHabitsList = document.createElement('div');
  archivedHabitsList.className = 'archived-habits-list mt-4 flex flex-col gap-4';
  archivedDetails.appendChild(archivedHabitsList);
  root.appendChild(archivedDetails);

  el.appendChild(root);

  /**
   * Renders a habit history card (for active or archived habit).
   * @param {import('../shared/contracts.js').Habit} habit
   * @param {Set<string>} checkInDays
   * @param {boolean} isArchived
   * @returns {HTMLElement}
   */
  function renderHabitCard(habit, checkInDays, isArchived) {
    const card = document.createElement('div');
    card.className = 'habit-card editorial-card p-4 shadow-none flex flex-col gap-3 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';
    card.dataset.habitId = habit.id;
    card.dataset.archived = isArchived ? 'true' : 'false';

    // Habit Name Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-2';

    const name = document.createElement('h3');
    name.className = 'text-base font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA] truncate';
    name.textContent = habit.name;

    if (isArchived) {
      const badge = document.createElement('span');
      badge.className = 'text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full bg-[#EFECE6] dark:bg-[#2C2926] text-[#68655F] dark:text-[#A39E93] shrink-0';
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
    statsRow.className = 'stats-row flex flex-wrap items-center gap-3 text-xs font-mono font-semibold text-[#68655F] dark:text-[#A39E93]';

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
              ? 'bg-[#3D6B58] dark:bg-[#5F8776] text-[#FFFFFF] ring-2 ring-offset-1 ring-[#3D6B58] dark:ring-[#5F8776] dark:ring-offset-[#22201E]'
              : 'bg-[#FFFFFF] dark:bg-[#161514] border border-[#E6E4DF] dark:border-[#33302C] ring-2 ring-offset-1 ring-[#68655F] dark:ring-[#A39E93] dark:ring-offset-[#22201E] hover:bg-[#EFECE6] dark:hover:bg-[#2C2926]'
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
            cellColorClass = 'bg-[#3D6B58] dark:bg-[#5F8776] text-[#FFFFFF]';
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
   * Fetches latest habits and check-ins, then updates DOM.
   */
  async function loadDataAndRender() {
    const renderId = ++currentRenderId;
    try {
      const allHabits = await listHabits({ includeArchived: true });

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
    el.innerHTML = '';
  };
}
