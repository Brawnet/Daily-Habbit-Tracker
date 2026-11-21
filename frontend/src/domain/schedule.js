/**
 * Scheduled Time domain helpers for Habits.
 * Canonical format is 24-hour 'HH:MM' in local Device wall-clock time, or '' for Anytime.
 */

export const SCHEDULED_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Checks whether a value is a valid canonical 24-hour 'HH:MM' Scheduled Time.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidScheduledTime(value) {
  return typeof value === 'string' && SCHEDULED_TIME_REGEX.test(value);
}

/**
 * Normalizes a candidate Scheduled Time value into canonical 'HH:MM' or '' when blank/invalid.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeScheduledTime(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return SCHEDULED_TIME_REGEX.test(trimmed) ? trimmed : '';
}

/**
 * Returns true if the given Habit has a valid Scheduled Time.
 *
 * @param {{ scheduledTime?: unknown } | null | undefined} habit
 * @returns {boolean}
 */
export function hasScheduledTime(habit) {
  return Boolean(habit && isValidScheduledTime(normalizeScheduledTime(habit.scheduledTime)));
}

/**
 * Formats a canonical 'HH:MM' Scheduled Time in the Device locale (or explicit locale).
 * Returns '' for blank or invalid times.
 *
 * @param {unknown} scheduledTime
 * @param {string | string[] | undefined} [locale]
 * @returns {string}
 */
export function formatScheduledTime(scheduledTime, locale = undefined) {
  const normalized = normalizeScheduledTime(scheduledTime);
  if (!normalized) return '';
  const [hoursStr, minutesStr] = normalized.split(':');
  const date = new Date(2000, 0, 1, Number(hoursStr), Number(minutesStr), 0, 0);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Deterministic comparator by sortOrder ascending, then createdAt, then id.
 *
 * @param {import('../shared/contracts.js').Habit} a
 * @param {import('../shared/contracts.js').Habit} b
 * @returns {number}
 */
function compareSortOrderTieBreak(a, b) {
  const orderDiff = (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0);
  if (orderDiff !== 0) return orderDiff;
  const createdA = String(a?.createdAt || '');
  const createdB = String(b?.createdAt || '');
  const createdDiff = createdA.localeCompare(createdB);
  if (createdDiff !== 0) return createdDiff;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

/**
 * Partitions Habits into chronological Scheduled Habits (00:00 -> 23:59, ties by sortOrder)
 * followed by Anytime Habits sorted by sortOrder. Does not mutate the input array.
 *
 * @param {Array<import('../shared/contracts.js').Habit> | null | undefined} habits
 * @returns {{ scheduled: Array<import('../shared/contracts.js').Habit>, anytime: Array<import('../shared/contracts.js').Habit>, all: Array<import('../shared/contracts.js').Habit> }}
 */
export function partitionAndSortHabits(habits) {
  if (!Array.isArray(habits) || habits.length === 0) {
    return { scheduled: [], anytime: [], all: [] };
  }

  const scheduled = [];
  const anytime = [];

  for (const habit of habits) {
    if (!habit) continue;
    if (hasScheduledTime(habit)) {
      scheduled.push(habit);
    } else {
      anytime.push(habit);
    }
  }

  scheduled.sort((a, b) => {
    const timeA = normalizeScheduledTime(a.scheduledTime);
    const timeB = normalizeScheduledTime(b.scheduledTime);
    if (timeA !== timeB) {
      return timeA < timeB ? -1 : 1;
    }
    return compareSortOrderTieBreak(a, b);
  });

  anytime.sort(compareSortOrderTieBreak);

  return {
    scheduled,
    anytime,
    all: [...scheduled, ...anytime],
  };
}
