/**
 * journal-prompts.js
 *
 * Prompt Cards Stack Daily Journal workspace, customization modal,
 * and compilation/decompilation logic for Activities tab.
 */

export const CHEVRON_LEFT_SVG = `
<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M15 19l-7-7 7-7" />
</svg>
`.trim();

export const LIST_BULLET_SVG = `
<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 6h.01M4 12h.01M4 18h.01M8 6h12M8 12h12M8 18h12" />
</svg>
`.trim();

export const LIST_NUMBER_SVG = `
<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 6h1v4m-1 0h2m-2 4h2a1 1 0 011 1v1a1 1 0 01-1 1h-2v2h3M10 6h10M10 12h10M10 18h10" />
</svg>
`.trim();

export {
  JOURNAL_SUBVIEW,
  SETTINGS_KEY,
  DEFAULT_JOURNAL_PROMPTS,
  escapeHtml,
  sanitizeJournalHtml,
  compilePromptJournal,
  parseStructuredJournalBlocks,
  decompilePromptJournal,
  computeWordCount,
  hasNonEmptyJournalAnswers,
} from '../domain/journal.js';

import {
  SETTINGS_KEY,
  DEFAULT_JOURNAL_PROMPTS,
  computeWordCount,
  decompilePromptJournal,
} from '../domain/journal.js';
/**
 * Loads current prompts from Settings, or seeds and returns defaults.
 * @param {Function} getSettingFn
 * @param {Function} [setSettingFn]
 * @returns {Promise<Array<{ id: string, prompt: string, order: number, archived: boolean }>>}
 */
