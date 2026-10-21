/**
 * Habbit Today Tab UI (SPEC §10)
 * Renders header (long date, progress), active habits with check-in toggles & streaks,
 * and autosaving daily journal.
 */

import { today, formatLong } from '../domain/day.js';
import { currentStreak } from '../domain/streak.js';
import {
  listHabits,
  addHabit,
  getCheckInDays,
  toggleCheckIn,
  getJournalEntry,
  saveJournalEntry,
  onChange,
} from '../data/repo.js';
import { navigate, showToast } from './shell.js';

/**
 * Mounts the Today tab into the provided element.
 *
 * @param {HTMLElement} el
 * @returns {() => void} cleanup
 */
export function mount(el) {
  if (!el) {
    return () => {};
  }

  let isMounted = true;
  let renderToken = 0;
  let debounceTimer = null;
  let saveSeq = 0;
  let hasUserTyped = false;

  el.innerHTML = '';

  // Root container
  const container = document.createElement('div');
  container.className = 'today-view flex flex-col gap-6 max-w-lg mx-auto w-full';

  // --- Header Section ---
  const headerEl = document.createElement('header');
  headerEl.className = 'flex flex-col gap-1';

  const dateEl = document.createElement('h1');
  dateEl.id = 'today-date';
  dateEl.className = 'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50';
  dateEl.textContent = formatLong(today());

  const progressEl = document.createElement('p');
  progressEl.id = 'today-progress';
  progressEl.className = 'text-sm font-medium text-zinc-500 dark:text-zinc-400';
  progressEl.textContent = '0/0 done';

  headerEl.appendChild(dateEl);
  headerEl.appendChild(progressEl);
  container.appendChild(headerEl);

  // --- Habits Section ---
  const habitsSectionEl = document.createElement('section');
  habitsSectionEl.className = 'flex flex-col gap-3';
  habitsSectionEl.setAttribute('aria-labelledby', 'habits-heading');

  const habitsHeadingEl = document.createElement('h2');
  habitsHeadingEl.id = 'habits-heading';
  habitsHeadingEl.className = 'sr-only';
  habitsHeadingEl.textContent = 'Active Habits';
  habitsSectionEl.appendChild(habitsHeadingEl);

  const habitsListContainerEl = document.createElement('div');
  habitsListContainerEl.id = 'habits-list-container';
  habitsListContainerEl.className = 'flex flex-col gap-2.5';
  habitsSectionEl.appendChild(habitsListContainerEl);

  container.appendChild(habitsSectionEl);

  // --- Journal Section ---
  const journalSectionEl = document.createElement('section');
  journalSectionEl.className = 'flex flex-col gap-2 pt-2';
  journalSectionEl.setAttribute('aria-labelledby', 'journal-heading');

  const journalHeaderEl = document.createElement('div');
  journalHeaderEl.className = 'flex items-center justify-between';

  const journalHeadingEl = document.createElement('h2');
  journalHeadingEl.id = 'journal-heading';
  journalHeadingEl.className = 'text-lg font-semibold text-zinc-900 dark:text-zinc-100';
  journalHeadingEl.textContent = 'Daily Journal';

  const journalStatusEl = document.createElement('span');
  journalStatusEl.id = 'journal-status';
  journalStatusEl.className = 'text-xs font-medium text-zinc-500 dark:text-zinc-400';
  journalStatusEl.setAttribute('aria-live', 'polite');
  journalStatusEl.textContent = 'Saved';

  journalHeaderEl.appendChild(journalHeadingEl);
  journalHeaderEl.appendChild(journalStatusEl);
  journalSectionEl.appendChild(journalHeaderEl);

  const journalLabelEl = document.createElement('label');
  journalLabelEl.htmlFor = 'today-journal-input';
  journalLabelEl.className = 'sr-only';
  journalLabelEl.textContent = 'Daily Journal';
  journalSectionEl.appendChild(journalLabelEl);

  const journalTextareaEl = document.createElement('textarea');
  journalTextareaEl.id = 'today-journal-input';
  journalTextareaEl.className =
    'w-full min-h-[160px] p-3 text-base rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-colors resize-y';
  journalTextareaEl.style.fontSize = '16px';
  journalTextareaEl.placeholder = "Write today's reflections, notes, or memories...";
  journalSectionEl.appendChild(journalTextareaEl);

  container.appendChild(journalSectionEl);
  el.appendChild(container);

  // --- Habits Rendering Logic ---
  async function renderHabits() {
    const token = ++renderToken;
    const currentDay = today();

    dateEl.textContent = formatLong(currentDay);

    let habits = [];
    try {
      habits = await listHabits({ includeArchived: false });
    } catch (err) {
      console.warn('Failed to list habits:', err);
    }

    // Sort by sortOrder ascending
    habits.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    // Fetch check-in days and calculate streaks for each habit
    const habitData = await Promise.all(
      habits.map(async (habit) => {
        let days = new Set();
        try {
          days = await getCheckInDays(habit.id);
        } catch (err) {
          console.warn(`Failed to get check-ins for habit ${habit.id}:`, err);
        }
        const isChecked = days.has(currentDay);
        const streak = currentStreak(days, currentDay);
        return { habit, isChecked, streak };
      })
    );

    if (!isMounted || token !== renderToken) return;

    // Update progress indicator
    const completedCount = habitData.filter((item) => item.isChecked).length;
    progressEl.textContent = `${completedCount}/${habitData.length} done`;

    // Clear habits list container
    habitsListContainerEl.innerHTML = '';

    if (habitData.length === 0) {
      // Empty state card
      const emptyCard = document.createElement('div');
      emptyCard.id = 'habits-empty-state';
      emptyCard.className =
        'flex flex-col items-center justify-center p-6 sm:p-8 text-center bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 gap-5';

      // Icon & Greeting
      const headerWrap = document.createElement('div');
      headerWrap.className = 'flex flex-col items-center gap-1.5 max-w-sm';

      const iconWrap = document.createElement('div');
      iconWrap.className =
        'w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-1';
      iconWrap.innerHTML = `
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      `;
      headerWrap.appendChild(iconWrap);

      const titleEl = document.createElement('h3');
      titleEl.id = 'today-empty-title';
      titleEl.className = 'text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100';
      titleEl.textContent = 'Welcome to Habbit';
      headerWrap.appendChild(titleEl);

      const subtitleEl = document.createElement('p');
      subtitleEl.id = 'today-empty-subtitle';
      subtitleEl.className = 'text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed';
      subtitleEl.textContent =
        'Start building your daily momentum. Your data stays on this device.';
      headerWrap.appendChild(subtitleEl);

      emptyCard.appendChild(headerWrap);

      // Inline Quick Add Form
      const formEl = document.createElement('form');
      formEl.id = 'today-empty-form';
      formEl.className = 'w-full max-w-md flex flex-col sm:flex-row gap-2';
      formEl.setAttribute('role', 'form');

      const inputWrap = document.createElement('div');
      inputWrap.className = 'relative flex-1';

      const labelEl = document.createElement('label');
      labelEl.htmlFor = 'today-empty-add-input';
      labelEl.className = 'sr-only';
      labelEl.textContent = 'Add your first habit';
      inputWrap.appendChild(labelEl);

      const inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.id = 'today-empty-add-input';
      inputEl.className =
        'w-full min-h-[44px] px-3.5 py-2.5 text-base rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-colors shadow-xs';
      inputEl.style.fontSize = '16px';
      inputEl.placeholder = 'e.g. Drink 2L water, Morning walk...';

      const addBtn = document.createElement('button');
      addBtn.type = 'submit';
      addBtn.id = 'today-empty-add-btn';
      addBtn.className =
        'min-h-[44px] min-w-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center cursor-pointer shrink-0';
      addBtn.textContent = 'Add Habit';
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleAddHabit();
      });

      async function handleAddHabit(habitName) {
        const nameToAdd = habitName || inputEl.value;
        const trimmed = (nameToAdd || '').trim();
        if (!trimmed) {
          inputEl.focus?.();
          return;
        }
        try {
          addBtn.disabled = true;
          await addHabit(trimmed);
          inputEl.value = '';
          showToast(`Habit "${trimmed}" created!`);
        } catch (err) {
          showToast('Failed to create habit: ' + (err?.message || 'Error'));
        } finally {
          addBtn.disabled = false;
        }
      }

      formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        handleAddHabit();
      });

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddHabit();
        }
      });

      inputWrap.appendChild(inputEl);
      formEl.appendChild(inputWrap);
      formEl.appendChild(addBtn);
      emptyCard.appendChild(formEl);

      // Starter Chips Section
      const startersWrap = document.createElement('div');
      startersWrap.className = 'flex flex-col items-center gap-2 pt-1 w-full';

      const startersLabel = document.createElement('span');
      startersLabel.className =
        'text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider';
      startersLabel.textContent = 'Or try a popular starter:';
      startersWrap.appendChild(startersLabel);

      const chipsContainer = document.createElement('div');
      chipsContainer.className = 'flex flex-wrap items-center justify-center gap-2';

      const starterHabits = ['Drink 2L Water', 'Read 10 mins', 'Morning Walk'];
      for (const starter of starterHabits) {
        const chipBtn = document.createElement('button');
        chipBtn.type = 'button';
        chipBtn.dataset.starterChip = starter;
        chipBtn.className =
          'min-h-[44px] min-w-[44px] px-3.5 py-2 text-xs font-medium rounded-xl bg-white dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 border border-zinc-200 dark:border-zinc-700 shadow-2xs transition-colors cursor-pointer flex items-center justify-center';
        chipBtn.textContent = `+ ${starter}`;
        chipBtn.addEventListener('click', () => {
          handleAddHabit(starter);
        });
        chipsContainer.appendChild(chipBtn);
      }
      startersWrap.appendChild(chipsContainer);
      emptyCard.appendChild(startersWrap);

      // Secondary Link to Settings
      const manageLink = document.createElement('button');
      manageLink.type = 'button';
      manageLink.id = 'manage-habits-btn';
      manageLink.className =
        'min-h-[44px] px-3 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline cursor-pointer';
      manageLink.textContent = 'Advanced options in Settings';
      manageLink.addEventListener('click', () => {
        navigate('settings');
      });
      emptyCard.appendChild(manageLink);

      habitsListContainerEl.appendChild(emptyCard);
    } else {
      // Habit list
      const listEl = document.createElement('ul');
      listEl.className = 'flex flex-col gap-2.5';
      listEl.setAttribute('role', 'list');

      for (const { habit, isChecked, streak } of habitData) {
        const itemEl = document.createElement('li');
        itemEl.className =
          'flex items-center justify-between p-3.5 bg-white dark:bg-zinc-800/90 rounded-2xl border border-zinc-100 dark:border-zinc-700/60 shadow-xs gap-3';
        itemEl.dataset.habitId = habit.id;

        const leftWrap = document.createElement('div');
        leftWrap.className = 'flex items-center gap-3 min-w-0 flex-1';

        // Check-in toggle button (min 44px touch target)
        const checkBtn = document.createElement('button');
        checkBtn.type = 'button';
        checkBtn.id = `checkin-${habit.id}`;
        checkBtn.setAttribute('data-action', 'toggle-checkin');
        checkBtn.setAttribute('data-habit-id', habit.id);
        checkBtn.className =
          'min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer';
        checkBtn.style.minWidth = '44px';
        checkBtn.style.minHeight = '44px';
        checkBtn.setAttribute('aria-pressed', isChecked ? 'true' : 'false');
        checkBtn.setAttribute(
          'aria-label',
          isChecked ? `Mark ${habit.name} incomplete` : `Mark ${habit.name} complete`
        );

        const iconWrap = document.createElement('span');
        if (isChecked) {
          iconWrap.className =
            'w-7 h-7 rounded-full bg-emerald-500 dark:bg-emerald-600 text-white flex items-center justify-center shadow-xs';
          iconWrap.innerHTML = `
            <svg class="w-4 h-4 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
        } else {
          iconWrap.className =
            'w-7 h-7 rounded-full border-2 border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors';
        }
        checkBtn.appendChild(iconWrap);

        checkBtn.addEventListener('click', async () => {
          if (checkBtn.disabled) return;
          checkBtn.disabled = true;
          try {
            await toggleCheckIn(habit.id, today());
          } catch (err) {
            showToast(err?.message || 'Failed to update check-in');
          } finally {
            checkBtn.disabled = false;
          }
        });

        leftWrap.appendChild(checkBtn);

        // Habit name
        const nameEl = document.createElement('span');
        nameEl.className = `text-base font-medium truncate flex-1 ${
          isChecked
            ? 'text-zinc-400 dark:text-zinc-500 line-through'
            : 'text-zinc-900 dark:text-zinc-100'
        }`;
        nameEl.textContent = habit.name;
        leftWrap.appendChild(nameEl);

        itemEl.appendChild(leftWrap);

        // Streak badge
        const streakWrap = document.createElement('div');
        streakWrap.className = 'flex items-center shrink-0';

        const streakBadge = document.createElement('span');
        streakBadge.className = `inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ${
          streak > 0
            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/50'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700/50'
        }`;
        streakBadge.textContent = `🔥 ${streak}`;
        streakWrap.appendChild(streakBadge);

        itemEl.appendChild(streakWrap);
        listEl.appendChild(itemEl);
      }

      habitsListContainerEl.appendChild(listEl);
    }
  }

  // --- Journal Autosave Logic ---
  let journalDay = today();

  async function loadJournalInitial() {
    try {
      const entry = await getJournalEntry(journalDay);
      if (isMounted && !hasUserTyped) {
        journalTextareaEl.value = entry?.content || '';
        journalStatusEl.textContent = 'Saved';
      }
    } catch (err) {
      console.warn('Failed to load journal entry:', err);
      if (isMounted && !hasUserTyped) {
        journalStatusEl.textContent = 'Error';
      }
    }
  }

  journalTextareaEl.addEventListener('input', () => {
    hasUserTyped = true;
    journalStatusEl.textContent = 'Saving...';

    clearTimeout(debounceTimer);

    const currentSeq = ++saveSeq;
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      try {
        await saveJournalEntry(today(), journalTextareaEl.value);
        if (isMounted && currentSeq === saveSeq) {
          journalStatusEl.textContent = 'Saved';
        }
      } catch (err) {
        console.warn('Failed to autosave journal entry:', err);
        if (isMounted && currentSeq === saveSeq) {
          journalStatusEl.textContent = 'Error';
        }
      }
    }, 800);
  });

  // --- Master Render & Subscription ---
  async function render() {
    await renderHabits();

    const currentDay = today();
    if (currentDay !== journalDay) {
      journalDay = currentDay;
      hasUserTyped = false;
      clearTimeout(debounceTimer);
      debounceTimer = null;
      try {
        const entry = await getJournalEntry(journalDay);
        if (isMounted) {
          journalTextareaEl.value = entry?.content || '';
          journalStatusEl.textContent = 'Saved';
        }
      } catch (err) {
        console.warn('Failed to reload journal entry on day change:', err);
      }
    } else if (
      !debounceTimer &&
      (!document.activeElement || document.activeElement !== journalTextareaEl)
    ) {
      try {
        const entry = await getJournalEntry(currentDay);
        const content = entry?.content || '';
        if (
          isMounted &&
          journalTextareaEl.value !== content &&
          (!document.activeElement || document.activeElement !== journalTextareaEl) &&
          !debounceTimer
        ) {
          journalTextareaEl.value = content;
        }
      } catch (err) {
        // Ignore background sync check errors
      }
    }
  }

  const unsubscribe = onChange(render);

  // Initial renders
  render();
  loadJournalInitial();

  // Return cleanup
  return () => {
    isMounted = false;
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (unsubscribe) {
      unsubscribe();
    }
    el.innerHTML = '';
  };
}
