/**
 * journal.js — Pure domain logic for Daily Journal prompt compilation,
 * decompilation, sanitization, and word count calculation.
 */

export const JOURNAL_SUBVIEW = 'journal';
export const SETTINGS_KEY = 'journalPrompts';

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

/**
 * Escapes unsafe HTML characters.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strips dangerous HTML tags (scripts, objects, embeds, iframes) and inline event handlers.
 * Allows safe formatting tags: p, br, ul, ol, li, b, strong, i, em.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeJournalHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^>\s]+/gi, '');
}

/**
 * Compiles prompt answers into structured HTML blocks.
 * Omits blank/skipped prompts, but preserves answered archived prompts.
 * @param {Array<{ id: string, prompt: string, order: number, archived: boolean }>} prompts
 * @param {Record<string, string>} answers
 * @param {string} [additionalNotes='']
 * @returns {string}
 */
export function compilePromptJournal(prompts, answers, additionalNotes = '') {
  let out = '';
  const sorted = [...(prompts || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const p of sorted) {
    const rawAns = answers?.[p.id];
    const cleanAns = sanitizeJournalHtml(typeof rawAns === 'string' ? rawAns : '').trim();
    const textOnly = cleanAns.replace(/<[^>]*>/g, '').trim();
    if (!textOnly) continue;

    out += `<div class="journal-prompt-block" data-prompt-id="${p.id}">\n`;
    out += `  <h3 class="font-bold text-zinc-900 dark:text-zinc-100">${escapeHtml(p.prompt)}</h3>\n`;
    out += `  <div class="journal-prompt-answer">${cleanAns}</div>\n`;
    out += `</div>\n\n`;
  }

  const cleanNotes = sanitizeJournalHtml(typeof additionalNotes === 'string' ? additionalNotes : '').trim();
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
 * Parses structured journal HTML into an array of sections with title and HTML/text content.
 * Used for History reader view and export rendering.
 * @param {string} htmlContent
 * @returns {Array<{ type: 'prompt' | 'notes' | 'freeform', id?: string, title: string, contentHtml: string }>}
 */
export function parseStructuredJournalBlocks(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return [];
  }

  const sections = [];

  // Match prompt blocks
  const promptBlockRegex = /<div\s+[^>]*class="[^"]*journal-prompt-block[^"]*"[^>]*data-prompt-id="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*(?=<div\s+[^>]*class="[^"]*journal-(?:prompt|notes)-block"|$)/gi;
  let match;
  let foundAny = false;

  while ((match = promptBlockRegex.exec(htmlContent)) !== null) {
    foundAny = true;
    const promptId = match[1];
    const inner = match[2];

    const h3Match = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(inner);
    const ansMatch = /<div\s+[^>]*class="[^"]*journal-prompt-answer[^"]*"[^>]*>([\s\S]*?)<\/div>\s*$/i.exec(inner.trim());

    const title = h3Match ? h3Match[1].replace(/<[^>]*>/g, '').trim() : 'Prompt';
    const contentHtml = ansMatch ? ansMatch[1].trim() : '';

    if (contentHtml) {
      sections.push({
        type: 'prompt',
        id: promptId,
        title,
        contentHtml,
      });
    }
  }

  // Match notes block
  const notesBlockRegex = /<div\s+[^>]*class="[^"]*journal-notes-block[^"]*"[^>]*>([\s\S]*?)<\/div>\s*$/i;
  const notesMatch = notesBlockRegex.exec(htmlContent);
  if (notesMatch) {
    foundAny = true;
    const inner = notesMatch[1];
    const h3Match = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(inner);
    const ansMatch = /<div\s+[^>]*class="[^"]*journal-notes-answer[^"]*"[^>]*>([\s\S]*?)<\/div>\s*$/i.exec(inner.trim());

    const title = h3Match ? h3Match[1].replace(/<[^>]*>/g, '').trim() : 'Additional Notes';
    const contentHtml = ansMatch ? ansMatch[1].trim() : '';

    if (contentHtml) {
      sections.push({
        type: 'notes',
        title,
        contentHtml,
      });
    }
  }

  if (foundAny) {
    return sections;
  }

  // Fallback for legacy freeform entry
  return [
    {
      type: 'freeform',
      title: 'Daily Reflection',
      contentHtml: htmlContent.trim(),
    },
  ];
}

/**
 * Decompiles existing HTML content into prompt answers and additional notes.
 * @param {string} htmlContent
 * @param {Array} [prompts]
 * @returns {{ answers: Record<string, string>, additionalNotes: string }}
 */
export function decompilePromptJournal(htmlContent, prompts) {
  const answers = {};
  let additionalNotes = '';

  if (!htmlContent || typeof htmlContent !== 'string') {
    return { answers, additionalNotes };
  }

  // Use DOMParser if available in browser
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      const blocks = doc.querySelectorAll('.journal-prompt-block');
      if (blocks.length > 0) {
        for (const block of blocks) {
          const id = block.getAttribute('data-prompt-id');
          const ansEl = block.querySelector('.journal-prompt-answer');
          if (id && ansEl) {
            answers[id] = ansEl.innerHTML.trim();
          }
        }
        const notesEl = doc.querySelector('.journal-notes-block .journal-notes-answer');
        if (notesEl) {
          additionalNotes = notesEl.innerHTML.trim();
        }
        return { answers, additionalNotes };
      }
    } catch {}
  }

  // Regex fallback
  const parsedSections = parseStructuredJournalBlocks(htmlContent);
  if (parsedSections.length > 0 && parsedSections[0].type !== 'freeform') {
    for (const sec of parsedSections) {
      if (sec.type === 'prompt' && sec.id) {
        answers[sec.id] = sec.contentHtml;
      } else if (sec.type === 'notes') {
        additionalNotes = sec.contentHtml;
      }
    }
    return { answers, additionalNotes };
  }

  // Legacy fallback
  additionalNotes = htmlContent;
  return { answers, additionalNotes };
}

/**
 * Computes total word count across all prompt answers and additional notes.
 * @param {Record<string, string>} answers
 * @param {string} [notes]
 * @returns {number}
 */
export function computeWordCount(answers, notes) {
  let combined = '';
  for (const key of Object.keys(answers || {})) {
    combined += ' ' + (answers[key] || '');
  }
  combined += ' ' + (notes || '');
  const textOnly = combined.replace(/<[^>]*>/g, ' ').trim();
  return textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Checks whether any prompt answer or notes has meaningful content.
 * @param {Record<string, string>} answers
 * @param {string} [notes]
 * @returns {boolean}
 */
export function hasNonEmptyJournalAnswers(answers, notes) {
  for (const key of Object.keys(answers || {})) {
    const val = (answers[key] || '').replace(/<[^>]*>/g, ' ').trim();
    if (val) return true;
  }
  const cleanNotes = (notes || '').replace(/<[^>]*>/g, ' ').trim();
  return Boolean(cleanNotes);
}
