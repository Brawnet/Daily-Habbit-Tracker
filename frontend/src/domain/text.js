/**
 * Text and HTML conversion domain utilities.
 * Handles plain-text conversion, whitespace normalization, and markdown-style list formatting.
 */

/**
 * Checks if a string or HTML markup is blank (empty, undefined, or containing only whitespace/empty tags).
 *
 * @param {string | null | undefined} str
 * @returns {boolean}
 */
export function isBlank(str) {
  if (str === null || str === undefined) return true;
  return String(str).replace(/<[^>]*>/g, ' ').trim() === '';
}

/**
 * Strips all HTML tags and collapses whitespace, returning pure plain text.
 *
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\/p>|<\/li>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Converts rich HTML markup into clean, readable plain text with markdown-style list formatting
 * (e.g. "• item" for unordered lists, "1. item" for ordered lists, and clean paragraph breaks).
 *
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function htmlToMarkdownText(html) {
  if (!html) return '';
  const str = String(html);
  if (!str.includes('<') || !str.includes('>')) {
    return str.trim();
  }

  // 1. Process ordered lists: <ol><li>Item 1</li><li>Item 2</li></ol>
  let text = str.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    const items = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = liRegex.exec(content)) !== null) {
      const clean = match[1].replace(/<[^>]*>/g, ' ').trim();
      if (clean) items.push(clean);
    }
    return '\n' + items.map((it, idx) => `${idx + 1}. ${it}`).join('\n') + '\n\n';
  });

  // 2. Process unordered lists: <ul><li>Item 1</li><li>Item 2</li></ul>
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    const items = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = liRegex.exec(content)) !== null) {
      const clean = match[1].replace(/<[^>]*>/g, ' ').trim();
      if (clean) items.push(clean);
    }
    return '\n' + items.map((it) => `• ${it}`).join('\n') + '\n\n';
  });

  // 3. Process line breaks and block elements
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // 4. Normalize lines and collapse consecutive empty lines
  const lines = text.split('\n').map((l) => l.trim());
  const collapsed = [];
  let prevBlank = false;
  for (const line of lines) {
    if (!line) {
      if (!prevBlank) {
        collapsed.append ? collapsed.append('') : collapsed.push('');
        prevBlank = true;
      }
    } else {
      collapsed.push(line);
      prevBlank = false;
    }
  }

  return collapsed.join('\n').trim();
}
