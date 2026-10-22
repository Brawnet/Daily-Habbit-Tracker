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

export const JOURNALING_LOGO_SVG = `
<svg class="w-full h-full" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <g transform="rotate(-7.5 46 51)" stroke-width="3.2">
    <rect x="26" y="22" width="44" height="53" rx="8" />
    <path d="M 27 28 C 17 26 17 33 27 32" />
    <path d="M 27 36 C 17 34 17 41 27 40" />
    <path d="M 27 44 C 17 42 17 49 27 48" />
    <line x1="37" y1="33" x2="60" y2="33" />
  </g>
</svg>
`.trim();

export const LIST_BULLET_SVG = `
<svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 6h.01M4 12h.01M4 18h.01M8 6h12M8 12h12M8 18h12" />
</svg>
`.trim();

export const LIST_NUMBER_SVG = `
<svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 6h1v4m-1 0h2m-2 4h2a1 1 0 011 1v1a1 1 0 01-1 1h-2v2h3M10 6h10M10 12h10M10 18h10" />
</svg>
`.trim();

export const DEFAULT_JOURNAL_PROMPTS = [
  {
    id: 'jp_day',
    prompt: 'How was your day?',
    order: 0,
    archived: false,
  },
  {
    id: 'jp_well',
    prompt: 'What went well today?',
    order: 1,
    archived: false,
  },
  {
    id: 'jp_improve',
    prompt: 'What could be improved?',
    order: 2,
    archived: false,
  },
];

export const SETTINGS_KEY = 'journalPrompts';

/**
 * Loads current prompts from Settings (or defaults).
 * @param {Function} getSettingFn
 * @returns {Promise<Array<{ id: string, prompt: string, order: number, archived: boolean }>>}
 */