export async function loadJournalPrompts(getSettingFn, setSettingFn) {
  try {
    if (typeof getSettingFn === 'function') {
      const raw = await getSettingFn(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch {}

  const defaults = JSON.parse(JSON.stringify(DEFAULT_JOURNAL_PROMPTS));
  if (typeof setSettingFn === 'function') {
    saveJournalPrompts(setSettingFn, defaults).catch(() => {});
  }
  return defaults;
}

/**
 * Saves prompts to Settings.
 * @param {Function} setSettingFn
 * @param {Array} prompts
 */
export async function saveJournalPrompts(setSettingFn, prompts) {
  try {
    if (typeof setSettingFn === 'function') {
      await setSettingFn(SETTINGS_KEY, JSON.stringify(prompts));
    }
  } catch (err) {
    console.error('Failed to save journal prompts:', err);
  }
}

/**
 * Renders the Prompt Cards Stack (Variant A) journaling workspace.
 */
export function renderPromptCardsJournal({
  prompts,
  answers,
  additionalNotes,
  status,
  onUpdateAnswers,
  onOpenCustomizeModal,
  onBack,
}) {
  const container = document.createElement('div');
  container.className = 'flex flex-col gap-4 animate-in fade-in duration-150 pb-24';

  // 1. Top Navigation & Stats Bar
  const topBar = document.createElement('div');
  topBar.className =
    'flex items-center justify-between pb-3 border-b border-[#E6E4DF] dark:border-[#33302C] gap-2';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.id = 'btn-back-from-journal-to-activities';
  backBtn.className =
    'min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-lg text-xs font-semibold text-[#68655F] dark:text-[#A39E93] hover:text-[#C86D51] dark:hover:text-[#D97E63] hover:bg-[#EFECE6] dark:hover:bg-[#2C2926] active:scale-95 transition-all cursor-pointer tactile-spring';
  backBtn.innerHTML = `${CHEVRON_LEFT_SVG} <span>Back to Activities</span>`;
  backBtn.addEventListener('click', onBack);

  const rightActions = document.createElement('div');
  rightActions.className = 'flex items-center gap-2';

  const wordBadge = document.createElement('span');
  wordBadge.id = 'journal-total-words';
  wordBadge.className = 'font-mono text-xs text-[#68655F] dark:text-[#A39E93] px-2';
  wordBadge.textContent = `${computeWordCount(answers, additionalNotes)} words`;

  const statusBadge = document.createElement('span');
  statusBadge.id = 'journal-status';
  statusBadge.className =
    'badge-rose inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium';
  statusBadge.textContent = status || 'Saved';

  const customizeBtn = document.createElement('button');
  customizeBtn.type = 'button';
  customizeBtn.id = 'btn-customize-prompts';
  customizeBtn.className =
    'btn-secondary-surface min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono font-semibold border border-[#E6E4DF] dark:border-[#33302C] text-[#68655F] dark:text-[#A39E93] hover:text-[#C86D51] hover:border-[#C86D51] active:scale-95 transition cursor-pointer tactile-spring';
  customizeBtn.innerHTML = `
    <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
    <span>Customize Prompts</span>
  `;
  customizeBtn.addEventListener('click', onOpenCustomizeModal);

  rightActions.appendChild(wordBadge);
  rightActions.appendChild(statusBadge);
  rightActions.appendChild(customizeBtn);

  topBar.appendChild(backBtn);
  topBar.appendChild(rightActions);
  container.appendChild(topBar);

  // 2. Question Prompt Cards
  const activePrompts = [...prompts]
    .filter((p) => !p.archived)
    .sort((a, b) => a.order - b.order);

  activePrompts.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className =
      'editorial-card flex flex-col gap-3 p-4 sm:p-5 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C] shadow-none hover:border-[#68655F] dark:hover:border-[#A39E93] transition';

    // Card Header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'flex items-center justify-between gap-2';

    const promptTitleWrap = document.createElement('div');
    promptTitleWrap.className = 'flex items-center gap-2.5';

    const numBadge = document.createElement('span');
    numBadge.className =
      'w-6 h-6 rounded-md badge-rose text-xs font-mono font-bold flex items-center justify-center shrink-0';
    numBadge.textContent = String(idx + 1);

    const questionTitle = document.createElement('h3');
    questionTitle.className =
      'text-sm font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA] leading-snug';
    questionTitle.textContent = p.prompt;

    promptTitleWrap.appendChild(numBadge);
    promptTitleWrap.appendChild(questionTitle);

    // Card Toolbar (bullets / numbers) meeting touch target min-h-[44px]
    const toolbar = document.createElement('div');
    toolbar.className = 'flex items-center gap-1.5';

    const bulletBtn = document.createElement('button');
    bulletBtn.type = 'button';
    bulletBtn.id = idx === 0 ? 'btn-journal-bullet' : `btn-journal-bullet-${idx}`;
    bulletBtn.title = 'Bullet list';
    bulletBtn.className =
      'btn-secondary-surface min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-xs font-mono font-semibold border border-[#E6E4DF] dark:border-[#33302C] text-[#68655F] dark:text-[#A39E93] hover:text-[#B56565] hover:border-[#B56565] transition cursor-pointer inline-flex items-center gap-1 active:scale-95 tactile-spring';
    bulletBtn.innerHTML = `${LIST_BULLET_SVG} <span class="hidden sm:inline">Bullet</span>`;

    const numberBtn = document.createElement('button');
    numberBtn.type = 'button';
    numberBtn.id = idx === 0 ? 'btn-journal-number' : `btn-journal-number-${idx}`;
    numberBtn.title = 'Numbered list';
    numberBtn.className =
      'btn-secondary-surface min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-xs font-mono font-semibold border border-[#E6E4DF] dark:border-[#33302C] text-[#68655F] dark:text-[#A39E93] hover:text-[#B56565] hover:border-[#B56565] transition cursor-pointer inline-flex items-center gap-1 active:scale-95 tactile-spring';
    numberBtn.innerHTML = `${LIST_NUMBER_SVG} <span class="hidden sm:inline">Numbered</span>`;

    toolbar.appendChild(bulletBtn);
    toolbar.appendChild(numberBtn);
    cardHeader.appendChild(promptTitleWrap);
    cardHeader.appendChild(toolbar);
    card.appendChild(cardHeader);

    // Editor Area with font-size >= 16px (text-base) on mobile to prevent iOS Safari auto-zoom
    const editor = document.createElement('div');
    editor.id = idx === 0 ? 'editor-journal-content' : `editor-journal-content-${idx}`;
    editor.setAttribute('contenteditable', 'true');
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', p.prompt);
    editor.className =
      'rich-editor w-full min-h-[96px] p-3 text-base sm:text-sm rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#B56565] focus:bg-white dark:focus:bg-[#161514] transition leading-relaxed outline-none [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-6 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-6 [&_ul]:my-1.5 [&_p]:my-1';
    editor.innerHTML = answers[p.id] || '';

    // Connect editor events
    editor.addEventListener('input', () => {
      answers[p.id] = editor.innerHTML;
      wordBadge.textContent = `${computeWordCount(answers, additionalNotes)} words`;
      onUpdateAnswers();
    });

    bulletBtn.addEventListener('click', (e) => {
      e.preventDefault();
      editor.focus();
      if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
        document.execCommand('insertUnorderedList', false, null);
      }
      answers[p.id] = editor.innerHTML;
      onUpdateAnswers();
    });

    numberBtn.addEventListener('click', (e) => {
      e.preventDefault();
      editor.focus();
      if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
        document.execCommand('insertOrderedList', false, null);
      }
      answers[p.id] = editor.innerHTML;
      onUpdateAnswers();
    });

    card.appendChild(editor);
    container.appendChild(card);
  });

  // 3. Additional Notes Card
  const notesCard = document.createElement('div');
  notesCard.id = 'journal-notes-card';
  notesCard.className =
    'editorial-card flex flex-col gap-3 p-4 sm:p-5 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';

  const notesHeader = document.createElement('div');
  notesHeader.className = 'flex items-center justify-between';
  notesHeader.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="w-6 h-6 rounded-md bg-[#EFECE6] dark:bg-[#2C2926] text-[#68655F] dark:text-[#A39E93] text-xs font-bold flex items-center justify-center shrink-0">✦</span>
      <h3 class="text-sm font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]">Additional Notes / Free Reflection</h3>
    </div>
    <span class="text-[11px] text-zinc-400">Optional</span>
  `;
  notesCard.appendChild(notesHeader);

  const notesEditor = document.createElement('div');
  notesEditor.id = 'editor-journal-notes';
  notesEditor.setAttribute('contenteditable', 'true');
  notesEditor.setAttribute('role', 'textbox');
  notesEditor.setAttribute('aria-multiline', 'true');
  notesEditor.setAttribute('aria-label', 'Additional Notes');
  notesEditor.className =
    'rich-editor w-full min-h-[90px] p-3 text-base sm:text-sm rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#B56565] focus:bg-white dark:focus:bg-[#161514] transition leading-relaxed outline-none [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-6 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-6 [&_ul]:my-1.5 [&_p]:my-1';
  notesEditor.innerHTML = additionalNotes || '';

  notesEditor.addEventListener('input', () => {
    additionalNotes = notesEditor.innerHTML;
    wordBadge.textContent = `${computeWordCount(answers, additionalNotes)} words`;
    onUpdateAnswers(additionalNotes);
  });

  notesCard.appendChild(notesEditor);
  container.appendChild(notesCard);

  return container;
}

/**
 * Opens "Customize Prompts" Modal.
 */
export function openCustomizePromptsModal({ prompts, onSave, onClose }) {
  const overlay = document.createElement('div');
  overlay.id = 'modal-customize-prompts';
  overlay.className =
    'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150';

  const modal = document.createElement('div');
  modal.className =
    'w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-[#FFFFFF] dark:bg-[#22201E] border border-[#E6E4DF] dark:border-[#33302C] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150';

  // Modal Header
  const mHeader = document.createElement('div');
  mHeader.className =
    'flex items-center justify-between p-5 border-b border-[#E6E4DF] dark:border-[#33302C]';
  mHeader.innerHTML = `
    <div>
      <h3 class="text-base font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]">Customize Prompts</h3>
      <p class="text-xs text-[#68655F] dark:text-[#A39E93]">Reorder, rename, or archive questions</p>
    </div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'btn-close-customize-modal';
  closeBtn.className =
    'w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    onClose?.();
  });
  mHeader.appendChild(closeBtn);
  modal.appendChild(mHeader);

  // Modal Body (List of prompts)
  const mBody = document.createElement('div');
  mBody.id = 'customize-prompts-list';
  mBody.className = 'flex-1 overflow-y-auto p-5 flex flex-col gap-3.5';

  function renderList() {
    mBody.innerHTML = '';
    const active = prompts.filter((p) => !p.archived).sort((a, b) => a.order - b.order);

    active.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className =
        'prompt-row flex items-center gap-2 p-2.5 rounded-xl border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514]';

      const orderBadge = document.createElement('span');
      orderBadge.className =
        'w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0';
      orderBadge.textContent = String(idx + 1);

      const input = document.createElement('input');
      input.type = 'text';
      input.value = p.prompt;
      input.className =
        'prompt-title-input flex-1 text-base sm:text-sm px-3 py-2 rounded-lg bg-white dark:bg-[#22201E] border border-[#E6E4DF] dark:border-[#33302C] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#C86D51]';
      input.addEventListener('change', () => {
        p.prompt = input.value.trim() || p.prompt;
        onSave(prompts);
      });

      // Actions: Up, Down, Archive (meeting 44px touch target)
      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-1 shrink-0';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.disabled = idx === 0;
      upBtn.title = 'Move up';
      upBtn.className =
        'btn-move-up w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 cursor-pointer';
      upBtn.innerHTML = '▲';
      upBtn.addEventListener('click', () => {
        const prev = active[idx - 1];
        const temp = p.order;
        p.order = prev.order;
        prev.order = temp;
        onSave(prompts);
        renderList();
      });

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.disabled = idx === active.length - 1;
      downBtn.title = 'Move down';
      downBtn.className =
        'btn-move-down w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 cursor-pointer';
      downBtn.innerHTML = '▼';
      downBtn.addEventListener('click', () => {
        const next = active[idx + 1];
        const temp = p.order;
        p.order = next.order;
        next.order = temp;
        onSave(prompts);
        renderList();
      });

      const archiveBtn = document.createElement('button');
      archiveBtn.type = 'button';
      archiveBtn.title = 'Archive question';
      archiveBtn.className =
        'btn-archive-prompt btn-delete-prompt w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/60 cursor-pointer';
      archiveBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      `;
      archiveBtn.addEventListener('click', () => {
        p.archived = true;
        onSave(prompts);
        renderList();
      });

      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(archiveBtn);

      row.appendChild(orderBadge);
      row.appendChild(input);
      row.appendChild(actions);
      mBody.appendChild(row);
    });

    // Add new question row
    const addSection = document.createElement('div');
    addSection.className = 'mt-2 pt-3 border-t border-[#E6E4DF] dark:border-[#33302C] flex flex-col gap-2';

    const addLabel = document.createElement('label');
    addLabel.className = 'text-xs font-semibold text-[#68655F] dark:text-[#A39E93]';
    addLabel.textContent = 'Add a new question';

    const addRow = document.createElement('div');
    addRow.className = 'flex items-center gap-2';

    const addInput = document.createElement('input');
    addInput.id = 'input-add-prompt';
    addInput.type = 'text';
    addInput.placeholder = 'e.g. What are you grateful for today?';
    addInput.className =
      'flex-1 text-base sm:text-sm px-3.5 py-2.5 rounded-lg bg-[#F6F5F2] dark:bg-[#161514] border border-[#E6E4DF] dark:border-[#33302C] text-[#1C1B18] dark:text-[#F4F1EA] placeholder-[#68655F] focus:outline-none focus:ring-2 focus:ring-[#C86D51]';

    const addSubmitBtn = document.createElement('button');
    addSubmitBtn.type = 'button';
    addSubmitBtn.id = 'btn-submit-add-prompt';
    addSubmitBtn.className =
      'btn-terracotta min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 tactile-spring';
    addSubmitBtn.textContent = '+ Add Question';
    addSubmitBtn.addEventListener('click', () => {
      const val = (addInput.value || '').trim();
      if (!val) return;
      const newPrompt = {
        id: `jp_${Date.now()}`,
        prompt: val,
        order: prompts.length,
        archived: false,
      };
      prompts.push(newPrompt);
      onSave(prompts);
      addInput.value = '';
      renderList();
    });

    addRow.appendChild(addInput);
    addRow.appendChild(addSubmitBtn);
    addSection.appendChild(addLabel);
    addSection.appendChild(addRow);
    mBody.appendChild(addSection);
  }

  renderList();
  modal.appendChild(mBody);

  // Modal Footer
  const mFooter = document.createElement('div');
  mFooter.className =
    'p-4 border-t border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] flex justify-end';

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.id = 'btn-done-customize-modal';
  doneBtn.className =
    'btn-terracotta min-h-[44px] px-6 py-2 rounded-lg text-xs font-semibold transition cursor-pointer tactile-spring';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => {
    overlay.remove();
    onClose?.();
  });

  mFooter.appendChild(doneBtn);
  modal.appendChild(mFooter);

  overlay.appendChild(modal);
  if (typeof document !== 'undefined' && document.body) {
    document.body.appendChild(overlay);
  }
}
