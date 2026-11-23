/**
 * Shared DOM helpers for Habit form controls (Custom Time Picker popover, Linked Activity select, Escape handling).
 */

import {
  MINUTE_STEPS,
  formatScheduledTime,
  from24Hour,
  isLocale12Hour,
  normalizeScheduledTime,
  to24Hour,
} from '../domain/schedule.js';

const CLOCK_ICON_SVG = `<svg class="w-4 h-4 shrink-0 text-[#68655F] dark:text-[#A39E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
const CHEVRON_DOWN_SVG = `<svg class="w-3.5 h-3.5 shrink-0 text-[#68655F] dark:text-[#A39E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>`;

const SELECTED_SURFACE_CLASSES = 'bg-[#9E4B4B] text-[#FAF8F5] dark:bg-[#C67878] dark:text-[#1C1B18] font-semibold';

/** Tracks the currently open time picker popover so only one opens at a time. */
let activeClosePopover = null;

/**
 * Helper to style toggleable option buttons consistently inside the popover.
 *
 * @param {HTMLButtonElement} btn
 * @param {boolean} isSelected
 */
function applyOptionSelectedState(btn, isSelected) {
  btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  btn.className = isSelected
    ? `w-full min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-sm font-mono ${SELECTED_SURFACE_CLASSES} flex items-center justify-center transition-colors cursor-pointer`
    : 'w-full min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-sm font-mono font-medium text-[#1C1B18] dark:text-[#F4F1EA] hover:bg-[#EFECE6] dark:hover:bg-[#2C2926] flex items-center justify-center transition-colors cursor-pointer';
}

/**
 * Builds the full-field clickable trigger button for the custom time picker.
 *
 * @param {{ id?: string, triggerClassName?: string, ariaLabel: string }} config
 * @returns {{ triggerBtn: HTMLButtonElement, valueSpan: HTMLSpanElement }}
 */
function createTriggerButton({ id, triggerClassName, ariaLabel }) {
  const defaultTriggerClasses =
    'min-h-[44px] min-w-[44px] w-full px-3 py-2 text-sm bg-[#F6F5F2] dark:bg-[#161514] border border-[#E6E4DF] dark:border-[#33302C] rounded-lg flex items-center justify-between gap-2 text-left transition-colors hover:border-[#C86D51]/60 focus:outline-none focus:ring-2 focus:ring-[#C86D51] cursor-pointer';

  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  if (id) triggerBtn.id = id;
  triggerBtn.className = triggerClassName
    ? `${defaultTriggerClasses} ${triggerClassName}`
    : defaultTriggerClasses;
  triggerBtn.setAttribute('aria-label', ariaLabel);
  triggerBtn.setAttribute('aria-haspopup', 'dialog');
  triggerBtn.setAttribute('aria-expanded', 'false');

  const triggerLeft = document.createElement('span');
  triggerLeft.className = 'inline-flex items-center gap-2 min-w-0';
  triggerLeft.innerHTML = CLOCK_ICON_SVG;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'time-picker-value truncate font-mono';
  triggerLeft.appendChild(valueSpan);

  const chevronSpan = document.createElement('span');
  chevronSpan.className = 'inline-flex items-center shrink-0';
  chevronSpan.innerHTML = CHEVRON_DOWN_SVG;

  triggerBtn.appendChild(triggerLeft);
  triggerBtn.appendChild(chevronSpan);
  return { triggerBtn, valueSpan };
}

/**
 * Builds the popover header bar containing the time preview and optional 12h AM/PM switch.
 *
 * @param {{ use12Hour: boolean, onSelectPeriod: (period: 'AM' | 'PM') => void }} config
 * @returns {{ headerRow: HTMLDivElement, previewText: HTMLSpanElement, amBtn: HTMLButtonElement | null, pmBtn: HTMLButtonElement | null }}
 */
