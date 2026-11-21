/**
 * Shared DOM helpers for Habit form controls (Scheduled Time + Clear, Linked Activity select, Escape handling).
 */

/**
 * Creates a `<input type="time">` element paired with a Clear button (`>= 44x44px`, `16px`).
 *
 * @param {{
 *   inputId?: string,
 *   inputClassName: string,
 *   ariaLabel: string,
 *   value?: string,
 *   clearButtonId?: string,
 *   clearButtonClassName: string,
 *   clearAriaLabel: string
 * }} config
 * @returns {{ timeInput: HTMLInputElement, clearBtn: HTMLButtonElement }}
 */
export function createScheduledTimePair({
  inputId,
  inputClassName,
  ariaLabel,
  value = '',
  clearButtonId,
  clearButtonClassName,
  clearAriaLabel,
}) {
  const timeInput = document.createElement('input');
  if (inputId) timeInput.id = inputId;
  timeInput.type = 'time';
  timeInput.value = value;
  timeInput.className = inputClassName;
  timeInput.setAttribute('aria-label', ariaLabel);
  timeInput.style.fontSize = '16px';

  const clearBtn = document.createElement('button');
  if (clearButtonId) clearBtn.id = clearButtonId;
  clearBtn.type = 'button';
  clearBtn.className = clearButtonClassName;
  clearBtn.setAttribute('aria-label', clearAriaLabel);
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    timeInput.value = '';
  });

  return { timeInput, clearBtn };
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
      onEscape();
    }
  };
  for (const element of elements) {
    element?.addEventListener?.('keydown', handler);
  }
}
