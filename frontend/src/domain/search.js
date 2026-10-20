/**
 * Search domain logic (SPEC §1, §10, §11)
 * Offline, case- and diacritic-insensitive search for journal entries.
 */
import { compareDays } from './day.js';

/**
 * Strips diacritics and converts to lower case.
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Returns whether a query token matches the date representations for a given day.
 * Representations include:
 * - 'YYYY-MM-DD' (e.g. 2026-10-20)
 * - short date: '20 oct 2026'
 * - long date: '20 october 2026'
 * - weekday: 'tuesday'
 * - month year: 'oct 2026'
 *
 * @param {string} day - 'YYYY-MM-DD'
 * @param {string} token - Normalized query token
 * @returns {boolean}
 */
function matchDateToken(day, token) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const dayNum = String(date.getDate());
  const dayPad = String(date.getDate()).padStart(2, '0');
  const shortMonth = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  const longMonth = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const shortWeekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  const year = String(date.getFullYear());

  if (token.includes('-')) {
    if (day === token || day.startsWith(token) || day.endsWith(token)) return true;
  }

  if (dayNum === token || dayPad === token) return true;
  if (shortMonth === token || longMonth === token || (token.length >= 3 && longMonth.startsWith(token))) return true;
  if (year === token) return true;
  if (weekday === token || shortWeekday === token || (token.length >= 3 && weekday.startsWith(token))) return true;

  return false;
}

/**
 * Finds highlight ranges [start, end] in original content matching tokens.
 * Handles diacritics, case insensitivity, and emoji/unicode characters.
 *
 * @param {string} content
 * @param {Array<string>} tokens - Normalized tokens
 * @returns {Array<[number, number]>}
 */
function findHighlights(content, tokens) {
  if (!content || !tokens.length) return [];

  const normChars = [];
  const origIndices = [];

  let i = 0;
  for (const ch of content) {
    const charLen = ch.length;
    const n = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (n.length === 0) {
      // Combining mark attached to previous character
    } else {
      for (let k = 0; k < n.length; k++) {
        normChars.push(n[k]);
        origIndices.push(i);
      }
    }
    i += charLen;
  }
  const normContent = normChars.join('');

  const rawRanges = [];
  const uniqueTokens = Array.from(new Set(tokens));

  for (const token of uniqueTokens) {
    const normToken = normalize(token);
    if (!normToken) continue;

    let pos = 0;
    while ((pos = normContent.indexOf(normToken, pos)) !== -1) {
      const normStart = pos;
      const normEnd = pos + normToken.length - 1;
      const origStart = origIndices[normStart];
      let origEnd = origIndices[normEnd] + 1;
      while (origEnd < content.length && /[\u0300-\u036f]/.test(content[origEnd].normalize('NFD'))) {
        origEnd++;
      }
      rawRanges.push([origStart, origEnd]);
      pos += 1;
    }
  }

  rawRanges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const r of rawRanges) {
    if (!merged.length) {
      merged.push(r);
    } else {
      const last = merged[merged.length - 1];
      if (r[0] <= last[1]) {
        last[1] = Math.max(last[1], r[1]);
      } else {
        merged.push(r);
      }
    }
  }

  return merged;
}

/**
 * Search journal entries offline, case- and diacritic-insensitive.
 * All whitespace-delimited tokens in query must match (AND) against content
 * or date representations.
 *
 * @param {Array<{ day: string, content: string }>} entries
 * @param {string} query
 * @returns {Array<{ entry: { day: string, content: string }, highlights: Array<[number, number]> }>}
 */
export function searchEntries(entries, query) {
  if (!entries || !Array.isArray(entries)) return [];

  const trimmed = (query || '').trim();
  if (!trimmed) {
    return [...entries]
      .sort((a, b) => compareDays(b.day, a.day))
      .map(entry => ({ entry, highlights: [] }));
  }

  const rawTokens = trimmed.split(/\s+/).filter(Boolean);
  const normTokens = rawTokens.map(normalize).filter(Boolean);
  if (normTokens.length === 0) {
    return [...entries]
      .sort((a, b) => compareDays(b.day, a.day))
      .map(entry => ({ entry, highlights: [] }));
  }

  const results = [];

  for (const entry of entries) {
    const content = entry.content || '';
    const normContent = normalize(content);

    let allMatch = true;
    for (const token of normTokens) {
      const matchInContent = normContent.includes(token);
      const matchInDate = matchDateToken(entry.day, token);

      if (!matchInContent && !matchInDate) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      const highlights = findHighlights(content, normTokens);
      results.push({ entry, highlights });
    }
  }

  results.sort((a, b) => compareDays(b.entry.day, a.entry.day));
  return results;
}