function buildPopoverHeader({ use12Hour, onSelectPeriod }) {
  const headerRow = document.createElement('div');
  headerRow.className =
    'flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[#E6E4DF] dark:border-[#33302C]';

  const previewText = document.createElement('span');
  previewText.className = 'text-xs font-mono font-medium text-[#68655F] dark:text-[#A39E93]';
  headerRow.appendChild(previewText);

  let amBtn = null;
  let pmBtn = null;
  if (use12Hour) {
    const periodGroup = document.createElement('div');
    periodGroup.className = 'inline-flex items-center gap-1';

    amBtn = document.createElement('button');
    amBtn.type = 'button';
    amBtn.setAttribute('data-period', 'AM');
    amBtn.textContent = 'AM';
    amBtn.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      onSelectPeriod('AM');
    });

    pmBtn = document.createElement('button');
    pmBtn.type = 'button';
    pmBtn.setAttribute('data-period', 'PM');
    pmBtn.textContent = 'PM';
    pmBtn.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      onSelectPeriod('PM');
    });

    periodGroup.appendChild(amBtn);
    periodGroup.appendChild(pmBtn);
    headerRow.appendChild(periodGroup);
  }

  return { headerRow, previewText, amBtn, pmBtn };
}

/**
 * Builds the side-by-side scrollable Hour and 5-minute columns inside the popover.
 *
 * @param {{
 *   use12Hour: boolean,
 *   onSelectHour12: (hour12: number) => void,
 *   onSelectHour24: (paddedHour: string) => void,
 *   onSelectMinute: (minuteStep: string) => void
 * }} config
 * @returns {{ columnsGrid: HTMLDivElement, hourButtons: Array, minuteButtons: Array }}
 */
function buildTimeColumns({ use12Hour, onSelectHour12, onSelectHour24, onSelectMinute }) {
  const columnsGrid = document.createElement('div');
  columnsGrid.className = 'grid grid-cols-2 gap-2.5';

  const hourCol = document.createElement('div');
  hourCol.className = 'flex flex-col min-w-0';
  const hourHeading = document.createElement('span');
  hourHeading.className =
    'text-[11px] font-semibold uppercase tracking-wider text-[#68655F] dark:text-[#A39E93] mb-1.5 text-center';
  hourHeading.textContent = 'Hour';
  const hourList = document.createElement('div');
  hourList.className = 'max-h-[212px] overflow-y-auto space-y-1 pr-0.5';

  const hourButtons = [];
  if (use12Hour) {
    for (let h12 = 1; h12 <= 12; h12 += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-hour', String(h12));
      btn.textContent = String(h12);
      btn.addEventListener('click', (e) => {
        e?.stopPropagation?.();
        onSelectHour12(h12);
      });
      hourButtons.push({ btn, hour12: h12 });
      hourList.appendChild(btn);
    }
  } else {
    for (let h24 = 0; h24 <= 23; h24 += 1) {
      const padded = String(h24).padStart(2, '0');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-hour', padded);
      btn.textContent = padded;
      btn.addEventListener('click', (e) => {
        e?.stopPropagation?.();
        onSelectHour24(padded);
      });
      hourButtons.push({ btn, hour24: h24 });
      hourList.appendChild(btn);
    }
  }
  hourCol.appendChild(hourHeading);
  hourCol.appendChild(hourList);

  const minuteCol = document.createElement('div');
  minuteCol.className = 'flex flex-col min-w-0';
  const minuteHeading = document.createElement('span');
  minuteHeading.className =
    'text-[11px] font-semibold uppercase tracking-wider text-[#68655F] dark:text-[#A39E93] mb-1.5 text-center';
  minuteHeading.textContent = 'Min';
  const minuteList = document.createElement('div');
  minuteList.className = 'max-h-[212px] overflow-y-auto space-y-1 pr-0.5';

  const minuteButtons = [];
  for (const step of MINUTE_STEPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-minute', step);
    btn.textContent = step;
    btn.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      onSelectMinute(step);
    });
    minuteButtons.push({ btn, step });
    minuteList.appendChild(btn);
  }
  minuteCol.appendChild(minuteHeading);
  minuteCol.appendChild(minuteList);

  columnsGrid.appendChild(hourCol);
  columnsGrid.appendChild(minuteCol);
  return { columnsGrid, hourButtons, minuteButtons };
}

/**
 * Builds the popover footer with optional Clear and Done controls.
 *
 * @param {{ allowClear: boolean, ariaLabel: string, onClear: () => void, onDone: () => void }} config
 * @returns {HTMLDivElement}
 */