export async function loadJournalPrompts(getSettingFn) {
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
  return JSON.parse(JSON.stringify(DEFAULT_JOURNAL_PROMPTS));
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
 * Compiles prompt answers into backward-compatible HTML.
 * Omits blank/skipped prompts.
 */
export function compilePromptJournal(prompts, answers, additionalNotes = '') {
  let out = '';
  const sorted = [...prompts].sort((a, b) => a.order - b.order);
  for (const p of sorted) {
    if (p.archived) continue;
    const rawAns = answers[p.id];
    const ans = (typeof rawAns === 'string' ? rawAns : '').trim();
    const textOnly = ans.replace(/<[^>]*>/g, '').trim();
    if (!textOnly) continue;
    out += `<div class="journal-prompt-block" data-prompt-id="${p.id}">\n`;
    out += `  <h3 class="font-bold text-zinc-900 dark:text-zinc-100">${escapeHtml(p.prompt)}</h3>\n`;
    out += `  <div class="journal-prompt-answer">${ans}</div>\n`;
    out += `</div>\n\n`;
  }
  const cleanNotes = (typeof additionalNotes === 'string' ? additionalNotes : '').trim();
  const notesText = cleanNotes.replace(/<[^>]*>/g, '').trim();
  if (notesText) {
    out += `<div class="journal-notes-block">\n`;
    out += `  <h3 class="font-bold text-zinc-900 dark:text-zinc-100">Additional Notes</h3>\n`;
    out += `  <div class="journal-notes-answer">${cleanNotes}</div>\n`;
    out += `</div>\n`;
  }
  return out.trim();
}

/**
 * Decompiles existing HTML content into prompt answers and additional notes.
 */
export function decompilePromptJournal(htmlContent, prompts) {
  const answers = {};
  let additionalNotes = '';

  if (!htmlContent || typeof htmlContent !== 'string') {
    return { answers, additionalNotes };
  }

  // Regex parser: robust in both Node.js (without DOM parser) and browser
  const promptBlockRegex = /<div\s+[^>]*class="[^"]*journal-prompt-block[^"]*"[^>]*data-prompt-id="([^"]+)"[^>]*>[\s\S]*?<div\s+[^>]*class="[^"]*journal-prompt-answer[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;
  let foundAny = false;
  while ((match = promptBlockRegex.exec(htmlContent)) !== null) {
    foundAny = true;
    const promptId = match[1];
    const answerContent = match[2].trim();
    answers[promptId] = answerContent;
  }

  const notesBlockRegex = /<div\s+[^>]*class="[^"]*journal-notes-block[^"]*"[^>]*>[\s\S]*?<div\s+[^>]*class="[^"]*journal-notes-answer[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;
  const notesMatch = notesBlockRegex.exec(htmlContent);
  if (notesMatch) {
    additionalNotes = notesMatch[1].trim();
    foundAny = true;
  }

  if (foundAny) {
    return { answers, additionalNotes };
  }

  // Fallback: If legacy freeform journal content exists, put into additional notes
  additionalNotes = htmlContent;
  return { answers, additionalNotes };
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function computeWordCount(answers, notes) {
  let combined = '';
  for (const key of Object.keys(answers || {})) {
    combined += ' ' + (answers[key] || '');
  }
  combined += ' ' + (notes || '');
  const textOnly = combined.replace(/<[^>]*>/g, ' ').trim();
  return textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0;
}

export function hasNonEmptyJournalAnswers(answers, notes) {
  for (const key of Object.keys(answers || {})) {
    const val = (answers[key] || '').replace(/<[^>]*>/g, ' ').trim();
    if (val) return true;
  }
  const cleanNotes = (notes || '').replace(/<[^>]*>/g, ' ').trim();
  return Boolean(cleanNotes);
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
    'flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 gap-2';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.id = 'btn-back-from-journal-to-activities';
  backBtn.className =
    'min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer';
  backBtn.innerHTML = `${CHEVRON_LEFT_SVG} <span>Back to Activities</span>`;
  backBtn.addEventListener('click', onBack);

  const rightActions = document.createElement('div');
  rightActions.className = 'flex items-center gap-2';

  const wordBadge = document.createElement('span');
  wordBadge.id = 'journal-total-words';
  wordBadge.className = 'font-mono text-xs text-zinc-500 dark:text-zinc-400 px-2';
  wordBadge.textContent = `${computeWordCount(answers, additionalNotes)} words`;

  const statusBadge = document.createElement('span');
  statusBadge.id = 'journal-status';
  statusBadge.className =
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80';
  statusBadge.textContent = status || 'Saved';

  const customizeBtn = document.createElement('button');
  customizeBtn.type = 'button';
  customizeBtn.id = 'btn-customize-prompts';
  customizeBtn.className =
    'min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 active:scale-95 transition cursor-pointer';
  customizeBtn.innerHTML = `
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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

  // 2. Banner
  const banner = document.createElement('div');
  banner.className =
    'flex items-center justify-between p-4 rounded-2xl bg-linear-to-r from-indigo-50/80 via-white to-purple-50/80 dark:from-zinc-900 dark:via-zinc-900/80 dark:to-zinc-800/80 border border-indigo-100/80 dark:border-zinc-800 shadow-xs';
  banner.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center p-2 shadow-xs shrink-0">
        ${JOURNALING_LOGO_SVG}
      </div>
      <div>
        <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Daily Guided Reflection</h2>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">Answer prompts to capture today's growth</p>
      </div>
    </div>
  `;
  container.appendChild(banner);

  // 3. Question Prompt Cards
  const activePrompts = [...prompts]
    .filter((p) => !p.archived)
    .sort((a, b) => a.order - b.order);

  activePrompts.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className =
      'flex flex-col gap-3 p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition';

    // Card Header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'flex items-center justify-between gap-2';

    const promptTitleWrap = document.createElement('div');
    promptTitleWrap.className = 'flex items-center gap-2.5';

    const numBadge = document.createElement('span');
    numBadge.className =
      'w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0';
    numBadge.textContent = String(idx + 1);

    const questionTitle = document.createElement('h3');
    questionTitle.className =
      'text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug';
    questionTitle.textContent = p.prompt;

    promptTitleWrap.appendChild(numBadge);
    promptTitleWrap.appendChild(questionTitle);

    // Card Toolbar (bullets / numbers)
    const toolbar = document.createElement('div');
    toolbar.className = 'flex items-center gap-1.5';

    const bulletBtn = document.createElement('button');
    bulletBtn.type = 'button';
    bulletBtn.id = idx === 0 ? 'btn-journal-bullet' : `btn-journal-bullet-${idx}`;
    bulletBtn.title = 'Bullet list';
    bulletBtn.className =
      'min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition cursor-pointer inline-flex items-center gap-1 active:scale-95';
    bulletBtn.innerHTML = `${LIST_BULLET_SVG} <span class="hidden sm:inline">Bullet</span>`;

    const numberBtn = document.createElement('button');
    numberBtn.type = 'button';
    numberBtn.id = idx === 0 ? 'btn-journal-number' : `btn-journal-number-${idx}`;
    numberBtn.title = 'Numbered list';
    numberBtn.className =
      'min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition cursor-pointer inline-flex items-center gap-1 active:scale-95';
    numberBtn.innerHTML = `${LIST_NUMBER_SVG} <span class="hidden sm:inline">Numbered</span>`;

    toolbar.appendChild(bulletBtn);
    toolbar.appendChild(numberBtn);
    cardHeader.appendChild(promptTitleWrap);
    cardHeader.appendChild(toolbar);
    card.appendChild(cardHeader);

    // Editor Area
    const editor = document.createElement('div');
    editor.id = idx === 0 ? 'editor-journal-content' : `editor-journal-content-${idx}`;
    editor.setAttribute('contenteditable', 'true');
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', p.prompt);
    editor.className =
      'rich-editor w-full min-h-[96px] p-3 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-zinc-800 transition leading-relaxed outline-none [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-6 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-6 [&_ul]:my-1.5 [&_p]:my-1';
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

  // 4. Additional Notes Card
  const notesCard = document.createElement('div');
  notesCard.id = 'journal-notes-card';
  notesCard.className =
    'flex flex-col gap-3 p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 shadow-xs';

  const notesHeader = document.createElement('div');
  notesHeader.className = 'flex items-center justify-between';
  notesHeader.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-bold flex items-center justify-center shrink-0">✦</span>
      <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Additional Notes / Free Reflection</h3>
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
    'rich-editor w-full min-h-[90px] p-3 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-zinc-800 transition leading-relaxed outline-none [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-6 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-6 [&_ul]:my-1.5 [&_p]:my-1';
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
    'w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150';

  // Modal Header
  const mHeader = document.createElement('div');
  mHeader.className =
    'flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800';
  mHeader.innerHTML = `
    <div>
      <h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100">Customize Prompts</h3>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">Reorder, rename, or archive questions</p>
    </div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'btn-close-customize-modal';
  closeBtn.className =
    'w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer';
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
        'prompt-row flex items-center gap-2 p-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40';

      const orderBadge = document.createElement('span');
      orderBadge.className =
        'w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0';
      orderBadge.textContent = String(idx + 1);

      const input = document.createElement('input');
      input.type = 'text';
      input.value = p.prompt;
      input.className =
        'prompt-title-input flex-1 text-xs px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
      input.addEventListener('change', () => {
        p.prompt = input.value.trim() || p.prompt;
        onSave(prompts);
      });

      // Actions: Up, Down, Delete
      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-1 shrink-0';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.disabled = idx === 0;
      upBtn.title = 'Move up';
      upBtn.className =
        'btn-move-up w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 cursor-pointer';
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
        'btn-move-down w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 cursor-pointer';
      downBtn.innerHTML = '▼';
      downBtn.addEventListener('click', () => {
        const next = active[idx + 1];
        const temp = p.order;
        p.order = next.order;
        next.order = temp;
        onSave(prompts);
        renderList();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.title = 'Delete question';
      deleteBtn.className =
        'btn-delete-prompt w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/60 cursor-pointer';
      deleteBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      `;
      deleteBtn.addEventListener('click', () => {
        p.archived = true;
        onSave(prompts);
        renderList();
      });

      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(orderBadge);
      row.appendChild(input);
      row.appendChild(actions);
      mBody.appendChild(row);
    });

    // Add new question row
    const addSection = document.createElement('div');
    addSection.className = 'mt-2 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-2';

    const addLabel = document.createElement('label');
    addLabel.className = 'text-xs font-semibold text-zinc-600 dark:text-zinc-400';
    addLabel.textContent = 'Add a new question';

    const addRow = document.createElement('div');
    addRow.className = 'flex items-center gap-2';

    const addInput = document.createElement('input');
    addInput.id = 'input-add-prompt';
    addInput.type = 'text';
    addInput.placeholder = 'e.g. What are you grateful for today?';
    addInput.className =
      'flex-1 text-xs px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';

    const addSubmitBtn = document.createElement('button');
    addSubmitBtn.type = 'button';
    addSubmitBtn.id = 'btn-submit-add-prompt';
    addSubmitBtn.className =
      'min-h-[38px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer shrink-0';
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
    'p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-end';

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.id = 'btn-done-customize-modal';
  doneBtn.className =
    'min-h-[44px] px-6 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 active:scale-95 transition cursor-pointer';
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
