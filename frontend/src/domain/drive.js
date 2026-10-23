/**
 * Pure domain utilities for Google Drive folder ID parsing and link construction.
 */

/**
 * Extracts a clean Google Drive folder ID from a full URL, partial URL, or raw folder ID string.
 *
 * Examples:
 * - https://drive.google.com/drive/folders/1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC?hl=ID -> 1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC
 * - https://drive.google.com/drive/u/0/folders/1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC -> 1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC
 * - 1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC?hl=ID -> 1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC
 * - 1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC -> 1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC
 *
 * @param {string | null | undefined} input
 * @returns {string} Clean folder ID or empty string if invalid
 */
export function extractDriveFolderId(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // 1. Match full or partial Google Drive folder URL
  const folderUrlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderUrlMatch && folderUrlMatch[1]) {
    return folderUrlMatch[1];
  }

  // 2. Match raw folder ID (may contain query params like ?hl=ID or trailing slash)
  const candidate = trimmed.split('?')[0].split('#')[0].replace(/\/+$/, '').trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(candidate)) {
    return candidate;
  }

  return '';
}

/**
 * Constructs a canonical Google Drive web URL to open the given folder.
 *
 * @param {string | null | undefined} folderId
 * @returns {string} Full URL or empty string if folderId is invalid
 */
export function buildDriveFolderUrl(folderId) {
  const cleanId = extractDriveFolderId(folderId);
  if (!cleanId) return '';
  return `https://drive.google.com/drive/folders/${cleanId}`;
}