function buildPopoverFooter({ allowClear, ariaLabel, onClear, onDone }) {
  const footerRow = document.createElement('div');
  footerRow.className =
    'mt-3 pt-2.5 border-t border-[#E6E4DF] dark:border-[#33302C] flex items-center justify-between gap-2';

  if (allowClear) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className =
      'time-picker-clear-btn min-h-[44px] min-w-[44px] px-3 py-1.5 text-xs font-medium text-[#68655F] dark:text-[#A39E93] hover:text-[#1C1B18] dark:hover:text-[#F4F1EA] hover:bg-[#EFECE6] dark:hover:bg-[#2C2926] rounded-lg transition-colors cursor-pointer';
    clearBtn.textContent = 'Clear';
    clearBtn.setAttribute('aria-label', `Clear ${ariaLabel}`);
    clearBtn.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      onClear();
    });
    footerRow.appendChild(clearBtn);
  }

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className =
    'time-picker-done-btn ml-auto min-h-[44px] min-w-[44px] px-4 py-1.5 text-xs font-semibold btn-terracotta rounded-lg transition-colors cursor-pointer';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', (e) => {
    e?.stopPropagation?.();
    onDone();
  });
  footerRow.appendChild(doneBtn);

  return footerRow;
}

/**
 * Positions the popover cleanly within the viewport without causing horizontal overflow.
 *
 * @param {HTMLElement} container
 * @param {HTMLElement} popoverEl
 */
function positionPopover(container, popoverEl) {
  if (typeof window === 'undefined' || !container.getBoundingClientRect) return;
  const rect = container.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  if (!vw || rect.width === 0) return;
  const popWidth = Math.min(284, Math.max(220, vw - 32));
  const clampedViewportLeft = Math.max(16, Math.min(rect.left, vw - 16 - popWidth));
  popoverEl.style.left = `${clampedViewportLeft - rect.left}px`;
  popoverEl.style.right = 'auto';
  popoverEl.style.width = `${popWidth}px`;
}

/**
 * Synchronizes trigger label, preview text, and selected states for periods, hours, and minutes.
 *
 * @param {object} uiRefs
 */
function syncPickerUI({
  currentValue,
  placeholder,
  locale,
  use12Hour,
  draftPeriod,
  draftMinute,
  triggerBtn,
  valueSpan,
  previewText,
  amBtn,
  pmBtn,
  hourButtons,
  minuteButtons,
}) {
  const formatted = currentValue ? formatScheduledTime(currentValue, locale) : '';
  triggerBtn.setAttribute('data-time', currentValue);
  if (formatted) {
    valueSpan.textContent = formatted;
    valueSpan.className = 'time-picker-value truncate font-mono text-[#1C1B18] dark:text-[#F4F1EA] font-medium';
    previewText.textContent = formatted;
  } else {
    valueSpan.textContent = placeholder;
    valueSpan.className = 'time-picker-value truncate text-[#68655F] dark:text-[#A39E93]';
    previewText.textContent = placeholder;
  }

  const activeHour24 = currentValue ? Number(currentValue.split(':')[0]) : null;
  const activeHour12 = activeHour24 !== null ? from24Hour(activeHour24)?.hour12 ?? null : null;
  const activeMinute = currentValue ? currentValue.split(':')[1] : draftMinute;

  if (use12Hour && amBtn && pmBtn) {
    const activePeriod = activeHour24 !== null ? from24Hour(activeHour24)?.period : draftPeriod;
    const periodBase =
      'min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer inline-flex items-center justify-center';
    for (const [btn, label] of [
      [amBtn, 'AM'],
      [pmBtn, 'PM'],
    ]) {
      const selected = activePeriod === label;
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      btn.className = selected
        ? `${periodBase} ${SELECTED_SURFACE_CLASSES}`
        : `${periodBase} font-semibold text-[#68655F] dark:text-[#A39E93] hover:bg-[#EFECE6] dark:hover:bg-[#2C2926]`;
    }
  }

  for (const item of hourButtons) {
    const selected = use12Hour ? item.hour12 === activeHour12 : item.hour24 === activeHour24;
    applyOptionSelectedState(item.btn, selected);
  }
  for (const item of minuteButtons) {
    applyOptionSelectedState(item.btn, item.step === activeMinute);
  }
}

