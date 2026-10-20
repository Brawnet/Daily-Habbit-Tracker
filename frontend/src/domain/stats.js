/**
 * Stats domain calculations (SPEC §1, §10, §11)
 */
import { addDays, compareDays, isCheckInEditable } from './day.js';

/**
 * @param {Iterable<string>} days - Non-deleted check-in days
 * @param {{ todayDay: string, createdDay: string, windowDays?: number }} options
 * @returns {number} 0..1
 */
export function completionRate(days, { todayDay, createdDay, windowDays = 30 }) {
  const windowStart = addDays(todayDay, -(windowDays - 1));
  const effectiveStart = compareDays(windowStart, createdDay) > 0 ? windowStart : createdDay;

  if (compareDays(effectiveStart, todayDay) > 0) {
    return 0;
  }

  const [y1, m1, d1] = effectiveStart.split('-').map(Number);
  const [y2, m2, d2] = todayDay.split('-').map(Number);
  const date1 = new Date(y1, m1 - 1, d1, 12, 0, 0);
  const date2 = new Date(y2, m2 - 1, d2, 12, 0, 0);
  const diffDays = Math.round((date2.getTime() - date1.getTime()) / (24 * 60 * 60 * 1000));
  const denominator = diffDays + 1;

  if (denominator <= 0) {
    return 0;
  }

  const daySet = days instanceof Set ? days : new Set(days);
  let numerator = 0;
  for (const day of daySet) {
    if (compareDays(day, effectiveStart) >= 0 && compareDays(day, todayDay) <= 0) {
      numerator++;
    }
  }

  return numerator / denominator;
}

/**
 * Returns a 2D array of weeks (columns) containing Monday..Sunday (rows).
 * The last week ends on the Sunday of the week containing todayDay.
 *
 * @param {Iterable<string>} days - Non-deleted check-in days
 * @param {string} todayDay - 'YYYY-MM-DD'
 * @param {number} [weeks=12]
 * @returns {Array<Array<{ day: string, done: boolean, future: boolean, editable: boolean }>>}
 */
export function heatmapWeeks(days, todayDay, weeks = 12) {
  const daySet = days instanceof Set ? days : new Set(days);
  const [y, m, d] = todayDay.split('-').map(Number);
  const todayDate = new Date(y, m - 1, d, 12, 0, 0);
  const dayOfWeek = todayDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const lastWeekSunday = addDays(todayDay, daysToSunday);

  const totalDays = weeks * 7;
  const startDay = addDays(lastWeekSunday, -(totalDays - 1));

  const result = [];
  for (let w = 0; w < weeks; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(startDay, w * 7 + d);
      week.push({
        day,
        done: daySet.has(day),
        future: compareDays(day, todayDay) > 0,
        editable: isCheckInEditable(day, todayDay),
      });
    }
    result.push(week);
  }

  return result;
}
