/**
 * journal.js — Pure domain logic for Daily Journal prompt compilation,
 * decompilation, sanitization, title normalization, and word count calculation.
 */

import { isBlank } from './text.js';
import { formatLong, formatShort } from './day.js';

export const JOURNAL_SUBVIEW = 'journal';
export const SETTINGS_KEY = 'journalPrompts';
export const JOURNAL_TITLE_MAX_LENGTH = 120;

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
 * Strips dangerous HTML tags (scripts, objects, embeds, iframes, svg, math) and inline event handlers.
 * Allows safe formatting tags: p, br, ul, ol, li, b, strong, i, em, span, div.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeJournalHtml(html) {
  if (!html) return '';
  let clean = String(html);

  // 1. Strip dangerous tag blocks
  clean = clean.replace(/<(?:script|style|iframe|object|embed|svg|math|applet|form)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|svg|math|applet|form)>/gi, '');
  clean = clean.replace(/<\/?(?:script|style|iframe|object|embed|svg|math|applet|form|base|meta|link)\b[^>]*>/gi, '');

  // 2. Strip event handlers (with whitespace or slash delimiter: <img/src=x/onerror=...>)
  clean = clean.replace(/(?:\s|\/)+on[a-zA-Z0-9_-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');

  // 3. Strip dangerous style attributes
  clean = clean.replace(/(?:\s|\/)+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 4. Strip javascript:, vbscript:, and data: URLs in attributes
  clean = clean.replace(/\b(?:href|src|action|formaction)\s*=\s*(?:"\s*(?:javascript|vbscript|data:)[^"]*"|'\s*(?:javascript|vbscript|data:)[^']*'|[^\s>]*(?:javascript|vbscript|data:)[^\s>]*)/gi, '');

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${clean}</body>`, 'text/html');
      const ALLOWED_TAGS = new Set([
        'P', 'BR', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'SPAN', 'DIV',
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'A'
      ]);
      const ALLOWED_ATTRS = new Set(['class', 'id', 'title', 'alt', 'data-prompt-id']);

      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
      const toRemove = [];
      let node = walker.nextNode();
      while (node) {
        if (!ALLOWED_TAGS.has(node.tagName)) {
          toRemove.push(node);
        } else {
          const attrs = Array.from(node.attributes);
          for (const attr of attrs) {
            const name = attr.name.toLowerCase();
            const val = attr.value.trim().toLowerCase();
            if (name.startsWith('on') || name === 'style' || val.includes('javascript:') || val.includes('vbscript:') || val.includes('data:')) {
              node.removeAttribute(attr.name);
            } else if (node.tagName === 'A' && name === 'href') {
              if (!/^(?:https?:|mailto:|\/|#|\.)/i.test(attr.value.trim())) {
                node.removeAttribute(attr.name);
              }
            } else if (!ALLOWED_ATTRS.has(name) && !name.startsWith('data-')) {
              node.removeAttribute(attr.name);
            }
          }
        }
        node = walker.nextNode();
      }
      for (const el of toRemove) {
        el.remove();
      }
      return doc.body.innerHTML;
    } catch {
      // Fallback to regex-cleaned string
    }
  }

  return clean;
}

/**
 * Compiles prompt answers into structured HTML blocks.
 * Omits blank/skipped prompts, but preserves answered archived prompts.
 * @param {Array<{ id: string, prompt: string, order: number, archived: boolean }>} prompts
 * @param {Record<string, string>} answers
 * @returns {string}
 */
export function compilePromptJournal(prompts, answers) {
  let out = '';
  const sorted = [...(prompts || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const p of sorted) {
    const rawAns = answers?.[p.id];
    const cleanAns = sanitizeJournalHtml(typeof rawAns === 'string' ? rawAns : '').trim();
    const textOnly = cleanAns.replace(/<[^>]*>/g, '').trim();
    if (!textOnly) continue;

    out += `<div class="journal-prompt-block" data-prompt-id="${escapeHtml(p.id)}">\n`;
    out += `  <h3 class="font-bold text-zinc-900 dark:text-zinc-100">${escapeHtml(p.prompt)}</h3>\n`;
    out += `  <div class="journal-prompt-answer">${cleanAns}</div>\n`;
    out += `</div>\n\n`;
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
 * Decompiles existing HTML content into prompt answers.
 * @param {string} htmlContent
 * @returns {{ answers: Record<string, string> }}
 */
export function decompilePromptJournal(htmlContent) {
  const answers = {};

  if (!htmlContent || typeof htmlContent !== 'string') {
    return { answers };
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
            answers[id] = sanitizeJournalHtml(ansEl.innerHTML.trim());
          }
        }
        return { answers };
      }
    } catch {}
  }

  // Regex fallback
  const parsedSections = parseStructuredJournalBlocks(htmlContent);
  if (parsedSections.length > 0 && parsedSections[0].type !== 'freeform') {
    for (const sec of parsedSections) {
      if (sec.type === 'prompt' && sec.id) {
        answers[sec.id] = sanitizeJournalHtml(sec.contentHtml);
      }
    }
  }

  return { answers };
}

/**
 * Computes total word count across all prompt answers.
 * @param {Record<string, string>} answers
 * @returns {number}
 */
export function computeWordCount(answers) {
  let combined = '';
  for (const key of Object.keys(answers || {})) {
    combined += ' ' + (answers[key] || '');
  }
  const textOnly = combined.replace(/<[^>]*>/g, ' ').trim();
  return textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Checks whether any prompt answer has meaningful content.
 * @param {Record<string, string>} answers
 * @returns {boolean}
 */
export function hasNonEmptyJournalAnswers(answers) {
  for (const key of Object.keys(answers || {})) {
    const val = (answers[key] || '').replace(/<[^>]*>/g, ' ').trim();
    if (val) return true;
  }
  return false;
}

/**
 * Normalizes an optional Journal Entry title: single-line, trimmed, max 120 characters.
 * @param {string | null | undefined} title
 * @returns {string}
 */
export function normalizeJournalTitle(title) {
  if (title === null || title === undefined) return '';
  return String(title)
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, JOURNAL_TITLE_MAX_LENGTH)
    .trim();
}

/**
 * Checks whether a Journal Entry counts as written (non-blank title or non-blank content).
 * @param {{ title?: string, content?: string } | null | undefined} entry
 * @returns {boolean}
 */
export function isJournalEntryWritten(entry) {
  if (!entry) return false;
  return normalizeJournalTitle(entry.title) !== '' || !isBlank(entry.content);
}

/**
 * Resolves headline and secondary Day subtitle with dynamic Day fallback when title is blank.
 * @param {{ day: string, title?: string }} entry
 * @param {'long' | 'short'} [dayStyle='long']
 * @returns {{ headline: string, daySubtitle: string | null, hasCustomTitle: boolean }}
 */
export function resolveJournalDisplayHeader(entry, dayStyle = 'long') {
  const formattedDay = dayStyle === 'short' ? formatShort(entry.day) : formatLong(entry.day);
  const customTitle = normalizeJournalTitle(entry?.title);
  if (customTitle) {
    return { headline: customTitle, daySubtitle: formattedDay, hasCustomTitle: true };
  }
  return { headline: formattedDay, daySubtitle: null, hasCustomTitle: false };
}
