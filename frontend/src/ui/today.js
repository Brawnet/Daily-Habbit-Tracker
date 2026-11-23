/**
 * Habbit Today Tab UI (SPEC §10)
 * Renders header (long date, progress), active habits with check-in toggles & streaks,
 * and autosaving daily journal.
 */

import { today, formatLong } from '../domain/day.js';
import { currentStreak } from '../domain/streak.js';
import {
  partitionAndSortHabits,
  formatScheduledTime,
  hasScheduledTime,
} from '../domain/schedule.js';
import {
  listHabits,
  addHabit,
  getCheckInDays,
  toggleCheckIn,
  onChange,
} from '../data/repo.js';
import { navigate, showToast } from './shell.js';
import { LINKED_ACTIVITIES } from '../shared/contracts.js';
import { JOURNAL_SUBVIEW } from '../domain/journal.js';
import {
  createTimePickerField,
  populateLinkedActivitySelect,
  bindEscapeKey,
} from './habit-form-controls.js';

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
  let isAddHabitExpanded = false;

  el.innerHTML = '';

  // Root container
  const container = document.createElement('div');
  container.className = 'today-view flex flex-col gap-6 max-w-lg mx-auto w-full';

  // --- Header Section ---
  const headerEl = document.createElement('header');
  headerEl.className = 'flex flex-col gap-1';

  const dateEl = document.createElement('h1');
  dateEl.id = 'today-date';
  dateEl.className = 'text-2xl sm:text-3xl font-serif font-semibold tracking-tight text-[#1C1B18] dark:text-[#F4F1EA]';
  dateEl.textContent = formatLong(today());

  const progressEl = document.createElement('p');
  progressEl.id = 'today-progress';
  progressEl.className =
    'text-xs font-mono font-semibold tracking-wide badge-sage px-3 py-1 rounded-full w-max flex items-center gap-1.5 mt-1';
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

  el.appendChild(container);

  // Shared habit creation helper with unified validation, loading guard, and toast notifications
  async function executeAddHabit({
    name,
    linkedActivity = null,
    scheduledTime = '',
    setSubmitting,
    onSuccess,
    onError,
  }) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      onError?.();
      return;
    }
    setSubmitting(true);
    try {
      const opts = {};
      if (linkedActivity) {
        opts.linkedActivity = linkedActivity;
      }
      const trimmedTime = (scheduledTime || '').trim();
      if (trimmedTime) {
        opts.scheduledTime = trimmedTime;
      }
      if (Object.keys(opts).length > 0) {
        await addHabit(trimmed, opts);
      } else {
        await addHabit(trimmed);
      }
      if (!isMounted) return;
      showToast(`Habit "${trimmed}" created!`);
      onSuccess?.(trimmed);
    } catch (err) {
      if (!isMounted) return;
      showToast('Failed to create habit: ' + (err?.message || 'Error'));
      onError?.(err);
    } finally {
      setSubmitting(false);
    }
  }

  const activeTimePickers = [];

  function destroyActiveTimePickers() {
    while (activeTimePickers.length > 0) {
      activeTimePickers.pop().destroy();
    }
  }

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

    const { scheduled, anytime } = partitionAndSortHabits(habits);
    const orderedHabits = [...scheduled, ...anytime];

    // Fetch check-in days and calculate streaks for each habit
    const habitData = await Promise.all(
      orderedHabits.map(async (habit) => {
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

    // Clear previous pickers and habits list container
    destroyActiveTimePickers();
    habitsListContainerEl.innerHTML = '';

    if (habitData.length === 0) {
      // Empty state card
      const emptyCard = document.createElement('div');
      emptyCard.id = 'habits-empty-state';
      emptyCard.className =
        'editorial-card flex flex-col items-center justify-center p-6 sm:p-8 text-center border-dashed gap-5 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';

      // Icon & Greeting
      const headerWrap = document.createElement('div');
      headerWrap.className = 'flex flex-col items-center gap-1.5 max-w-sm';

      const iconWrap = document.createElement('div');
      iconWrap.className =
        'w-14 h-14 rounded-xl bg-[#EEF5F2] dark:bg-[rgba(61,107,88,0.25)] text-[#3D6B58] dark:text-[#5F8776] flex items-center justify-center mb-1 border border-[#E6E4DF] dark:border-[#33302C]';
      iconWrap.innerHTML = `
        <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      `;
      headerWrap.appendChild(iconWrap);

      const titleEl = document.createElement('h3');
      titleEl.id = 'today-empty-title';
      titleEl.className = 'text-lg sm:text-xl font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]';
      titleEl.textContent = 'Welcome to Habbit';
      headerWrap.appendChild(titleEl);

      const subtitleEl = document.createElement('p');
      subtitleEl.id = 'today-empty-subtitle';
      subtitleEl.className = 'text-xs sm:text-sm text-[#68655F] dark:text-[#A39E93] leading-relaxed';
      subtitleEl.textContent =
        'Start building your daily momentum. Your data stays on this Device.';
      headerWrap.appendChild(subtitleEl);
      emptyCard.appendChild(headerWrap);

      // Inline Quick Add Form
      const formEl = document.createElement('form');
      formEl.id = 'today-empty-form';
      formEl.className = 'w-full max-w-md flex flex-col gap-2.5';
      formEl.setAttribute('role', 'form');

      const inputWrap = document.createElement('div');
      inputWrap.className = 'relative w-full';

      const labelEl = document.createElement('label');
      labelEl.htmlFor = 'today-empty-add-input';
      labelEl.className = 'sr-only';
      labelEl.textContent = 'Add your first habit';
      inputWrap.appendChild(labelEl);

      const inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.id = 'today-empty-add-input';
      inputEl.className =
        'w-full min-h-[44px] min-w-[44px] px-3.5 py-2.5 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] placeholder-[#68655F] focus:outline-none focus:ring-2 focus:ring-[#C86D51] transition-colors';
      inputEl.style.fontSize = '16px';
      inputEl.placeholder = 'e.g. Drink 2L water, Morning walk...';

      const addBtn = document.createElement('button');
      addBtn.type = 'submit';
      addBtn.id = 'today-empty-add-btn';
      addBtn.className =
        'btn-terracotta min-h-[44px] min-w-[44px] px-5 py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center cursor-pointer shrink-0 tactile-spring';
      addBtn.textContent = 'Add Habit';

      const emptyTimePicker = createTimePickerField({
        id: 'today-empty-scheduled-time',
        ariaLabel: 'Scheduled time (optional)',
        placeholder: 'Anytime',
        allowClear: true,
      });
      emptyTimePicker.container.className = 'relative flex-1 min-w-0';
      activeTimePickers.push(emptyTimePicker);

      let isSubmitting = false;
      async function handleAddHabit(habitName) {
        if (isSubmitting) return;
        const nameToAdd = habitName || inputEl.value;
        await executeAddHabit({
          name: nameToAdd,
          scheduledTime: emptyTimePicker.getValue() || '',
          setSubmitting: (submitting) => {
            isSubmitting = submitting;
            addBtn.disabled = submitting;
          },
          onSuccess: () => {
            inputEl.value = '';
            emptyTimePicker.setValue('');
          },
          onError: () => {
            inputEl.focus?.();
          },
        });
      }
      const onSubmit = (e) => {
        e?.preventDefault?.();
        handleAddHabit();
      };

      formEl.addEventListener('submit', onSubmit);
      addBtn.addEventListener('click', onSubmit);
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          onSubmit(e);
        }
      });
      inputWrap.appendChild(inputEl);
      formEl.appendChild(inputWrap);

      const actionRow = document.createElement('div');
      actionRow.className = 'flex flex-col sm:flex-row items-stretch sm:items-center gap-2';
      actionRow.appendChild(emptyTimePicker.container);
      actionRow.appendChild(addBtn);
      formEl.appendChild(actionRow);
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
          'min-h-[44px] min-w-[44px] px-3.5 py-2 text-xs font-mono font-medium rounded-lg bg-[#FFFFFF] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] hover:border-[#C86D51] hover:text-[#C86D51] dark:hover:text-[#D97E63] border border-[#E6E4DF] dark:border-[#33302C] transition-all cursor-pointer flex items-center justify-center tactile-spring';
        chipBtn.textContent = `+ ${starter}`;
        chipBtn.addEventListener('click', () => {
          inputEl.value = starter;
          emptyTimePicker.focus();
        });
        chipsContainer.appendChild(chipBtn);
      }
      startersWrap.appendChild(chipsContainer);
      emptyCard.appendChild(startersWrap);

      // Manage Habits link (satisfies SPEC §10 contract)
      const manageWrap = document.createElement('div');
      manageWrap.className = 'pt-1';

      const manageBtn = document.createElement('button');
      manageBtn.type = 'button';
      manageBtn.id = 'manage-habits-btn';
      manageBtn.className =
        'min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold text-[#68655F] hover:text-[#C86D51] dark:text-[#A39E93] dark:hover:text-[#D97E63] transition-colors cursor-pointer inline-flex items-center gap-1.5 focus:outline-none focus:underline tactile-spring';
      manageBtn.textContent = 'Manage Habits in Settings →';
      manageBtn.addEventListener('click', () => {
        navigate('settings');
      });
      manageWrap.appendChild(manageBtn);
      emptyCard.appendChild(manageWrap);


      habitsListContainerEl.appendChild(emptyCard);
    } else {
      const scheduledData = habitData.filter((item) => hasScheduledTime(item.habit));
      const anytimeData = habitData.filter((item) => !hasScheduledTime(item.habit));

      if (scheduledData.length > 0 && anytimeData.length > 0) {
        habitsListContainerEl.appendChild(createHabitListEl(scheduledData, 'today-scheduled-list'));

        const anytimeHeading = document.createElement('h3');
        anytimeHeading.id = 'today-anytime-heading';
        anytimeHeading.className =
          'text-xs font-mono font-semibold uppercase tracking-wider text-[#68655F] dark:text-[#A39E93] pt-2 px-1';
        anytimeHeading.textContent = 'Anytime';
        habitsListContainerEl.appendChild(anytimeHeading);

        habitsListContainerEl.appendChild(createHabitListEl(anytimeData, 'today-anytime-list'));
      } else {
        const listId = scheduledData.length > 0 ? 'today-scheduled-list' : 'today-anytime-list';
        habitsListContainerEl.appendChild(createHabitListEl(habitData, listId));
      }

      renderAddHabitControl(habitsListContainerEl);
      renderManageSettingsLink(habitsListContainerEl);
    }
  }

  /**
   * Builds a role="list" container populated with Habit cards.
   *
   * @param {Array<{ habit: import('../shared/contracts.js').Habit, isChecked: boolean, streak: number }>} entries
   * @param {string} [listId]
   * @returns {HTMLElement}
   */
  function createHabitListEl(entries, listId) {
    const listEl = document.createElement('ul');
    if (listId) {
      listEl.id = listId;
    }
    listEl.className = 'flex flex-col gap-2.5';
    listEl.setAttribute('role', 'list');

    for (const entry of entries) {
      listEl.appendChild(createHabitCard(entry));
    }
    return listEl;
  }

  /**
   * Builds one Habit checklist card with optional Scheduled Time and Linked Activity metadata.
   *
   * @param {{ habit: import('../shared/contracts.js').Habit, isChecked: boolean, streak: number }} entry
   * @returns {HTMLElement}
   */
  function createHabitCard({ habit, isChecked, streak }) {
    const itemEl = document.createElement('li');
    itemEl.className =
      'editorial-card flex items-center justify-between p-3.5 gap-3 transition-all hover:border-[#68655F] dark:hover:border-[#A39E93] tactile-spring bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';
    itemEl.dataset.habitId = habit.id;
    if (hasScheduledTime(habit)) {
      itemEl.dataset.scheduledTime = habit.scheduledTime;
    }

    const leftWrap = document.createElement('div');
    leftWrap.className = 'flex items-center gap-3 min-w-0 flex-1';

    // Check-in toggle button (min 44px touch target)
    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.id = `checkin-${habit.id}`;
    checkBtn.setAttribute('data-action', 'toggle-checkin');
    checkBtn.setAttribute('data-habit-id', habit.id);
    checkBtn.className =
      'min-w-[44px] min-h-[44px] shrink-0 flex items-center justify-center rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C86D51] cursor-pointer tactile-spring';
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
        'w-7 h-7 rounded-lg bg-[#3D6B58] dark:bg-[#5F8776] text-[#FFFFFF] flex items-center justify-center shadow-xs transition-all';
      iconWrap.innerHTML = `
        <svg class="w-4 h-4 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    } else {
      iconWrap.className =
        'w-7 h-7 rounded-lg border-2 border-[#E6E4DF] dark:border-[#33302C] hover:border-[#3D6B58] transition-colors bg-[#FFFFFF] dark:bg-[#161514]';
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

    const textStack = document.createElement('div');
    textStack.className = 'flex flex-col min-w-0 flex-1 gap-0.5';

    // Habit name
    const nameEl = document.createElement('span');
    nameEl.className = `text-base font-medium truncate ${
      isChecked
        ? 'text-[#68655F] dark:text-[#A39E93] line-through'
        : 'text-[#1C1B18] dark:text-[#F4F1EA]'
    }`;
    nameEl.textContent = habit.name;
    textStack.appendChild(nameEl);

    const formattedTime = hasScheduledTime(habit) ? formatScheduledTime(habit.scheduledTime) : '';
    const hasMeta = Boolean(formattedTime || habit.linkedActivity);

    if (hasMeta) {
      const metaRow = document.createElement('div');
      metaRow.className = 'flex flex-wrap items-center gap-2';

      if (formattedTime) {
        const timeEl = document.createElement('span');
        timeEl.className =
          'habit-scheduled-time inline-flex items-center text-xs font-mono font-medium text-[#68655F] dark:text-[#A39E93]';
        timeEl.dataset.scheduledTime = habit.scheduledTime;
        timeEl.textContent = formattedTime;
        metaRow.appendChild(timeEl);
      }

      if (habit.linkedActivity) {
        const isJournal = habit.linkedActivity === LINKED_ACTIVITIES.JOURNAL;
        const navigateToActivity = () => {
          if (typeof window !== 'undefined' && window.location && window.history) {
            try {
              const url = new URL(window.location.href);
              if (isJournal) {
                url.searchParams.set('subview', JOURNAL_SUBVIEW);
              } else {
                url.searchParams.delete('subview');
              }
              window.history.replaceState({}, '', url.toString());
            } catch {}
          }
          navigate('activities');
        };
        nameEl.classList.add('cursor-pointer', 'hover:text-indigo-600');
        nameEl.addEventListener('click', navigateToActivity);

        const actBadge = document.createElement('button');
        actBadge.type = 'button';
        const isBook = habit.linkedActivity === LINKED_ACTIVITIES.BOOK_SUMMARY;
        actBadge.className = `habit-activity-link min-h-[44px] min-w-[44px] inline-flex items-center text-xs px-2.5 py-1 rounded-full ${isBook ? 'badge-slate' : 'badge-rose'} font-mono font-medium hover:underline cursor-pointer shrink-0 tactile-spring`;
        actBadge.textContent = isBook ? '📖 Book Summary' : '✍️ Journal';
        actBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          navigateToActivity();
        });
        metaRow.appendChild(actBadge);
      }

      textStack.appendChild(metaRow);
    }

    leftWrap.appendChild(textStack);
    itemEl.appendChild(leftWrap);

    // Streak badge
    const streakWrap = document.createElement('div');
    streakWrap.className = 'flex items-center shrink-0';

    const streakBadge = document.createElement('span');
    streakBadge.className = 'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-semibold rounded-full badge-ochre';
    streakBadge.textContent = `🔥 ${streak}`;
    streakWrap.appendChild(streakBadge);

    itemEl.appendChild(streakWrap);
    return itemEl;
  }

  function renderAddHabitControl(containerEl) {
    const addControlWrap = document.createElement('div');
    addControlWrap.id = 'today-add-habit-control';
    addControlWrap.className = 'flex flex-col gap-2 pt-1';

    if (!isAddHabitExpanded) {
      const triggerBtn = document.createElement('button');
      triggerBtn.type = 'button';
      triggerBtn.id = 'today-add-habit-trigger';
      triggerBtn.setAttribute('aria-expanded', 'false');
      triggerBtn.setAttribute('aria-controls', 'today-add-habit-control');
      triggerBtn.setAttribute('aria-label', '+ Add Habit');
      triggerBtn.className =
        'min-h-[44px] min-w-[44px] w-full px-4 py-3 rounded-xl border border-dashed border-[#E6E4DF] dark:border-[#33302C] hover:border-[#C86D51] dark:hover:border-[#D97E63] bg-[#FFFFFF] dark:bg-[#161514] text-[#68655F] dark:text-[#A39E93] text-sm font-semibold hover:text-[#C86D51] dark:hover:text-[#D97E63] transition-all cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#C86D51] tactile-spring';
      triggerBtn.textContent = '+ Add Habit';

      triggerBtn.addEventListener('click', () => {
        isAddHabitExpanded = true;
        renderHabits();
      });
      addControlWrap.appendChild(triggerBtn);
    } else {
      const formEl = document.createElement('form');
      formEl.id = 'today-add-habit-form';
      formEl.className =
        'editorial-card flex flex-col gap-3 p-4 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';
      formEl.setAttribute('role', 'form');
      formEl.setAttribute('aria-label', 'Add new habit');

      const inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.id = 'today-add-habit-input';
      inputEl.className =
        'w-full min-h-[44px] min-w-[44px] px-3.5 py-2.5 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] placeholder-[#68655F] focus:outline-none focus:ring-2 focus:ring-[#C86D51] transition-colors';
      inputEl.placeholder = 'e.g. Read 10 mins, Morning walk...';
      inputEl.setAttribute('aria-label', 'New habit name');
      inputEl.style.fontSize = '16px';

      const selectActivityEl = document.createElement('select');
      selectActivityEl.id = 'today-add-habit-linked-activity';
      selectActivityEl.className =
        'w-full min-h-[44px] px-3.5 py-2 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#C86D51]';
      selectActivityEl.style.fontSize = '16px';
      populateLinkedActivitySelect(selectActivityEl, {
        labels: {
          none: 'Link to Activity: None',
          book: 'Link to Activity: Book Summary 📖',
          journal: 'Link to Activity: Daily Journal ✍️',
        },
      });

      const timeFieldWrap = document.createElement('div');
      timeFieldWrap.className = 'flex flex-col gap-1';

      const timeLabelEl = document.createElement('label');
      timeLabelEl.htmlFor = 'today-add-habit-scheduled-time';
      timeLabelEl.className = 'text-xs font-medium text-[#68655F] dark:text-[#A39E93] font-mono';
      timeLabelEl.textContent = 'Scheduled Time (optional)';

      const addTimePicker = createTimePickerField({
        id: 'today-add-habit-scheduled-time',
        ariaLabel: 'Scheduled time (optional)',
        placeholder: 'Anytime',
        allowClear: true,
      });
      activeTimePickers.push(addTimePicker);

      timeFieldWrap.appendChild(timeLabelEl);
      timeFieldWrap.appendChild(addTimePicker.container);

      formEl.appendChild(inputEl);
      formEl.appendChild(timeFieldWrap);
      formEl.appendChild(selectActivityEl);
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'flex items-center gap-2 justify-end';

      function collapseAddControl() {
        isAddHabitExpanded = false;
        renderHabits();
        const trigger = containerEl.querySelector('#today-add-habit-trigger');
        trigger?.focus?.();
      }

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.id = 'today-add-habit-cancel';
      cancelBtn.setAttribute('aria-label', 'Cancel adding habit');
      cancelBtn.className =
        'min-h-[44px] min-w-[44px] px-4 py-2 text-sm font-medium text-[#68655F] dark:text-[#A39E93] hover:text-[#1C1B18] dark:hover:text-[#F4F1EA] rounded-lg transition-colors cursor-pointer tactile-spring';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', collapseAddControl);

      const submitBtn = document.createElement('button');
      submitBtn.type = 'submit';
      submitBtn.id = 'today-add-habit-submit';
      submitBtn.setAttribute('aria-label', 'Add habit');
      submitBtn.className =
        'btn-terracotta min-h-[44px] min-w-[44px] px-5 py-2 text-sm font-semibold rounded-lg flex items-center justify-center cursor-pointer tactile-spring';
      submitBtn.textContent = 'Add';

      let isSubmitting = false;
      async function handleSubmit(e) {
        if (e && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        if (isSubmitting) return;
        await executeAddHabit({
          name: inputEl.value,
          linkedActivity: selectActivityEl.value || null,
          scheduledTime: addTimePicker.getValue() || '',
          setSubmitting: (submitting) => {
            isSubmitting = submitting;
            submitBtn.disabled = submitting;
            cancelBtn.disabled = submitting;
          },
          onSuccess: () => {
            collapseAddControl();
          },
          onError: () => {
            inputEl.focus?.();
          },
        });
      }

      formEl.addEventListener('submit', handleSubmit);
      submitBtn.addEventListener('click', handleSubmit);
      bindEscapeKey([formEl, addTimePicker.triggerBtn], () => {
        if (!addTimePicker.isOpen()) collapseAddControl();
      });
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          handleSubmit(e);
        } else if (e.key === 'Escape' && !addTimePicker.isOpen()) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          collapseAddControl();
        }
      });

      actionsWrap.appendChild(cancelBtn);
      actionsWrap.appendChild(submitBtn);
      formEl.appendChild(actionsWrap);
      addControlWrap.appendChild(formEl);

      setTimeout(() => {
        inputEl.focus?.();
      }, 0);
    }

    containerEl.appendChild(addControlWrap);
  }

  function renderManageSettingsLink(containerEl) {
    const manageWrap = document.createElement('div');
    manageWrap.className = 'flex justify-center pt-1';

    const manageLink = document.createElement('button');
    manageLink.type = 'button';
    manageLink.id = 'today-manage-habits-link';
    manageLink.setAttribute('role', 'link');
    manageLink.setAttribute('aria-label', 'Manage and reorder habits in Settings');
    manageLink.className =
      'min-h-[44px] min-w-[44px] px-4 py-2 text-xs font-semibold text-[#68655F] hover:text-[#C86D51] dark:text-[#A39E93] dark:hover:text-[#D97E63] transition-colors cursor-pointer inline-flex items-center gap-1.5 focus:outline-none focus:underline tactile-spring';
    manageLink.textContent = 'Manage & reorder in Settings →';
    manageLink.addEventListener('click', () => {
      navigate('settings');
    });
    manageWrap.appendChild(manageLink);
    containerEl.appendChild(manageWrap);
  }

  // --- Master Render & Subscription ---
  async function render() {
    await renderHabits();
  }

  const unsubscribe = onChange(render);

  // Initial render
  render();
  // Return cleanup
  return () => {
    isMounted = false;
    destroyActiveTimePickers();
    if (unsubscribe) {
      unsubscribe();
    }
    el.innerHTML = '';
  };
}
