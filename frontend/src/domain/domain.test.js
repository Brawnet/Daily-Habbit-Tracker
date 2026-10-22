import { describe, it, expect } from 'vitest';
import {
  toDay,
  today,
  addDays,
  compareDays,
  isCheckInEditable,
  isJournalEditable,
  formatLong,
  formatShort,
  msUntilNextDay,
} from './day.js';
import { currentStreak, longestStreak } from './streak.js';
import { completionRate, heatmapWeeks } from './stats.js';
import { searchEntries } from './search.js';
import { isBlank, htmlToText, htmlToMarkdownText } from './text.js';

describe('domain/day', () => {
  describe('toDay and today', () => {
    it('formats local Date to YYYY-MM-DD with zero padding', () => {
      const d1 = new Date(2026, 0, 5); // Jan 5, 2026
      expect(toDay(d1)).toBe('2026-01-05');

      const d2 = new Date(2026, 9, 20); // Oct 20, 2026
      expect(toDay(d2)).toBe('2026-10-20');
    });

    it('uses local time (not UTC) near midnight', () => {
      // 23:59:59.999 local time must remain on that local calendar day
      const nearMidnightEnd = new Date(2026, 9, 20, 23, 59, 59, 999);
      expect(toDay(nearMidnightEnd)).toBe('2026-10-20');

      // 00:00:00.001 local time must remain on that local calendar day
      const nearMidnightStart = new Date(2026, 9, 20, 0, 0, 0, 1);
      expect(toDay(nearMidnightStart)).toBe('2026-10-20');
    });

    it('today() returns current local date in YYYY-MM-DD format', () => {
      const current = today();
      expect(current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(current).toBe(toDay(new Date()));
    });
  });

  describe('addDays', () => {
    it('adds and subtracts days within the same month', () => {
      expect(addDays('2026-10-10', 5)).toBe('2026-10-15');
      expect(addDays('2026-10-15', -5)).toBe('2026-10-10');
      expect(addDays('2026-10-20', 0)).toBe('2026-10-20');
    });

    it('crosses month boundaries forward and backward', () => {
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
      expect(addDays('2026-04-30', 2)).toBe('2026-05-02');
      expect(addDays('2026-05-01', -2)).toBe('2026-04-29');
    });

    it('crosses year boundaries forward and backward', () => {
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
      expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    });

    it('handles leap years correctly', () => {
      // 2024 is leap year
      expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
      expect(addDays('2024-03-01', -1)).toBe('2024-02-29');

      // 2025 is not leap year
      expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
      expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    });
  });

  describe('compareDays', () => {
    it('compares lexicographically (-1 | 0 | 1)', () => {
      expect(compareDays('2026-10-19', '2026-10-20')).toBe(-1);
      expect(compareDays('2026-10-20', '2026-10-20')).toBe(0);
      expect(compareDays('2026-10-21', '2026-10-20')).toBe(1);
      expect(compareDays('2025-12-31', '2026-01-01')).toBe(-1);
      expect(compareDays('2027-01-01', '2026-12-31')).toBe(1);
    });
  });

  describe('isCheckInEditable', () => {
    it('is true only for today and yesterday (SPEC §1)', () => {
      const todayDay = '2026-10-20';
      const yesterday = '2026-10-19';
      const twoDaysAgo = '2026-10-18';
      const tomorrow = '2026-10-21';

      expect(isCheckInEditable(todayDay, todayDay)).toBe(true);
      expect(isCheckInEditable(yesterday, todayDay)).toBe(true);
      expect(isCheckInEditable(twoDaysAgo, todayDay)).toBe(false);
      expect(isCheckInEditable(tomorrow, todayDay)).toBe(false);
    });

    it('handles month/year boundary for yesterday', () => {
      expect(isCheckInEditable('2026-10-31', '2026-11-01')).toBe(true);
      expect(isCheckInEditable('2026-10-30', '2026-11-01')).toBe(false);

      expect(isCheckInEditable('2026-12-31', '2027-01-01')).toBe(true);
      expect(isCheckInEditable('2026-12-30', '2027-01-01')).toBe(false);
    });
  });

  describe('isJournalEditable', () => {
    it('is true only for today (SPEC §1)', () => {
      const todayDay = '2026-10-20';
      const yesterday = '2026-10-19';
      const tomorrow = '2026-10-21';

      expect(isJournalEditable(todayDay, todayDay)).toBe(true);
      expect(isJournalEditable(yesterday, todayDay)).toBe(false);
      expect(isJournalEditable(tomorrow, todayDay)).toBe(false);
    });
  });

  describe('formatLong & formatShort', () => {
    it('formats full date string in en-US', () => {
      expect(formatLong('2026-10-20')).toBe('Tuesday, 20 October 2026');
      expect(formatLong('2026-01-01')).toBe('Thursday, 1 January 2026');
    });

    it('formats short date string in en-US', () => {
      expect(formatShort('2026-10-20')).toBe('Tue, 20 Oct 2026');
      expect(formatShort('2026-01-01')).toBe('Thu, 1 Jan 2026');
    });
  });

  describe('msUntilNextDay', () => {
    it('returns exact milliseconds until local midnight', () => {
      const testNow = new Date(2026, 9, 20, 23, 59, 50, 0); // 10 seconds before midnight
      expect(msUntilNextDay(testNow)).toBe(10000);

      const oneSecond = new Date(2026, 9, 20, 23, 59, 59, 0);
      expect(msUntilNextDay(oneSecond)).toBe(1000);
    });

    it('returns a positive number <= 24 hours when called with default now', () => {
      const ms = msUntilNextDay();
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });
  });
});

describe('domain/streak', () => {
  describe('currentStreak', () => {
    it('satisfies SPEC §1 example: check-in 17, 18, 19', () => {
      const days = ['2026-10-17', '2026-10-18', '2026-10-19'];

      // On 20 morning (no check-in 20 yet): streak = 3 (counted from yesterday 19)
      expect(currentStreak(days, '2026-10-20')).toBe(3);

      // On 20 with check-in 20: streak = 4
      expect(currentStreak([...days, '2026-10-20'], '2026-10-20')).toBe(4);

      // On 21 without check-in 20: streak = 0
      expect(currentStreak(days, '2026-10-21')).toBe(0);
    });

    it('returns 0 when days is empty', () => {
      expect(currentStreak([], '2026-10-20')).toBe(0);
      expect(currentStreak(new Set(), '2026-10-20')).toBe(0);
    });

    it('returns 1 if only today is checked in', () => {
      expect(currentStreak(['2026-10-20'], '2026-10-20')).toBe(1);
    });

    it('returns 1 if only yesterday is checked in', () => {
      expect(currentStreak(['2026-10-19'], '2026-10-20')).toBe(1);
    });

    it('handles gap in history (only counts contiguous sequence to today/yesterday)', () => {
      // 17, 19, 20 (gap at 18)
      expect(currentStreak(['2026-10-17', '2026-10-19', '2026-10-20'], '2026-10-20')).toBe(2);

      // 17, 19 (gap at 18, today 20 not checked in)
      expect(currentStreak(['2026-10-17', '2026-10-19'], '2026-10-20')).toBe(1);
    });

    it('works across month and year boundaries', () => {
      const days = ['2026-12-30', '2026-12-31', '2027-01-01'];
      expect(currentStreak(days, '2027-01-01')).toBe(3);
      expect(currentStreak(days, '2027-01-02')).toBe(3);
    });
  });

  describe('longestStreak', () => {
    it('returns 0 for empty days', () => {
      expect(longestStreak([])).toBe(0);
      expect(longestStreak(new Set())).toBe(0);
    });

    it('returns 1 for a single check-in day', () => {
      expect(longestStreak(['2026-10-20'])).toBe(1);
    });

    it('calculates the longest consecutive sequence anywhere in history', () => {
      const days = [
        '2026-10-01',
        '2026-10-02',
        // gap
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
        '2026-10-08',
        // gap
        '2026-10-12',
      ];
      expect(longestStreak(days)).toBe(4);
    });

    it('handles unordered input and duplicate entries', () => {
      const days = [
        '2026-10-07',
        '2026-10-05',
        '2026-10-06',
        '2026-10-05', // duplicate
        '2026-10-08',
      ];
      expect(longestStreak(days)).toBe(4);
    });

    it('calculates longest streak across month and year boundaries', () => {
      const days = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
      expect(longestStreak(days)).toBe(4);
    });
  });
});

describe('domain/stats', () => {
  describe('completionRate', () => {
    it('calculates completion rate over full 30-day window for older habits', () => {
      const todayDay = '2026-10-30';
      const createdDay = '2026-08-01'; // Habit created long ago

      // 15 days checked in within the last 30 days
      const days = [];
      for (let i = 0; i < 15; i++) {
        days.push(addDays('2026-10-01', i));
      }

      // Window is 2026-10-01 to 2026-10-30 (30 days total)
      const rate = completionRate(days, { todayDay, createdDay, windowDays: 30 });
      expect(rate).toBeCloseTo(15 / 30, 5);
      expect(rate).toBe(0.5);
    });

    it('calculates completion rate with habit created < 30 days ago (SPEC §11)', () => {
      const todayDay = '2026-10-20';
      const createdDay = '2026-10-16'; // 5 days inclusive (16, 17, 18, 19, 20)

      // Checked in 3 of the 5 days (16, 17, 18)
      const days = ['2026-10-16', '2026-10-17', '2026-10-18'];

      const rate = completionRate(days, { todayDay, createdDay, windowDays: 30 });
      expect(rate).toBeCloseTo(3 / 5, 5);
      expect(rate).toBe(0.6);
    });

    it('handles habit created today', () => {
      const todayDay = '2026-10-20';
      const createdDay = '2026-10-20';

      // Done today
      expect(completionRate(['2026-10-20'], { todayDay, createdDay })).toBe(1.0);

      // Not done today
      expect(completionRate([], { todayDay, createdDay })).toBe(0.0);
    });

    it('returns 0 when habit createdDay is in the future', () => {
      const todayDay = '2026-10-20';
      const createdDay = '2026-10-25';
      expect(completionRate(['2026-10-20'], { todayDay, createdDay })).toBe(0);
    });

    it('ignores check-ins outside the window / before createdDay', () => {
      const todayDay = '2026-10-20';
      const createdDay = '2026-10-18'; // 3 days: 18, 19, 20

      // Includes check-in on 15 (before createdDay) and 20
      const days = ['2026-10-15', '2026-10-20'];
      const rate = completionRate(days, { todayDay, createdDay });
      expect(rate).toBeCloseTo(1 / 3, 5);
    });
  });

  describe('heatmapWeeks', () => {
    it('returns requested number of weeks (default 12) with 7 days each', () => {
      const todayDay = '2026-10-20'; // Tuesday
      const weeks = heatmapWeeks([], todayDay);

      expect(weeks).toHaveLength(12);
      for (const week of weeks) {
        expect(week).toHaveLength(7);
      }
    });

    it('starts each week on Monday and ends on Sunday (SPEC §10, §11)', () => {
      const todayDay = '2026-10-20';
      const weeks = heatmapWeeks([], todayDay, 12);

      for (const week of weeks) {
        // Monday check
        const [yM, mM, dM] = week[0].day.split('-').map(Number);
        const mon = new Date(yM, mM - 1, dM, 12);
        expect(mon.getDay()).toBe(1); // Monday

        // Sunday check
        const [yS, mS, dS] = week[6].day.split('-').map(Number);
        const sun = new Date(yS, mS - 1, dS, 12);
        expect(sun.getDay()).toBe(0); // Sunday
      }
    });

    it('ends the last week on Sunday of the week containing todayDay', () => {
      const todayDay = '2026-10-20'; // Tuesday
      const weeks = heatmapWeeks([], todayDay, 4);

      const lastWeek = weeks[3];
      // Week containing Oct 20, 2026: Monday is Oct 19, Sunday is Oct 25
      expect(lastWeek[0].day).toBe('2026-10-19');
      expect(lastWeek[1].day).toBe('2026-10-20');
      expect(lastWeek[6].day).toBe('2026-10-25');
    });

    it('correctly sets done, future, and editable flags', () => {
      const todayDay = '2026-10-20'; // Tuesday
      const checkIns = ['2026-10-19', '2026-10-20'];
      const weeks = heatmapWeeks(checkIns, todayDay, 1);

      const week = weeks[0];
      const monday = week[0]; // 2026-10-19 (yesterday)
      const tuesday = week[1]; // 2026-10-20 (today)
      const wednesday = week[2]; // 2026-10-21 (future)

      expect(monday.day).toBe('2026-10-19');
      expect(monday.done).toBe(true);
      expect(monday.future).toBe(false);
      expect(monday.editable).toBe(true);

      expect(tuesday.day).toBe('2026-10-20');
      expect(tuesday.done).toBe(true);
      expect(tuesday.future).toBe(false);
      expect(tuesday.editable).toBe(true);

      expect(wednesday.day).toBe('2026-10-21');
      expect(wednesday.done).toBe(false);
      expect(wednesday.future).toBe(true);
      expect(wednesday.editable).toBe(false);
    });

    it('returns weeks in chronological order (oldest first, current last)', () => {
      const todayDay = '2026-10-20';
      const weeks = heatmapWeeks([], todayDay, 4);

      expect(compareDays(weeks[0][0].day, weeks[3][6].day)).toBe(-1);
      expect(weeks[0][0].day).toBe(addDays(weeks[3][6].day, -(4 * 7 - 1)));
    });
  });
});

describe('domain/search', () => {
  const sampleEntries = [
    { day: '2026-10-20', content: 'Morning jog and coffee at Café.' }, // Tuesday
    { day: '2026-10-19', content: 'Reading books all evening with a naïve mind.' }, // Monday
    { day: '2026-10-18', content: 'Swimming and eating café pastry.' }, // Sunday
  ];

  it('returns all entries sorted by day descending with highlights: [] on empty/whitespace query', () => {
    const res1 = searchEntries(sampleEntries, '');
    expect(res1).toHaveLength(3);
    expect(res1[0].entry.day).toBe('2026-10-20');
    expect(res1[1].entry.day).toBe('2026-10-19');
    expect(res1[2].entry.day).toBe('2026-10-18');
    expect(res1[0].highlights).toEqual([]);

    const res2 = searchEntries(sampleEntries, '   ');
    expect(res2).toHaveLength(3);
  });

  it('performs AND token matching (all tokens must match)', () => {
    const res = searchEntries(sampleEntries, 'morning coffee');
    expect(res).toHaveLength(1);
    expect(res[0].entry.day).toBe('2026-10-20');

    // One token matches, other does not
    const noRes = searchEntries(sampleEntries, 'morning swimming');
    expect(noRes).toHaveLength(0);
  });

  it('is case- and diacritic-insensitive (SPEC §1, §11)', () => {
    // "cafe" matches "Café" and "café"
    const resCafe = searchEntries(sampleEntries, 'cafe');
    expect(resCafe).toHaveLength(2);
    expect(resCafe[0].entry.day).toBe('2026-10-20');
    expect(resCafe[1].entry.day).toBe('2026-10-18');

    // "naive" matches "naïve"
    const resNaive = searchEntries(sampleEntries, 'naive');
    expect(resNaive).toHaveLength(1);
    expect(resNaive[0].entry.day).toBe('2026-10-19');

    // Query with diacritics "café" matches normalized content
    const resAccented = searchEntries(sampleEntries, 'café');
    expect(resAccented).toHaveLength(2);
  });

  it('matches date representations: YYYY-MM-DD, short date, long date, weekday, month year (SPEC §1, §11)', () => {
    // 'YYYY-MM-DD'
    const resIso = searchEntries(sampleEntries, '2026-10-20');
    expect(resIso).toHaveLength(1);
    expect(resIso[0].entry.day).toBe('2026-10-20');

    // Weekday: 'tuesday'
    const resTuesday = searchEntries(sampleEntries, 'tuesday');
    expect(resTuesday).toHaveLength(1);
    expect(resTuesday[0].entry.day).toBe('2026-10-20');

    // Weekday: 'monday'
    const resMonday = searchEntries(sampleEntries, 'monday');
    expect(resMonday).toHaveLength(1);
    expect(resMonday[0].entry.day).toBe('2026-10-19');

    // Short date: '20 oct 2026'
    const resShort = searchEntries(sampleEntries, '20 oct 2026');
    expect(resShort).toHaveLength(1);
    expect(resShort[0].entry.day).toBe('2026-10-20');

    // Long date: '20 october 2026'
    const resLong = searchEntries(sampleEntries, '20 october 2026');
    expect(resLong).toHaveLength(1);
    expect(resLong[0].entry.day).toBe('2026-10-20');

    // Month year: 'oct 2026' (all are October 2026)
    const resMonthYear = searchEntries(sampleEntries, 'oct 2026');
    expect(resMonthYear).toHaveLength(3);
  });

  it('combines content tokens and date tokens with AND logic', () => {
    // 'tuesday cafe': Tuesday is date representation of 2026-10-20, cafe is in content
    const res = searchEntries(sampleEntries, 'tuesday cafe');
    expect(res).toHaveLength(1);
    expect(res[0].entry.day).toBe('2026-10-20');

    // Highlights should only highlight "café" in content (not nonexistent "tuesday")
    expect(res[0].highlights).toHaveLength(1);
    const [start, end] = res[0].highlights[0];
    expect(res[0].entry.content.slice(start, end)).toBe('Café');
  });

  it('returns character slice highlight ranges in original content', () => {
    const res = searchEntries(sampleEntries, 'coffee cafe');
    expect(res).toHaveLength(1);

    const highlights = res[0].highlights;
    expect(highlights.length).toBeGreaterThanOrEqual(2);

    const slices = highlights.map(([s, e]) => res[0].entry.content.slice(s, e));
    expect(slices).toContain('coffee');
    expect(slices).toContain('Café');
  });

  it('merges overlapping highlight ranges', () => {
    const entries = [{ day: '2026-10-20', content: 'banana banana' }];
    const res = searchEntries(entries, 'an ana');
    expect(res).toHaveLength(1);

    // Overlapping occurrences in "banana" should be merged
    for (const [start, end] of res[0].highlights) {
      expect(end).toBeGreaterThan(start);
      expect(entries[0].content.slice(start, end)).toMatch(/an/);
    }
  });

  it('handles empty entries array or invalid inputs gracefully', () => {
    expect(searchEntries([], 'test')).toEqual([]);
    expect(searchEntries(null, 'test')).toEqual([]);
    expect(searchEntries(undefined, 'test')).toEqual([]);
  });
});

describe('domain/text', () => {
  describe('isBlank', () => {
    it('returns true for null, undefined, empty string, or whitespace', () => {
      expect(isBlank(null)).toBe(true);
      expect(isBlank(undefined)).toBe(true);
      expect(isBlank('')).toBe(true);
      expect(isBlank('   ')).toBe(true);
    });

    it('returns true for empty HTML tags without visible text', () => {
      expect(isBlank('<p></p>')).toBe(true);
      expect(isBlank('<p><br></p>')).toBe(true);
      expect(isBlank('<ul><li>  </li></ul>')).toBe(true);
    });

    it('returns false when visible text exists', () => {
      expect(isBlank('Hello')).toBe(false);
      expect(isBlank('<p>Hello</p>')).toBe(false);
      expect(isBlank('<ul><li>Item</li></ul>')).toBe(false);
    });
  });

  describe('htmlToText', () => {
    it('strips HTML tags and normalizes whitespace', () => {
      expect(htmlToText('<p>Hello   world</p>')).toBe('Hello world');
      expect(htmlToText('Line 1<br/>Line 2')).toBe('Line 1\nLine 2');
    });
  });

  describe('htmlToMarkdownText', () => {
    it('converts unordered lists to bullet points', () => {
      const html = '<ul><li>First item</li><li>Second item</li></ul>';
      expect(htmlToMarkdownText(html)).toBe('• First item\n• Second item');
    });

    it('converts ordered lists to numbered items', () => {
      const html = '<ol><li>Step one</li><li>Step two</li></ol>';
      expect(htmlToMarkdownText(html)).toBe('1. Step one\n2. Step two');
    });

    it('handles paragraphs with blank line separation', () => {
      const html = '<p>Intro paragraph</p><p>Second paragraph</p>';
      expect(htmlToMarkdownText(html)).toBe('Intro paragraph\n\nSecond paragraph');
    });

    it('preserves clean plain text', () => {
      expect(htmlToMarkdownText('Just plain text')).toBe('Just plain text');
    });
  });
});
