/**
 * Day domain logic (SPEC §1)
 * All operations are in local time. Never use toISOString() which produces UTC.
 */

/**
 * @param {Date | string | number} date
 * @returns {string} 'YYYY-MM-DD' (local date)
 */
export function toDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * @returns {string} 'YYYY-MM-DD'
 */
export function today() {
  return toDay(new Date());
}

/**
 * @param {string} day - 'YYYY-MM-DD'
 * @param {number} n
 * @returns {string}
 */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + n, 12, 0, 0);
  return toDay(date);
}

/**
 * @param {string} a - 'YYYY-MM-DD'
 * @param {string} b - 'YYYY-MM-DD'
 * @returns {-1 | 0 | 1}
 */
export function compareDays(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Check-in is only editable on today and yesterday (SPEC §1)
 * @param {string} day - 'YYYY-MM-DD'
 * @param {string} todayDay - 'YYYY-MM-DD'
 * @returns {boolean}
 */
export function isCheckInEditable(day, todayDay) {
  return day === todayDay || day === addDays(todayDay, -1);
}

/**
 * Journal is only editable on today (SPEC §1)
 * @param {string} day - 'YYYY-MM-DD'
 * @param {string} todayDay - 'YYYY-MM-DD'
 * @returns {boolean}
 */
export function isJournalEditable(day, todayDay) {
  return day === todayDay;
}

/**
 * @param {string} day - 'YYYY-MM-DD'
 * @returns {string} e.g. 'Tuesday, 20 October 2026'
 */
export function formatLong(day) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${date.getDate()} ${month} ${date.getFullYear()}`;
}

/**
 * @param {string} day - 'YYYY-MM-DD'
 * @returns {string} e.g. 'Tue, 20 Oct 2026'
 */
export function formatShort(day) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${date.getDate()} ${month} ${date.getFullYear()}`;
}

/**
 * @param {Date} [now]
 * @returns {number} ms until next midnight local
 */
export function msUntilNextDay(now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  const nextMidnight = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() + 1,
    0, 0, 0, 0
  );
  return Math.max(0, nextMidnight.getTime() - current.getTime());
}