/**
 * Creates a full-field clickable Habbit-themed custom time picker with an accessible Light/Dark popover.
 * Clicking anywhere on the trigger opens Hour + 5-minute (`:00`..`:55`) columns adapting to the Device's 12h/24h locale.
 *
 * @param {{
 *   id?: string,
 *   triggerClassName?: string,
 *   ariaLabel: string,
 *   placeholder?: string,
 *   value?: string,
 *   allowClear?: boolean,
 *   use12Hour?: boolean,
 *   locale?: string,
 *   onChange?: (nextValue: string) => void,
 *   onCommit?: (committedValue: string) => void
 * }} config
 * @returns {{
 *   container: HTMLDivElement,
 *   triggerBtn: HTMLButtonElement,
 *   getValue: () => string,
 *   setValue: (nextValue: string) => void,
 *   open: () => void,
 *   close: (options?: { restoreFocus?: boolean, emitCommit?: boolean }) => void,
 *   isOpen: () => boolean,
 *   focus: () => void,
 *   destroy: () => void
 * }}
 */
export function createTimePickerField({
  id,
  triggerClassName = '',
  ariaLabel,
  placeholder = 'Anytime',
  value = '',
  allowClear = true,
  use12Hour = isLocale12Hour(),
  locale = undefined,
  onChange,
  onCommit,
}) {
  let currentValue = normalizeScheduledTime(value);
  let openInitialValue = currentValue;
  let openState = false;
  let draftPeriod = 'AM';
  let draftMinute = null;

  function syncDraftFromValue() {
    if (currentValue) {
      const [hh, mm] = currentValue.split(':');
      draftMinute = mm;
      draftPeriod = from24Hour(Number(hh))?.period || 'AM';
    } else {
      draftMinute = null;
      draftPeriod = 'AM';
    }
  }
  syncDraftFromValue();

  const container = document.createElement('div');
  container.className = 'relative';

  const { triggerBtn, valueSpan } = createTriggerButton({ id, triggerClassName, ariaLabel });
  container.appendChild(triggerBtn);

  const popoverEl = document.createElement('div');
  popoverEl.setAttribute('role', 'dialog');
  popoverEl.setAttribute('aria-label', `${ariaLabel} selector`);
  popoverEl.className =
    'habbit-time-picker-popover hidden absolute left-0 top-full mt-1.5 z-50 w-[284px] max-w-[calc(100vw-32px)] rounded-xl border border-[#E6E4DF] dark:border-[#33302C] bg-[#FFFFFF] dark:bg-[#22201E] shadow-lg p-3';

  function refreshUI() {
    syncPickerUI({
      currentValue,
      placeholder,
      locale,
      use12Hour,
      draftPeriod,
      draftMinute,
      triggerBtn,
      valueSpan,
      previewText,
      amBtn,
      pmBtn,
      hourButtons,
      minuteButtons,
    });
  }

  function applyValue(nextRaw, emitChange) {
    const normalized = normalizeScheduledTime(nextRaw);
    const changed = normalized !== currentValue;
    currentValue = normalized;
    syncDraftFromValue();
    refreshUI();
    if (emitChange && changed) {
      onChange?.(currentValue);
    }
  }

  const { headerRow, previewText, amBtn, pmBtn } = buildPopoverHeader({
    use12Hour,
    onSelectPeriod: (nextPeriod) => {
      draftPeriod = nextPeriod;
      if (currentValue) {
        const [hh, mm] = currentValue.split(':');
        const converted = from24Hour(Number(hh));
        const nextHour24 = converted ? to24Hour(converted.hour12, nextPeriod) : null;
        if (nextHour24 !== null) {
          applyValue(`${String(nextHour24).padStart(2, '0')}:${mm}`, true);
          return;
        }
      }
      refreshUI();
    },
  });

  const { columnsGrid, hourButtons, minuteButtons } = buildTimeColumns({
    use12Hour,
    onSelectHour12: (h12) => {
      const hour24 = to24Hour(h12, draftPeriod);
      if (hour24 === null) return;
      const mm = currentValue ? currentValue.split(':')[1] : draftMinute || '00';
      applyValue(`${String(hour24).padStart(2, '0')}:${mm}`, true);
    },
    onSelectHour24: (padded) => {
      const mm = currentValue ? currentValue.split(':')[1] : draftMinute || '00';
      applyValue(`${padded}:${mm}`, true);
    },
    onSelectMinute: (step) => {
      draftMinute = step;
      if (currentValue) {
        applyValue(`${currentValue.split(':')[0]}:${step}`, true);
      } else {
        refreshUI();
      }
    },
  });

  const footerRow = buildPopoverFooter({
    allowClear,
    ariaLabel,
    onClear: () => {
      draftMinute = null;
      draftPeriod = 'AM';
      applyValue('', true);
      close({ restoreFocus: true });
    },
    onDone: () => close({ restoreFocus: true }),
  });

  popoverEl.appendChild(headerRow);
  popoverEl.appendChild(columnsGrid);
  popoverEl.appendChild(footerRow);
  container.appendChild(popoverEl);

  function open() {
    if (openState) return;
    if (activeClosePopover && activeClosePopover !== close) {
      activeClosePopover({ restoreFocus: false, emitCommit: true });
    }
    syncDraftFromValue();
    openInitialValue = currentValue;
    openState = true;
    activeClosePopover = close;
    triggerBtn.setAttribute('aria-expanded', 'true');
    popoverEl.classList.remove('hidden');
    refreshUI();
    positionPopover(container, popoverEl);
  }

  function close({ restoreFocus = false, emitCommit = true } = {}) {
    if (!openState) return;
    openState = false;
    if (activeClosePopover === close) {
      activeClosePopover = null;
    }
    triggerBtn.setAttribute('aria-expanded', 'false');
    popoverEl.classList.add('hidden');
    if (!currentValue) {
      syncDraftFromValue();
    }
    if (emitCommit && currentValue !== openInitialValue) {
      openInitialValue = currentValue;
      onCommit?.(currentValue);
    }
    if (restoreFocus) {
      triggerBtn.focus?.();
    }
  }

  triggerBtn.addEventListener('click', (e) => {
    e?.stopPropagation?.();
    if (openState) {
      close({ restoreFocus: false, emitCommit: true });
    } else {
      open();
    }
  });

  popoverEl.addEventListener('click', (e) => {
    e?.stopPropagation?.();
  });

  const handleDocumentClick = (e) => {
    if (!openState) return;
    if (container.contains?.(e?.target)) return;
    close({ restoreFocus: false, emitCommit: true });
  };

  const handleDocumentKeydown = (e) => {
    if (!openState) return;
    if (e?.key === 'Escape') {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      close({ restoreFocus: true, emitCommit: true });
    }
  };

  // Capture phase runs before tab-switch navigation unmounts/destroys the popover
  document.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('keydown', handleDocumentKeydown);
  refreshUI();

  return {
    container,
    triggerBtn,
    getValue: () => currentValue,
    setValue: (nextValue) => {
      applyValue(nextValue, false);
      openInitialValue = currentValue;
    },
    open,
    close,
    isOpen: () => openState,
    focus: () => triggerBtn.focus?.(),
    destroy: () => {
      close({ restoreFocus: false, emitCommit: false });
      document.removeEventListener('click', handleDocumentClick, true);
      document.removeEventListener('keydown', handleDocumentKeydown);
    },
  };
}

/**
 * Populates a `<select>` element with Linked Activity options and sets `.value` explicitly.
 *
 * @param {HTMLSelectElement} selectEl
 * @param {{ selectedValue?: string | null, labels: { none: string, book: string, journal: string } }} config
 */
export function populateLinkedActivitySelect(selectEl, { selectedValue = '', labels }) {
  const options = [
    { value: '', label: labels.none },
    { value: 'book_summary', label: labels.book },
    { value: 'journal', label: labels.journal },
  ];
  const normalizedSelected = selectedValue || '';
  for (const opt of options) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    optionEl.selected = normalizedSelected === opt.value;
    selectEl.appendChild(optionEl);
  }
  selectEl.value = normalizedSelected;
}

/**
 * Binds an Escape key handler across one or more elements (handles MockElement non-bubbling dispatch).
 *
 * @param {Array<HTMLElement>} elements
 * @param {() => void} onEscape
 */
export function bindEscapeKey(elements, onEscape) {
  const handler = (e) => {
    if (e.key === 'Escape') {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      onEscape();
    }
  };
  for (const element of elements) {
    element?.addEventListener?.('keydown', handler);
  }
}
