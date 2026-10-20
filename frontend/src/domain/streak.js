/**
 * Streak domain calculations (SPEC §1, §11)
 */
import { addDays } from './day.js';

/**
 * @param {Iterable<string>} days - Only non-deleted check-in days
 * @param {string} todayDay - 'YYYY-MM-DD'
 * @returns {number}
 */
export function currentStreak(days, todayDay) {
  const daySet = days instanceof Set ? days : new Set(days);
  let current = daySet.has(todayDay) ? todayDay : addDays(todayDay, -1);
  let streak = 0;
  while (daySet.has(current)) {
    streak++;
    current = addDays(current, -1);
  }
  return streak;
}

/**
 * @param {Iterable<string>} days - Only non-deleted check-in days
 * @returns {number}
 */
export function longestStreak(days) {
  const uniqueDays = Array.from(new Set(days));
  if (uniqueDays.length === 0) return 0;
  uniqueDays.sort();

  let longest = 1;
  let current = 1;

  for (let i = 1; i < uniqueDays.length; i++) {
    if (uniqueDays[i] === addDays(uniqueDays[i - 1], 1)) {
      current++;
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 1;
    }
  }

  return longest;
}
