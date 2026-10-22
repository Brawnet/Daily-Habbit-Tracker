/**
 * Habbit Activities UI View
 * Manages Activities creation, listing, status filtering, editing, and archiving.
 */

import {
  listActivities,
  getActivity,
  addActivity,
  updateActivity,
  setActivityArchived,
  onChange,
} from '../data/repo.js';
import { showToast } from './shell.js';

const STATUS_CLASSES = {
  'In Progress': 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'Completed': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  'Backlog': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};
const STATUS_OPTIONS = ['Backlog', 'In Progress', 'Completed'];
const TYPE_OPTIONS = ['Book', 'Course', 'Article', 'Other'];

/**
 * Mounts the Activities tab into rootEl.
 *
 * @param {HTMLElement} rootEl
 * @returns {() => void} cleanup
 */
export function mount(rootEl) {
  if (!rootEl) return () => {};

  let activeFilter = 'All'; // 'All' | 'Backlog' | 'In Progress' | 'Completed' | 'Archived'
  let editingActivityId = null;

  rootEl.innerHTML = '';

  // Main container
  const container = document.createElement('div');
  container.className = 'activities-view flex flex-col gap-6 max-w-lg mx-auto w-full';

  // --- Header ---
  const header = document.createElement('header');
  header.className = 'flex items-center justify-between gap-4';

  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'flex flex-col';

  const pageTitle = document.createElement('h1');
  pageTitle.className = 'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50';
  pageTitle.textContent = 'Activities';

  const pageSubtitle = document.createElement('p');
  pageSubtitle.className = 'text-sm font-medium text-zinc-500 dark:text-zinc-400';
  pageSubtitle.textContent = 'Track books, courses, and long-term learning';

  titleWrapper.appendChild(pageTitle);
  titleWrapper.appendChild(pageSubtitle);

  const newBtn = document.createElement('button');
  newBtn.id = 'btn-new-activity';
  newBtn.type = 'button';
  newBtn.className =
    'flex items-center justify-center min-h-[44px] min-w-[44px] px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg active:scale-95 transition shadow-sm';
  newBtn.textContent = '+ New Activity';
  newBtn.addEventListener('click', () => {
    openModal();
  });

  header.appendChild(titleWrapper);
  header.appendChild(newBtn);
  container.appendChild(header);

  // --- Filter Pills Bar ---
  const filterSection = document.createElement('div');
  filterSection.className = 'flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none';

  const filters = [
    { id: 'filter-pill-all', label: 'All', value: 'All' },
    { id: 'filter-pill-backlog', label: 'Backlog', value: 'Backlog' },
    { id: 'filter-pill-in-progress', label: 'In Progress', value: 'In Progress' },
    { id: 'filter-pill-completed', label: 'Completed', value: 'Completed' },
    { id: 'filter-pill-archived', label: 'Archived', value: 'Archived' },
  ];

  const pillButtons = [];
  for (const f of filters) {
    const pill = document.createElement('button');
    pill.id = f.id;
    pill.type = 'button';
    pill.className = `filter-pill flex items-center justify-center min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-full text-xs font-medium cursor-pointer transition select-none ${
      activeFilter === f.value
        ? 'bg-indigo-600 text-white'
        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
    }`;
    pill.textContent = f.label;
    pill.addEventListener('click', () => {
      activeFilter = f.value;
      updateFilterPillStyles();
      renderActivitiesList();
    });
    pillButtons.push({ pill, value: f.value });
    filterSection.appendChild(pill);
  }
  container.appendChild(filterSection);

  function updateFilterPillStyles() {
    for (const item of pillButtons) {
      if (item.value === activeFilter) {
        item.pill.className =
          'filter-pill flex items-center justify-center min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-full text-xs font-medium cursor-pointer transition select-none bg-indigo-600 text-white';
      } else {
        item.pill.className =
          'filter-pill flex items-center justify-center min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-full text-xs font-medium cursor-pointer transition select-none bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700';
      }
    }
  }

  // --- Activities List Container ---
  const listContainer = document.createElement('div');
  listContainer.id = 'activities-list';
  listContainer.className = 'flex flex-col gap-3';
  container.appendChild(listContainer);

  // --- Modal Container (for Create / Edit) ---
  const modalWrapper = document.createElement('div');
  modalWrapper.id = 'activity-modal-wrapper';
  modalWrapper.style.display = 'none';
  container.appendChild(modalWrapper);

  rootEl.appendChild(container);

  // --- Functions ---
  async function renderActivitiesList() {
    listContainer.innerHTML = '';

    const isArchivedView = activeFilter === 'Archived';
    let activities = [];
    try {
      if (isArchivedView) {
        const all = await listActivities({ includeArchived: true });
        activities = all.filter((a) => a.archived);
      } else {
        activities = await listActivities({
          includeArchived: false,
          status: activeFilter !== 'All' ? activeFilter : undefined,
        });
      }
    } catch (err) {
      console.error('Error listing activities:', err);
      activities = [];
    }

    if (activities.length === 0) {
      // Empty state
      const emptyState = document.createElement('div');
      emptyState.id = 'activities-empty-state';
      emptyState.className =
        'flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 gap-4 mt-2';

      const emptyIcon = document.createElement('div');
      emptyIcon.className =
        'w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center';
      emptyIcon.innerHTML = `
        <svg class="w-6 h-6 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      `;

      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'flex flex-col gap-1';
      const emptyHeading = document.createElement('p');
      emptyHeading.className = 'font-semibold text-zinc-900 dark:text-zinc-100';
      emptyHeading.textContent = isArchivedView
        ? 'No archived activities'
        : activeFilter === 'All'
        ? 'No activities yet'
        : `No activities in ${activeFilter}`;
      const emptySub = document.createElement('p');
      emptySub.className = 'text-xs text-zinc-500 dark:text-zinc-400 max-w-xs';
      emptySub.textContent = isArchivedView
        ? 'Archived activities will be safely stored and listed here.'
        : 'Track the books you are reading, courses you take, or articles you want to study.';

      emptyMsg.appendChild(emptyHeading);
      emptyMsg.appendChild(emptySub);

      emptyState.appendChild(emptyIcon);
      emptyState.appendChild(emptyMsg);

      if (!isArchivedView) {
        const createEmptyBtn = document.createElement('button');
        createEmptyBtn.id = 'btn-create-activity-empty';
        createEmptyBtn.type = 'button';
        createEmptyBtn.className =
          'min-h-[44px] min-w-[44px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium active:scale-95 transition shadow-sm';
        createEmptyBtn.textContent = '+ Create Activity';
        createEmptyBtn.addEventListener('click', () => openModal());
        emptyState.appendChild(createEmptyBtn);
      }

      listContainer.appendChild(emptyState);
      return;
    }

    // Render activity cards
    for (const act of activities) {
      const card = document.createElement('article');
      card.className =
        'activity-card flex flex-col p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs gap-3 transition';
      card.dataset.activityId = act.id;

      // Status badge color
      const statusClass =
        STATUS_CLASSES[act.status] ||
        'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';

      // Card Header
      const cardHeader = document.createElement('div');
      cardHeader.className = 'flex items-start justify-between gap-3';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'flex flex-col gap-0.5';

      const cardTitle = document.createElement('h3');
      cardTitle.className = 'text-base font-semibold text-zinc-900 dark:text-zinc-50';
      cardTitle.textContent = act.title;
      titleGroup.appendChild(cardTitle);

      if (act.author) {
        const cardAuthor = document.createElement('p');
        cardAuthor.className = 'text-xs text-zinc-500 dark:text-zinc-400';
        cardAuthor.textContent = `By ${act.author}`;
        titleGroup.appendChild(cardAuthor);
      }
      const badges = document.createElement('div');
      badges.className = 'flex items-center gap-1.5 shrink-0';

      const typeBadge = document.createElement('span');
      typeBadge.className =
        'px-2 py-0.5 text-[11px] font-medium rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
      typeBadge.textContent = act.type || 'Book';

      const statusBadge = document.createElement('span');
      statusBadge.className = `px-2 py-0.5 text-[11px] font-medium rounded-md ${statusClass}`;
      statusBadge.textContent = act.status || 'Backlog';

      badges.appendChild(typeBadge);
      badges.appendChild(statusBadge);

      cardHeader.appendChild(titleGroup);
      cardHeader.appendChild(badges);
      card.appendChild(cardHeader);

      // Meta: pages
      if (act.totalPages > 0) {
        const pagesMeta = document.createElement('div');
        pagesMeta.className = 'flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400';
        pagesMeta.innerHTML = `
          <svg class="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>${act.totalPages} pages</span>
        `;
        card.appendChild(pagesMeta);
      }

      // Summary
      if (act.summary) {
        const summaryEl = document.createElement('p');
        summaryEl.className =
          'text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-md border border-zinc-100 dark:border-zinc-800/80';
        summaryEl.textContent = act.summary;
        card.appendChild(summaryEl);
      }

      // Actions Footer
      const cardFooter = document.createElement('div');
      cardFooter.className =
        'flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 mt-1';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.dataset.action = 'edit';
      editBtn.dataset.id = act.id;
      editBtn.className =
        'flex items-center justify-center min-h-[44px] min-w-[44px] px-3.5 py-2.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openModal(act));

      const archiveBtn = document.createElement('button');
      archiveBtn.type = 'button';
      archiveBtn.dataset.action = 'archive';
      archiveBtn.dataset.id = act.id;
      archiveBtn.className = `flex items-center justify-center min-h-[44px] min-w-[44px] px-3.5 py-2.5 text-xs font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition ${
        act.archived
          ? 'text-indigo-600 dark:text-indigo-400'
          : 'text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400'
      }`;
      archiveBtn.textContent = act.archived ? 'Unarchive' : 'Archive';
      archiveBtn.addEventListener('click', async () => {
        try {
          const nextArchived = !act.archived;
          await setActivityArchived(act.id, nextArchived);
          showToast(nextArchived ? 'Activity archived' : 'Activity unarchived');
          await renderActivitiesList();
        } catch (err) {
          console.error('Error toggling archive:', err);
          showToast('Failed to update activity');
        }
      });

      cardFooter.appendChild(editBtn);
      cardFooter.appendChild(archiveBtn);
      card.appendChild(cardFooter);

      listContainer.appendChild(card);
    }
  }

  function openModal(existingActivity = null) {
    editingActivityId = existingActivity ? existingActivity.id : null;
    modalWrapper.innerHTML = '';
    modalWrapper.style.display = 'block';

    const modal = document.createElement('div');
    modal.id = 'activity-modal';
    modal.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto';

    const modalBox = document.createElement('div');
    modalBox.className =
      'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-xl flex flex-col gap-4 my-auto';

    const modalHeader = document.createElement('div');
    modalHeader.className = 'flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800';

    const modalTitle = document.createElement('h2');
    modalTitle.className = 'text-lg font-bold text-zinc-900 dark:text-zinc-50';
    modalTitle.textContent = existingActivity ? 'Edit Activity' : 'New Activity';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className =
      'min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200';
    closeBtn.innerHTML = `
      <svg class="w-5 h-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    `;
    closeBtn.addEventListener('click', closeModal);

    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeBtn);
    modalBox.appendChild(modalHeader);

    // Form inputs
    const form = document.createElement('form');
    form.className = 'flex flex-col gap-3.5';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveActivityFromModal();
    });

    // 1. Title
    const titleGroup = document.createElement('div');
    titleGroup.className = 'flex flex-col gap-1';
    const titleLabel = document.createElement('label');
    titleLabel.className = 'text-xs font-semibold text-zinc-700 dark:text-zinc-300';
    titleLabel.textContent = 'Title *';
    titleLabel.setAttribute('for', 'activity-input-title');
    const titleInput = document.createElement('input');
    titleInput.id = 'activity-input-title';
    titleInput.type = 'text';
    titleInput.required = true;
    titleInput.value = existingActivity ? existingActivity.title : '';
    titleInput.placeholder = 'e.g. Designing Data-Intensive Applications';
    titleInput.className =
      'w-full text-base min-h-[44px] px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
    titleGroup.appendChild(titleLabel);
    titleGroup.appendChild(titleInput);
    form.appendChild(titleGroup);

    // 2. Author / Source
    const authorGroup = document.createElement('div');
    authorGroup.className = 'flex flex-col gap-1';
    const authorLabel = document.createElement('label');
    authorLabel.className = 'text-xs font-semibold text-zinc-700 dark:text-zinc-300';
    authorLabel.textContent = 'Author / Source';
    authorLabel.setAttribute('for', 'activity-input-author');
    const authorInput = document.createElement('input');
    authorInput.id = 'activity-input-author';
    authorInput.type = 'text';
    authorInput.value = existingActivity ? existingActivity.author || '' : '';
    authorInput.placeholder = 'e.g. Martin Kleppmann, Coursera, etc.';
    authorInput.className =
      'w-full text-base min-h-[44px] px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
    authorGroup.appendChild(authorLabel);
    authorGroup.appendChild(authorInput);
    form.appendChild(authorGroup);

    // 3. Row with Type and Status
    const rowGroup = document.createElement('div');
    rowGroup.className = 'grid grid-cols-2 gap-3';

    // Type
    const typeGroup = document.createElement('div');
    typeGroup.className = 'flex flex-col gap-1';
    const typeLabel = document.createElement('label');
    typeLabel.className = 'text-xs font-semibold text-zinc-700 dark:text-zinc-300';
    typeLabel.textContent = 'Type';
    typeLabel.setAttribute('for', 'activity-input-type');
    const typeSelect = document.createElement('select');
    typeSelect.id = 'activity-input-type';
    typeSelect.className =
      'w-full text-base min-h-[44px] px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
    for (const t of TYPE_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (existingActivity && existingActivity.type === t) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    typeGroup.appendChild(typeLabel);
    typeGroup.appendChild(typeSelect);
    rowGroup.appendChild(typeGroup);

    // Status
    const statusGroup = document.createElement('div');
    statusGroup.className = 'flex flex-col gap-1';
    const statusLabel = document.createElement('label');
    statusLabel.className = 'text-xs font-semibold text-zinc-700 dark:text-zinc-300';
    statusLabel.textContent = 'Status';
    statusLabel.setAttribute('for', 'activity-input-status');
    const statusSelect = document.createElement('select');
    statusSelect.id = 'activity-input-status';
    statusSelect.className =
      'w-full text-base min-h-[44px] px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
    for (const s of STATUS_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (existingActivity) {
        if (existingActivity.status === s) opt.selected = true;
      } else {
        if (s === 'Backlog') opt.selected = true;
      }
      statusSelect.appendChild(opt);
    }
    statusGroup.appendChild(statusLabel);
    statusGroup.appendChild(statusSelect);
    rowGroup.appendChild(statusGroup);

    form.appendChild(rowGroup);

    // 4. Total Pages
    const pagesGroup = document.createElement('div');
    pagesGroup.className = 'flex flex-col gap-1';
    const pagesLabel = document.createElement('label');
    pagesLabel.className = 'text-xs font-semibold text-zinc-700 dark:text-zinc-300';
    pagesLabel.textContent = 'Total Pages';
    pagesLabel.setAttribute('for', 'activity-input-pages');
    const pagesInput = document.createElement('input');
    pagesInput.id = 'activity-input-pages';
    pagesInput.type = 'number';
    pagesInput.min = '0';
    pagesInput.value = existingActivity ? String(existingActivity.totalPages || 0) : '0';
    pagesInput.className =
      'w-full text-base min-h-[44px] px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
    pagesGroup.appendChild(pagesLabel);
    pagesGroup.appendChild(pagesInput);
    form.appendChild(pagesGroup);

    // 5. Executive Summary
    const summaryGroup = document.createElement('div');
    summaryGroup.className = 'flex flex-col gap-1';
    const summaryLabel = document.createElement('label');
    summaryLabel.className = 'text-xs font-semibold text-zinc-700 dark:text-zinc-300';
    summaryLabel.textContent = 'Executive Summary';
    summaryLabel.setAttribute('for', 'activity-input-summary');
    const summaryInput = document.createElement('textarea');
    summaryInput.id = 'activity-input-summary';
    summaryInput.rows = 3;
    summaryInput.value = existingActivity ? existingActivity.summary || '' : '';
    summaryInput.placeholder = 'Key insights, takeaways, or quick thoughts...';
    summaryInput.className =
      'w-full text-base px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
    summaryGroup.appendChild(summaryLabel);
    summaryGroup.appendChild(summaryInput);
    form.appendChild(summaryGroup);

    // Modal Action Buttons
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'activity-btn-cancel';
    cancelBtn.type = 'button';
    cancelBtn.className =
      'flex items-center justify-center min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);

    const saveBtn = document.createElement('button');
    saveBtn.id = 'activity-btn-save';
    saveBtn.type = 'submit';
    saveBtn.className =
      'flex items-center justify-center min-h-[44px] min-w-[44px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium active:scale-95 transition shadow-sm';
    saveBtn.textContent = existingActivity ? 'Save Changes' : 'Create Activity';
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      saveActivityFromModal();
    });
    actionsGroup.appendChild(saveBtn);
    form.appendChild(actionsGroup);

    modalBox.appendChild(form);
    modal.appendChild(modalBox);
    modalWrapper.appendChild(modal);

  }

  function closeModal() {
    modalWrapper.innerHTML = '';
    modalWrapper.style.display = 'none';
    editingActivityId = null;
  }

  async function saveActivityFromModal() {
    const titleInput = rootEl.querySelector('#activity-input-title');
    const authorInput = rootEl.querySelector('#activity-input-author');
    const typeSelect = rootEl.querySelector('#activity-input-type');
    const statusSelect = rootEl.querySelector('#activity-input-status');
    const pagesInput = rootEl.querySelector('#activity-input-pages');
    const summaryInput = rootEl.querySelector('#activity-input-summary');

    const title = (titleInput?.value || '').trim();
    if (!title) {
      showToast('Please enter an activity title');
      return;
    }

    const payload = {
      title,
      author: (authorInput?.value || '').trim(),
      type: (typeSelect?.value || 'Book').trim(),
      status: (statusSelect?.value || 'Backlog').trim(),
      totalPages: Math.max(0, parseInt(pagesInput?.value, 10) || 0),
      summary: (summaryInput?.value || '').trim(),
    };

    try {
      if (editingActivityId) {
        await updateActivity(editingActivityId, payload);
        showToast('Activity updated');
      } else {
        await addActivity(payload);
        showToast('Activity created');
      }
      closeModal();
      await renderActivitiesList();
    } catch (err) {
      console.error('Error saving activity:', err);
      showToast(err.message || 'Failed to save activity');
    }
  }

  // Subscribe to changes
  const unsubscribeRepo = onChange(() => {
    renderActivitiesList();
  });

  // Initial render
  renderActivitiesList();

  return () => {
    unsubscribeRepo();
    modalWrapper.innerHTML = '';
  };
}
