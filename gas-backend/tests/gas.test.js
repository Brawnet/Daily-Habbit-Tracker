import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codeGsPath = path.resolve(__dirname, '../Code.gs');
const codeGsSource = fs.readFileSync(codeGsPath, 'utf8');

// Load pure functions directly
const pureContext = {
  console,
  module: { exports: {} },
  exports: {}
};
vm.createContext(pureContext);
vm.runInContext(codeGsSource, pureContext);
const {
  formatDiaryHeading,
  parseDiaryHeading,
  findChronologicalInsertIndex,
  decideReminder,
  mergeRecordsLWW
} = pureContext.module.exports;

/**
 * Creates an isolated mock Google Apps Script environment
 */
function createGasEnv(initialProps = {}) {
  let props = { ...initialProps };
  const cache = new Map();
  let lockHeld = false;

  const sheets = new Map();
  function createSheet(name) {
    let grid = [];
    return {
      getName: () => name,
      getLastRow: () => grid.length,
      getLastColumn: () => (grid.length > 0 ? grid[0].length : 0),
      getMaxRows: () => Math.max(grid.length, 100),
      getMaxColumns: () => Math.max(grid.length > 0 ? grid[0].length : 0, 20),
      getDataRange: () => ({
        getValues: () => grid.map(r => [...r])
      }),
      getRange: (row, col, numRows = 1, numCols = 1) => ({
        setValues: (values) => {
          for (let r = 0; r < numRows; r++) {
            const rowIndex = row - 1 + r;
            while (grid.length <= rowIndex) grid.push([]);
            for (let c = 0; c < numCols; c++) {
              const colIndex = col - 1 + c;
              grid[rowIndex][colIndex] = values[r][c];
            }
          }
        },
        getValues: () => {
          const res = [];
          for (let r = 0; r < numRows; r++) {
            const rowArr = [];
            const rowIndex = row - 1 + r;
            for (let c = 0; c < numCols; c++) {
              const colIndex = col - 1 + c;
              rowArr.push(grid[rowIndex] ? grid[rowIndex][colIndex] : '');
            }
            res.push(rowArr);
          }
          return res;
        },
        setNumberFormat: () => {}
      }),
      deleteRow: (rowNum) => {
        grid.splice(rowNum - 1, 1);
      },
      _grid: grid
    };
  }

  const ss = {
    getSheetByName: (name) => sheets.get(name) || null,
    insertSheet: (name) => {
      const s = createSheet(name);
      sheets.set(name, s);
      return s;
    },
    getSheets: () => Array.from(sheets.values()),
    _sheets: sheets
  };

  const folders = new Map();
  const files = new Map();
  const docs = new Map();

  const drive = {
    getFolderById: (id) => {
      if (!folders.has(id)) throw new Error('Folder not found: ' + id);
      return folders.get(id);
    },
    getFoldersByName: (name) => {
      const matching = Array.from(folders.values()).filter(f => f.name === name);
      let idx = 0;
      return {
        hasNext: () => idx < matching.length,
        next: () => matching[idx++]
      };
    },
    createFolder: (name) => {
      const id = 'folder_' + Math.random().toString(36).slice(2, 9);
      const f = {
        getId: () => id,
        name,
        getFilesByName: (fname) => {
          const matchingFiles = Array.from(files.values()).filter(file => file.name === fname && file.folderId === id);
          let fidx = 0;
          return {
            hasNext: () => fidx < matchingFiles.length,
            next: () => matchingFiles[fidx++].fileObj
          };
        }
      };
      folders.set(id, f);
      return f;
    },
    getFileById: (id) => {
      const f = files.get(id);
      if (!f) throw new Error('File not found: ' + id);
      return {
        getId: () => id,
        moveTo: (targetFolder) => {
          f.folderId = targetFolder.getId();
        }
      };
    }
  };

  const documentApp = {
    ParagraphHeading: { HEADING_2: 'HEADING_2', NORMAL: 'Normal' },
    ElementType: { PARAGRAPH: 'PARAGRAPH' },
    create: (name) => {
      const id = 'doc_' + Math.random().toString(36).slice(2, 9);
      const children = [];
      const body = {
        getNumChildren: () => children.length,
        getChild: (i) => children[i],
        appendParagraph: (text) => {
          const p = createMockParagraph(text, children);
          children.push(p);
          return p;
        },
        insertParagraph: (idx, text) => {
          const p = createMockParagraph(text, children);
          children.splice(idx, 0, p);
          return p;
        },
        removeChild: (child) => {
          const idx = children.indexOf(child);
          if (idx !== -1) children.splice(idx, 1);
          return child;
        }
      };
      function createMockParagraph(text, container) {
        let heading = 'Normal';
        let bold = false;
        const p = {
          getType: () => 'PARAGRAPH',
          asParagraph: () => p,
          getText: () => text,
          getHeading: () => heading,
          setHeading: (h) => { heading = h; },
          setBold: (b) => { bold = Boolean(b); },
          isBold: () => bold,
          removeFromParent: () => {
            const idx = container.indexOf(p);
            if (idx !== -1) container.splice(idx, 1);
            return p;
          }
        };
        return p;
      }
      const doc = {
        getId: () => id,
        getName: () => name,
        getBody: () => body,
        saveAndClose: () => {}
      };
      docs.set(id, doc);
      files.set(id, { name, fileObj: doc, folderId: null });
      return doc;
    },
    openById: (id) => {
      const doc = docs.get(id);
      if (!doc) throw new Error('Doc not found: ' + id);
      return doc;
    }
  };

  const triggers = [];
  const scriptApp = {
    getProjectTriggers: () => [...triggers],
    deleteTrigger: (t) => {
      const idx = triggers.indexOf(t);
      if (idx !== -1) triggers.splice(idx, 1);
    },
    newTrigger: (functionName) => {
      let cfg = { functionName };
      const b = {
        timeBased: () => b,
        everyDays: (d) => { cfg.days = d; return b; },
        atHour: (h) => { cfg.hour = h; return b; },
        everyMinutes: (m) => { cfg.minutes = m; return b; },
        create: () => {
          const t = { getHandlerFunction: () => functionName, _cfg: cfg };
          triggers.push(t);
          return t;
        }
      };
      return b;
    }
  };

  const fetchCalls = [];
  const urlFetchApp = {
    fetch: (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ results: [] })
      };
    }
  };

  const context = {
    console,
    Date,
    Intl,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Map,
    Set,
    JSON,
    parseInt,
    parseFloat,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        setProperties: (o) => { for (const k in o) props[k] = String(o[k]); },
        getProperties: () => ({ ...props }),
        deleteProperty: (k) => { delete props[k]; },
        deleteAllProperties: () => { props = {}; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) || null,
        put: (k, v, exp) => { cache.set(k, String(v)); },
        remove: (k) => { cache.delete(k); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { lockHeld = true; return true; },
        hasLock: () => lockHeld,
        releaseLock: () => { lockHeld = false; }
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => {
        let mime = '';
        return {
          setMimeType: (m) => { mime = m; return { getContent: () => txt, getMimeType: () => mime }; },
          getContent: () => txt
        };
      }
    },
    DriveApp: drive,
    DocumentApp: documentApp,
    ScriptApp: scriptApp,
    UrlFetchApp: urlFetchApp,
    Utilities: {
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2, 10),
      formatDate: (d, tz, fmt) => {
        if (fmt === 'yyyy-MM-dd') return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
        if (fmt === 'HH:mm') return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        return d.toISOString();
      }
    },
    Logger: { log: () => {} },
    module: { exports: {} },
    exports: {}
  };

  vm.createContext(context);
  vm.runInContext(codeGsSource, context);

  return {
    context,
    exports: context.module.exports,
    props,
    cache,
    ss,
    folders,
    files,
    docs,
    triggers,
    fetchCalls
  };
}

describe('Pure Functions', () => {
  describe('formatDiaryHeading & parseDiaryHeading', () => {
    it('formats YYYY-MM-DD into "Tuesday, 20 October 2026"', () => {
      const heading = formatDiaryHeading('2026-10-20');
      expect(heading).toBe('Tuesday, 20 October 2026');
    });

    it('formats single-digit day correctly without leading zero', () => {
      const heading = formatDiaryHeading('2026-05-03');
      expect(heading).toBe('Sunday, 3 May 2026');
    });

    it('returns empty string for invalid date inputs', () => {
      expect(formatDiaryHeading('')).toBe('');
      expect(formatDiaryHeading(null)).toBe('');
      expect(formatDiaryHeading('invalid-date')).toBe('');
    });

    it('parses "Tuesday, 20 October 2026" back to "2026-10-20"', () => {
      const day = parseDiaryHeading('Tuesday, 20 October 2026');
      expect(day).toBe('2026-10-20');
    });

    it('parses single-digit day heading with proper zero padding', () => {
      const day = parseDiaryHeading('Sunday, 3 May 2026');
      expect(day).toBe('2026-05-03');
    });

    it('returns null for unparseable heading text', () => {
      expect(parseDiaryHeading('')).toBeNull();
      expect(parseDiaryHeading('Not A Heading')).toBeNull();
      expect(parseDiaryHeading('Tuesday, 20 Blah 2026')).toBeNull();
    });

    it('performs exact roundtrip across varied dates and leap years', () => {
      const testDates = [
        '2024-02-29', // leap day
        '2026-01-01', // new year
        '2026-07-15', // mid year
        '2026-12-31', // year end
        '2027-09-09'
      ];
      for (const date of testDates) {
        const heading = formatDiaryHeading(date);
        const parsed = parseDiaryHeading(heading);
        expect(parsed).toBe(date);
      }
    });
  });

  describe('findChronologicalInsertIndex', () => {
    it('returns -1 for empty headings list', () => {
      expect(findChronologicalInsertIndex([], '2026-10-20')).toBe(-1);
    });

    it('returns 0 when inserting at start before earlier heading', () => {
      const existing = ['Tuesday, 20 October 2026', 'Thursday, 22 October 2026'];
      const index = findChronologicalInsertIndex(existing, '2026-10-19');
      expect(index).toBe(0);
    });

    it('returns middle index when inserting between headings', () => {
      const existing = ['Tuesday, 20 October 2026', 'Thursday, 22 October 2026'];
      const index = findChronologicalInsertIndex(existing, '2026-10-21');
      expect(index).toBe(1);
    });

    it('returns -1 when inserting at end after all headings', () => {
      const existing = ['Tuesday, 20 October 2026', 'Thursday, 22 October 2026'];
      const index = findChronologicalInsertIndex(existing, '2026-10-25');
      expect(index).toBe(-1);
    });

    it('correctly positions late entries from several days ago', () => {
      const existing = [
        'Friday, 16 October 2026',
        'Sunday, 18 October 2026',
        'Tuesday, 20 October 2026'
      ];
      // Late entry for 17th
      expect(findChronologicalInsertIndex(existing, '2026-10-17')).toBe(1);
      // Late entry for 15th
      expect(findChronologicalInsertIndex(existing, '2026-10-15')).toBe(0);
    });

    it('supports array of objects with childIndex', () => {
      const existing = [
        { day: '2026-10-18', childIndex: 2 },
        { day: '2026-10-20', childIndex: 7 }
      ];
      expect(findChronologicalInsertIndex(existing, '2026-10-19')).toBe(7);
      expect(findChronologicalInsertIndex(existing, '2026-10-17')).toBe(2);
      expect(findChronologicalInsertIndex(existing, '2026-10-21')).toBe(-1);
    });
  });

  describe('decideReminder', () => {
    const baseParams = {
      nowHHMM: '20:15',
      reminderTime: '20:00',
      lastReminderDay: '2026-10-19',
      todayJakarta: '2026-10-20',
      activeHabits: [{ id: 'h1', archived: false }, { id: 'h2', archived: false }],
      checkInsToday: [{ habitId: 'h1', deleted: false }],
      journalEntryToday: null,
      subscriptions: [{ endpoint: 'https://push.example.com/sub' }],
      pushEndpointUrl: 'https://habbit.vercel.app/api/send-push'
    };

    it('returns shouldSend: false if pushEndpointUrl is missing', () => {
      const res = decideReminder({ ...baseParams, pushEndpointUrl: '' });
      expect(res.shouldSend).toBe(false);
      expect(res.reason).toBe('NO_ENDPOINT');
    });

    it('returns shouldSend: false if subscriptions list is empty', () => {
      const res = decideReminder({ ...baseParams, subscriptions: [] });
      expect(res.shouldSend).toBe(false);
      expect(res.reason).toBe('NO_SUBSCRIPTIONS');
    });

    it('returns shouldSend: false if nowHHMM is before reminderTime', () => {
      const res = decideReminder({ ...baseParams, nowHHMM: '19:50', reminderTime: '20:00' });
      expect(res.shouldSend).toBe(false);
      expect(res.reason).toBe('BEFORE_REMINDER_TIME');
    });

    it('returns shouldSend: false if reminder already sent today', () => {
      const res = decideReminder({ ...baseParams, lastReminderDay: '2026-10-20' });
      expect(res.shouldSend).toBe(false);
      expect(res.reason).toBe('ALREADY_SENT_TODAY');
    });

    it('returns shouldSend: false with reason ALL_COMPLETED if all habits done and journal written', () => {
      const res = decideReminder({
        ...baseParams,
        activeHabits: [{ id: 'h1', archived: false }],
        checkInsToday: [{ habitId: 'h1', deleted: false }],
        journalEntryToday: { content: 'Wrote some notes' }
      });
      expect(res.shouldSend).toBe(false);
      expect(res.reason).toBe('ALL_COMPLETED');
    });

    it('formats body for 1 habit left and no journal written', () => {
      const res = decideReminder({
        ...baseParams,
        activeHabits: [{ id: 'h1', archived: false }],
        checkInsToday: [],
        journalEntryToday: null
      });
      expect(res.shouldSend).toBe(true);
      expect(res.body).toBe('1 habit left · Journal not written yet');
    });

    it('formats body for multiple habits left and no journal written', () => {
      const res = decideReminder({
        ...baseParams,
        activeHabits: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
        checkInsToday: [],
        journalEntryToday: null
      });
      expect(res.shouldSend).toBe(true);
      expect(res.body).toBe('3 habits left · Journal not written yet');
    });

    it('formats body for only habits left (journal already written)', () => {
      const res1 = decideReminder({
        ...baseParams,
        activeHabits: [{ id: 'h1' }],
        checkInsToday: [],
        journalEntryToday: { content: 'Finished my reflection' }
      });
      expect(res1.shouldSend).toBe(true);
      expect(res1.body).toBe('1 habit left');

      const res2 = decideReminder({
        ...baseParams,
        activeHabits: [{ id: 'h1' }, { id: 'h2' }],
        checkInsToday: [],
        journalEntryToday: { content: 'Finished my reflection' }
      });
      expect(res2.shouldSend).toBe(true);
      expect(res2.body).toBe('2 habits left');
    });

    it('formats body for only journal left (all active habits checked in)', () => {
      const res = decideReminder({
        ...baseParams,
        activeHabits: [{ id: 'h1' }, { id: 'h2' }],
        checkInsToday: [{ habitId: 'h1', deleted: false }, { habitId: 'h2', deleted: false }],
        journalEntryToday: null
      });
      expect(res.shouldSend).toBe(true);
      expect(res.body).toBe('Journal not written yet');
    });

    it('ignores archived habits and deleted check-ins', () => {
      const res = decideReminder({
        ...baseParams,
        activeHabits: [
          { id: 'h1', archived: true }, // archived -> ignored
          { id: 'h2', archived: false } // active
        ],
        checkInsToday: [
          { habitId: 'h2', deleted: true } // deleted checkin -> does not count
        ],
        journalEntryToday: { content: 'Entry done' }
      });
      expect(res.shouldSend).toBe(true);
      expect(res.body).toBe('1 habit left');
    });
  });

  describe('mergeRecordsLWW', () => {
    it('writes new incoming record with serverUpdatedAt = nowMonotonic', () => {
      const existing = [];
      const incoming = [{ id: 'h1', name: 'Exercise', updatedAt: '2026-10-20T01:00:00.000Z' }];
      const now = '2026-10-20T02:00:00.000Z';
      const result = mergeRecordsLWW(existing, incoming, now);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('h1');
      expect(result[0].serverUpdatedAt).toBe(now);
    });

    it('overwrites existing record when incoming has newer updatedAt', () => {
      const existing = [{ id: 'h1', name: 'Exercise', updatedAt: '2026-10-20T01:00:00.000Z' }];
      const incoming = [{ id: 'h1', name: 'Running', updatedAt: '2026-10-20T03:00:00.000Z' }];
      const now = '2026-10-20T04:00:00.000Z';
      const result = mergeRecordsLWW(existing, incoming, now);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Running');
      expect(result[0].serverUpdatedAt).toBe(now);
    });

    it('does not overwrite existing record when incoming has older or equal updatedAt', () => {
      const existing = [{ id: 'h1', name: 'Running', updatedAt: '2026-10-20T03:00:00.000Z', serverUpdatedAt: 'server-1' }];
      const incoming = [{ id: 'h1', name: 'Exercise', updatedAt: '2026-10-20T02:00:00.000Z' }];
      const now = '2026-10-20T04:00:00.000Z';
      const result = mergeRecordsLWW(existing, incoming, now);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Running');
      expect(result[0].serverUpdatedAt).toBe('server-1');
    });

    it('rejects update with reason LOCKED when journal entry has printedToDiaryAt set', () => {
      const existing = [
        {
          day: '2026-10-18',
          content: 'Original Journal Entry',
          updatedAt: '2026-10-18T10:00:00.000Z',
          printedToDiaryAt: '2026-10-19T02:00:00.000Z',
          serverUpdatedAt: '2026-10-19T02:00:00.000Z'
        }
      ];
      const incoming = [
        {
          day: '2026-10-18',
          content: 'Attempted edit of printed entry',
          updatedAt: '2026-10-20T10:00:00.000Z'
        }
      ];
      const now = '2026-10-20T11:00:00.000Z';
      const result = mergeRecordsLWW(existing, incoming, now);
      expect(result.rejected).toEqual([
        { type: 'journalEntries', key: '2026-10-18', reason: 'LOCKED' }
      ]);
      expect(result[0].content).toBe('Original Journal Entry');
    });

    it('ignores client-sent printedToDiaryAt and keeps server-owned value', () => {
      const existing = [{ day: '2026-10-20', content: 'Today', updatedAt: '2026-10-20T01:00:00Z', printedToDiaryAt: '' }];
      const incoming = [{ day: '2026-10-20', content: 'Today v2', updatedAt: '2026-10-20T02:00:00Z', printedToDiaryAt: 'spoofed-value' }];
      const now = '2026-10-20T03:00:00Z';
      const result = mergeRecordsLWW(existing, incoming, now);
      expect(result[0].content).toBe('Today v2');
      expect(result[0].printedToDiaryAt).toBe('');
    });

    it('allows editing today journal entry even when printedToDiaryAt is set when todayJakarta is passed', () => {
      const existing = [
        {
          day: '2026-10-21',
          content: 'Morning draft',
          updatedAt: '2026-10-21T08:00:00Z',
          printedToDiaryAt: '2026-10-21T08:10:00Z',
          serverUpdatedAt: '2026-10-21T08:10:00Z'
        }
      ];
      const incoming = [
        {
          day: '2026-10-21',
          content: 'Evening revision',
          updatedAt: '2026-10-21T20:00:00Z'
        }
      ];
      const now = '2026-10-21T20:05:00Z';
      const result = mergeRecordsLWW(existing, incoming, now, '2026-10-21');
      expect(result.rejected).toEqual([]);
      expect(result[0].content).toBe('Evening revision');
      expect(result[0].printedToDiaryAt).toBe('2026-10-21T08:10:00Z');
      expect(result[0].serverUpdatedAt).toBe(now);
    });
  });

  describe('Pure Function Isolation Guardrail (SPEC §6)', () => {
    it('ensures pure functions do not reference ambient GAS globals directly', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const codePath = path.resolve(__dirname, '../Code.gs');
      const code = fs.readFileSync(codePath, 'utf8');

      const pureFunctions = [
        'formatDiaryHeading',
        'parseDiaryHeading',
        'findChronologicalInsertIndex',
        'decideReminder',
        'mergeRecordsLWW'
      ];

      const bannedAmbientSymbols = [
        'SpreadsheetApp',
        'DocumentApp',
        'DriveApp',
        'PropertiesService',
        'LockService',
        'UrlFetchApp',
        'CacheService',
        'Logger'
      ];

      for (const fnName of pureFunctions) {
        const fnRegex = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)(?:\\nfunction|\\nif\\s*\\(typeof\\s+module|$)`);
        const match = code.match(fnRegex);
        expect(match, `Function ${fnName} should exist in Code.gs`).toBeTruthy();
        const body = match[1];

        for (const symbol of bannedAmbientSymbols) {
          const symbolRegex = new RegExp(`\\b${symbol}\\b`);
          expect(body).not.toMatch(symbolRegex);
        }
      }
    });
  });
});

describe('GAS Backend Actions', () => {
  let env;
  const PIN = 'test-secret-pin-4321';

  beforeEach(() => {
    env = createGasEnv({ PIN });
    env.exports.setup();
  });

  describe('doGet', () => {
    it('returns { ok: true, app: "habbit" }', () => {
      const resp = env.exports.doGet();
      const data = JSON.parse(resp.getContent());
      expect(data).toEqual({ ok: true, app: 'habbit' });
    });
  });

  describe('Auth & Rate Limiting (doPost)', () => {
    it('returns BAD_REQUEST for missing or invalid JSON body', () => {
      const resp = env.exports.doPost(null);
      const data = JSON.parse(resp.getContent());
      expect(data.ok).toBe(false);
      expect(data.error).toBe('BAD_REQUEST');
    });

    it('returns UNAUTHORIZED for wrong PIN', () => {
      const resp = env.exports.doPost({
        postData: { contents: JSON.stringify({ pin: 'wrong-pin', action: 'ping' }) }
      });
      const data = JSON.parse(resp.getContent());
      expect(data.ok).toBe(false);
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('locks out and returns RATE_LIMITED after >10 failures in 10 minutes', () => {
      // 10 failures
      for (let i = 1; i <= 10; i++) {
        const resp = env.exports.doPost({
          postData: { contents: JSON.stringify({ pin: 'wrong-pin', action: 'ping' }) }
        });
        const data = JSON.parse(resp.getContent());
        expect(data.ok).toBe(false);
        expect(data.error).toBe('UNAUTHORIZED');
      }

      // 11th failure -> RATE_LIMITED lockout triggered
      const lockoutResp = env.exports.doPost({
        postData: { contents: JSON.stringify({ pin: 'wrong-pin', action: 'ping' }) }
      });
      const lockoutData = JSON.parse(lockoutResp.getContent());
      expect(lockoutData.ok).toBe(false);
      expect(lockoutData.error).toBe('RATE_LIMITED');

      // Subsequent attempt with even correct PIN is rejected while lockout is active
      const duringLockout = env.exports.doPost({
        postData: { contents: JSON.stringify({ pin: PIN, action: 'ping' }) }
      });
      const duringData = JSON.parse(duringLockout.getContent());
      expect(duringData.ok).toBe(false);
      expect(duringData.error).toBe('RATE_LIMITED');
    });

    it('succeeds with correct PIN', () => {
      const resp = env.exports.doPost({
        postData: { contents: JSON.stringify({ pin: PIN, action: 'ping' }) }
      });
      const data = JSON.parse(resp.getContent());
      expect(data.ok).toBe(true);
      expect(data.timeZone).toBe('Asia/Jakarta');
      expect(data.serverTime).toBeDefined();
    });
  });

  describe('Sync Action', () => {
    it('upserts changes across all sheets and returns strictly monotonic cursor', () => {
      const payload1 = {
        pin: PIN,
        deviceId: 'dev-1',
        action: 'sync',
        since: null,
        changes: {
          habits: [
            { id: 'h1', name: 'Exercise', sortOrder: 1, archived: false, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T01:00:00Z' }
          ],
          checkIns: [
            { id: 'h1:2026-10-20', habitId: 'h1', day: '2026-10-20', deleted: false, updatedAt: '2026-10-20T01:00:00Z' }
          ],
          journalEntries: [
            { day: '2026-10-20', content: 'First entry', updatedAt: '2026-10-20T01:00:00Z' }
          ],
          settings: [
            { key: 'reminderTime', value: '21:00', updatedAt: '2026-10-20T01:00:00Z' }
          ]
        }
      };

      const resp1 = JSON.parse(env.exports.doPost({ postData: { contents: JSON.stringify(payload1) } }).getContent());
      expect(resp1.ok).toBe(true);
      expect(resp1.cursor).toBeDefined();
      expect(resp1.changes.habits.length).toBe(1);
      expect(resp1.changes.checkIns.length).toBe(1);
      expect(resp1.changes.journalEntries.length).toBe(1);
      expect(resp1.changes.settings.length).toBe(1);
      expect(resp1.rejected).toEqual([]);

      // Second sync immediately after should have cursor > first cursor (monotonicity)
      const payload2 = {
        pin: PIN,
        deviceId: 'dev-1',
        action: 'sync',
        since: resp1.cursor,
        changes: {
          habits: [
            { id: 'h2', name: 'Read', sortOrder: 2, archived: false, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T02:00:00Z' }
          ]
        }
      };

      const resp2 = JSON.parse(env.exports.doPost({ postData: { contents: JSON.stringify(payload2) } }).getContent());
      expect(resp2.ok).toBe(true);
      expect(resp2.cursor > resp1.cursor).toBe(true);
      // Changes query since resp1.cursor should only return records updated after resp1.cursor
      expect(resp2.changes.habits.length).toBe(1);
      expect(resp2.changes.habits[0].id).toBe('h2');
      expect(resp2.changes.checkIns.length).toBe(0);
      expect(resp2.changes.journalEntries.length).toBe(0);
    });

    it('rejects edit to journal entry that was printed to diary (LOCKED)', () => {
      // Create initial journal entry
      const sync1 = {
        pin: PIN,
        deviceId: 'dev-1',
        action: 'sync',
        since: null,
        changes: {
          journalEntries: [
            { day: '2026-10-18', content: 'Original content', updatedAt: '2026-10-18T10:00:00Z' }
          ]
        }
      };
      env.exports.doPost({ postData: { contents: JSON.stringify(sync1) } });

      // Mark as printedToDiaryAt in the sheet
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      rows[1][3] = '2026-10-19T02:00:00Z'; // printedToDiaryAt
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);

      // Attempt to sync an update to that journal entry
      const sync2 = {
        pin: PIN,
        deviceId: 'dev-1',
        action: 'sync',
        since: null,
        changes: {
          journalEntries: [
            { day: '2026-10-18', content: 'Tampered content', updatedAt: '2026-10-20T10:00:00Z' }
          ]
        }
      };
      const res2 = JSON.parse(env.exports.doPost({ postData: { contents: JSON.stringify(sync2) } }).getContent());
      expect(res2.ok).toBe(true);
      expect(res2.rejected).toEqual([
        { type: 'journalEntries', key: '2026-10-18', reason: 'LOCKED' }
      ]);

      // Verify content in sheet was not changed
      const rowsAfter = jSheet.getDataRange().getValues();
      expect(rowsAfter[1][1]).toBe('Original content');
    });

    it('allows editing today journal entry even when printedToDiaryAt is set', () => {
      const todayJakarta = env.exports.getTodayJakarta();
      const sync1 = {
        pin: PIN,
        deviceId: 'dev-1',
        action: 'sync',
        since: null,
        changes: {
          journalEntries: [
            { day: todayJakarta, content: 'Morning thought', updatedAt: `${todayJakarta}T09:00:00Z` }
          ]
        }
      };
      env.exports.doPost({ postData: { contents: JSON.stringify(sync1) } });

      // Simulate that this morning thought was exported to diary doc
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      rows[1][3] = `${todayJakarta}T09:05:00Z`; // printedToDiaryAt
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);

      // Later today, user edits today's entry
      const sync2 = {
        pin: PIN,
        deviceId: 'dev-1',
        action: 'sync',
        since: null,
        changes: {
          journalEntries: [
            { day: todayJakarta, content: 'Morning thought and evening reflection', updatedAt: `${todayJakarta}T18:00:00Z` }
          ]
        }
      };
      const res2 = JSON.parse(env.exports.doPost({ postData: { contents: JSON.stringify(sync2) } }).getContent());
      expect(res2.ok).toBe(true);
      expect(res2.rejected).toEqual([]);

      // Verify content in sheet was successfully updated
      const rowsAfter = jSheet.getDataRange().getValues();
      expect(rowsAfter[1][1]).toBe('Morning thought and evening reflection');
    });

    it('syncs activities to Activities sheet and returns in changes', () => {
      const syncPayload = {
        pin: PIN,
        deviceId: 'dev-1',
        action: 'sync',
        since: null,
        changes: {
          activities: [
            {
              id: 'act-1',
              title: 'Pragmatic Programmer',
              author: 'Andy Hunt',
              type: 'Book',
              status: 'In Progress',
              totalPages: 352,
              summary: 'Journey to mastery',
              archived: false,
              createdAt: '2026-10-20T10:00:00Z',
              updatedAt: '2026-10-20T10:00:00Z'
            }
          ]
        }
      };

      const res = JSON.parse(env.exports.doPost({ postData: { contents: JSON.stringify(syncPayload) } }).getContent());
      expect(res.ok).toBe(true);
      expect(res.changes.activities).toBeDefined();
      expect(res.changes.activities.length).toBe(1);
      expect(res.changes.activities[0].title).toBe('Pragmatic Programmer');
      expect(res.changes.activities[0].author).toBe('Andy Hunt');
      expect(res.changes.activities[0].type).toBe('Book');
      expect(res.changes.activities[0].status).toBe('In Progress');
      expect(res.changes.activities[0].totalPages).toBe(352);
      expect(res.changes.activities[0].summary).toBe('Journey to mastery');
      expect(res.changes.activities[0].archived).toBe(false);

      // Verify written to Activities sheet
      const actSheet = env.ss.getSheetByName('Activities');
      expect(actSheet).toBeDefined();
      const rows = actSheet.getDataRange().getValues();
      expect(rows.length).toBe(2); // Header + 1 row
      expect(rows[1][0]).toBe('act-1');
      expect(rows[1][1]).toBe('Pragmatic Programmer');
    });
  });

  describe('Push Subscription Management', () => {
    it('subscribes and updates subscription by deviceId', () => {
      const subPayload = {
        pin: PIN,
        deviceId: 'phone-ios',
        action: 'subscribePush',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
        }
      };
      const resp = JSON.parse(env.exports.doPost({ postData: { contents: JSON.stringify(subPayload) } }).getContent());
      expect(resp.ok).toBe(true);

      const pSheet = env.ss.getSheetByName('Push_Subscriptions');
      const rows = pSheet.getDataRange().getValues();
      expect(rows.length).toBe(2);
      expect(rows[1][0]).toBe('phone-ios');
      expect(rows[1][1]).toBe('https://fcm.googleapis.com/test');
    });

    it('unsubscribes subscription for deviceId', () => {
      // First subscribe
      env.exports.doPost({
        postData: {
          contents: JSON.stringify({
            pin: PIN,
            deviceId: 'phone-ios',
            action: 'subscribePush',
            subscription: { endpoint: 'https://push/1', keys: { p256dh: 'k', auth: 'a' } }
          })
        }
      });

      // Then unsubscribe
      const unresp = JSON.parse(env.exports.doPost({
        postData: {
          contents: JSON.stringify({
            pin: PIN,
            deviceId: 'phone-ios',
            action: 'unsubscribePush'
          })
        }
      }).getContent());
      expect(unresp.ok).toBe(true);

      const pSheet = env.ss.getSheetByName('Push_Subscriptions');
      expect(pSheet.getDataRange().getValues().length).toBe(1); // only header
    });

    it('testPush sends test push notification to device', () => {
      env.props['PUSH_ENDPOINT_URL'] = 'https://habbit.vercel.app/api/send-push';
      env.props['PUSH_SHARED_SECRET'] = 'test-secret';

      env.exports.doPost({
        postData: {
          contents: JSON.stringify({
            pin: PIN,
            deviceId: 'dev-test',
            action: 'subscribePush',
            subscription: { endpoint: 'https://push.example.com/test', keys: { p256dh: 'k', auth: 'a' } }
          })
        }
      });

      env.context.UrlFetchApp.fetch = (url, opts) => {
        env.fetchCalls.push({ url, opts });
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ results: [{ ok: true, endpoint: 'https://push.example.com/test' }] })
        };
      };

      const testResp = JSON.parse(env.exports.doPost({
        postData: {
          contents: JSON.stringify({
            pin: PIN,
            deviceId: 'dev-test',
            action: 'testPush'
          })
        }
      }).getContent());

      expect(testResp.ok).toBe(true);
      expect(env.fetchCalls.length).toBe(1);
      expect(env.fetchCalls[0].url).toBe('https://habbit.vercel.app/api/send-push');
      expect(env.fetchCalls[0].opts.headers['x-push-secret']).toBe('test-secret');
    });
  });

  describe('setup() Idempotency', () => {
    it('running setup() multiple times preserves configuration and does not duplicate', () => {
      const initialSecret = env.props['PUSH_SHARED_SECRET'];
      const initialFolder = env.props['DIARY_FOLDER_ID'];
      expect(initialSecret).toBeDefined();
      expect(initialFolder).toBeDefined();

      const initialTriggersCount = env.triggers.length;
      expect(initialTriggersCount).toBe(2);

      // Second setup call
      env.exports.setup();

      // Properties preserved
      expect(env.props['PUSH_SHARED_SECRET']).toBe(initialSecret);
      expect(env.props['DIARY_FOLDER_ID']).toBe(initialFolder);

      // Triggers not duplicated
      expect(env.triggers.length).toBe(2);

      // Sheets not duplicated
      const sheets = env.ss.getSheets();
      expect(sheets.length).toBe(6);
    });
  });

  describe('printDiary()', () => {
    it('prints past journal entry to yearly Google Doc chronologically and updates sheet', () => {
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      rows.push(['2026-10-18', 'Reflections on habit.\nFelt good today.', '2026-10-18T12:00:00Z', '', '2026-10-18T12:00:00Z']);
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);

      env.exports.printDiary();

      // Verify sheet updated
      const rowsAfter = jSheet.getDataRange().getValues();
      expect(rowsAfter[1][3]).not.toBe(''); // printedToDiaryAt set
      expect(rowsAfter[1][4]).toBe(rowsAfter[1][3]); // serverUpdatedAt updated

      // Verify doc created and formatted
      const docs = Array.from(env.docs.values());
      expect(docs.length).toBe(1);
      const doc = docs[0];
      expect(doc.getName()).toBe('Habbit – Diary 2026');

      const body = doc.getBody();
      expect(body.getNumChildren()).toBe(4);
      expect(body.getChild(0).getText()).toBe('Sunday, 18 October 2026');
      expect(body.getChild(0).getHeading()).toBe('HEADING_2');
      expect(body.getChild(1).getText()).toBe('Reflections on habit.');
      expect(body.getChild(2).getText()).toBe('Felt good today.');
      expect(body.getChild(3).getText()).toBe('');
    });

    it('inserts a late past entry chronologically before a later entry', () => {
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      // First add and print Oct 19 entry
      rows.push(['2026-10-19', 'Oct 19 notes', '2026-10-19T10:00:00Z', '', '2026-10-19T10:00:00Z']);
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);
      env.exports.printDiary();

      // Now add late entry for Oct 17
      const updatedRows = jSheet.getDataRange().getValues();
      updatedRows.push(['2026-10-17', 'Oct 17 late notes', '2026-10-17T10:00:00Z', '', '2026-10-17T10:00:00Z']);
      jSheet.getRange(1, 1, updatedRows.length, 5).setValues(updatedRows);
      env.exports.printDiary();

      const doc = Array.from(env.docs.values())[0];
      const body = doc.getBody();

      // Heading for Oct 17 should be child 0, Oct 19 should be pushed down
      expect(body.getChild(0).getText()).toBe('Saturday, 17 October 2026');
      expect(body.getChild(1).getText()).toBe('Oct 17 late notes');
      expect(body.getChild(2).getText()).toBe('');
      expect(body.getChild(3).getText()).toBe('Monday, 19 October 2026');
      expect(body.getChild(4).getText()).toBe('Oct 19 notes');
    });

    it('updates existing entry in-place without duplicating date heading', () => {
      const doc = env.context.DocumentApp.create('Habbit – Diary 2026');
      env.exports.insertEntryIntoDoc(doc, {
        day: '2026-10-21',
        content: 'Morning jog.\nFelt good.'
      });

      expect(doc.getBody().getNumChildren()).toBe(4);
      expect(doc.getBody().getChild(0).getText()).toBe('Wednesday, 21 October 2026');
      expect(doc.getBody().getChild(1).getText()).toBe('Morning jog.');
      expect(doc.getBody().getChild(2).getText()).toBe('Felt good.');
      expect(doc.getBody().getChild(3).getText()).toBe('');

      // Update the same day with new content
      env.exports.insertEntryIntoDoc(doc, {
        day: '2026-10-21',
        content: 'Morning jog.\nAfternoon meeting.\nEvening reading.'
      });

      const body = doc.getBody();
      const headings = [];
      for (let i = 0; i < body.getNumChildren(); i++) {
        if (body.getChild(i).getHeading() === 'HEADING_2') {
          headings.push(body.getChild(i).getText());
        }
      }
      expect(headings).toEqual(['Wednesday, 21 October 2026']);
      expect(body.getChild(0).getText()).toBe('Wednesday, 21 October 2026');
      expect(body.getChild(1).getText()).toBe('Morning jog.');
      expect(body.getChild(2).getText()).toBe('Afternoon meeting.');
      expect(body.getChild(3).getText()).toBe('Evening reading.');
      expect(body.getChild(4).getText()).toBe('');
      expect(body.getNumChildren()).toBe(5);
    });

    it('removes date heading and section when content is cleared/empty', () => {
      const doc = env.context.DocumentApp.create('Habbit – Diary 2026');
      // Insert Oct 20 and Oct 21
      env.exports.insertEntryIntoDoc(doc, {
        day: '2026-10-20',
        content: 'Oct 20 entry'
      });
      env.exports.insertEntryIntoDoc(doc, {
        day: '2026-10-21',
        content: 'Oct 21 entry'
      });

      expect(doc.getBody().getNumChildren()).toBe(6);

      // Clear Oct 20
      env.exports.insertEntryIntoDoc(doc, {
        day: '2026-10-20',
        content: ''
      });

      const body = doc.getBody();
      const headings = [];
      for (let i = 0; i < body.getNumChildren(); i++) {
        if (body.getChild(i).getHeading() === 'HEADING_2') {
          headings.push(body.getChild(i).getText());
        }
      }
      // Oct 20 should be completely removed, Oct 21 remains
      expect(headings).toEqual(['Wednesday, 21 October 2026']);
      expect(body.getChild(0).getText()).toBe('Wednesday, 21 October 2026');
      expect(body.getChild(1).getText()).toBe('Oct 21 entry');
      expect(body.getChild(2).getText()).toBe('');
      expect(body.getNumChildren()).toBe(3);
    });

    it('handles body text with markdown headings without breaking date boundary in-place replacement', () => {
      const doc = env.context.DocumentApp.create('Habbit – Diary 2026');
      env.exports.insertEntryIntoDoc(doc, {
        day: '2026-10-21',
        content: '## Personal Heading\nRegular line\n### Another Heading'
      });

      // Update in place
      env.exports.insertEntryIntoDoc(doc, {
        day: '2026-10-21',
        content: '## Updated Heading\nUpdated line'
      });

      const body = doc.getBody();
      const headings = [];
      for (let i = 0; i < body.getNumChildren(); i++) {
        if (body.getChild(i).getHeading() === 'HEADING_2') {
          headings.push(body.getChild(i).getText());
        }
      }
      expect(headings).toEqual(['Wednesday, 21 October 2026']);
      expect(body.getChild(1).getText()).toBe('## Updated Heading');
      expect(body.getChild(2).getText()).toBe('Updated line');
    });

    it('prints prompt-based journal entries with bold headings and strips raw HTML wrapper tags', () => {
      const doc = env.context.DocumentApp.create('Habbit – Diary 2026');
      const compiledContent = [
        '<div class="journal-prompt-block" data-prompt-id="jp_day">',
        '  <h3 class="font-bold">How was your day?</h3>',
        '  <div class="journal-prompt-answer">Felt very accomplished.</div>',
        '</div>',
        '',
        '<div class="journal-notes-block">',
        '  <h3 class="font-bold">Additional Notes</h3>',
        '  <div class="journal-notes-answer">Quiet evening tea.</div>',
        '</div>'
      ].join('\n');

      env.exports.insertEntryIntoDoc(doc, {
        day: '2026-10-21',
        content: compiledContent
      });

      const body = doc.getBody();
      // Date heading
      expect(body.getChild(0).getText()).toBe('Wednesday, 21 October 2026');
      expect(body.getChild(0).getHeading()).toBe('HEADING_2');

      // Question 1: bold heading
      expect(body.getChild(1).getText()).toBe('How was your day?');
      expect(body.getChild(1).isBold()).toBe(true);

      // Answer 1: normal text
      expect(body.getChild(2).getText()).toBe('Felt very accomplished.');
      expect(body.getChild(2).isBold()).toBe(false);

      // Separation blank line
      expect(body.getChild(3).getText()).toBe('');

      // Question 2: bold heading
      expect(body.getChild(4).getText()).toBe('Additional Notes');
      expect(body.getChild(4).isBold()).toBe(true);

      // Answer 2: normal text
      expect(body.getChild(5).getText()).toBe('Quiet evening tea.');
      expect(body.getChild(5).isBold()).toBe(false);

      // Blank line at end
      expect(body.getChild(6).getText()).toBe('');
    });

    it('batches exports by year, opening and saving each yearly Doc only once', () => {
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      rows.push(['2026-10-18', 'Oct 18 entry', '2026-10-18T10:00:00Z', '', '2026-10-18T10:00:00Z']);
      rows.push(['2026-10-19', 'Oct 19 entry', '2026-10-19T10:00:00Z', '', '2026-10-19T10:00:00Z']);
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);

      env.exports.printDiary();

      const docs = Array.from(env.docs.values());
      expect(docs.length).toBe(1); // Exactly one Doc for 2026
      const doc = docs[0];
      expect(doc.getName()).toBe('Habbit – Diary 2026');
      const headings = [];
      const body = doc.getBody();
      for (let i = 0; i < body.getNumChildren(); i++) {
        if (body.getChild(i).getHeading() === 'HEADING_2') {
          headings.push(body.getChild(i).getText());
        }
      }
      expect(headings).toEqual(['Sunday, 18 October 2026', 'Monday, 19 October 2026']);
    });
  });

  describe('checkReminder()', () => {
    it('sends push to active subscriptions and prunes dead 404/410 subscriptions', () => {
      env.props['PUSH_ENDPOINT_URL'] = 'https://habbit.vercel.app/api/send-push';
      env.props['PUSH_SHARED_SECRET'] = 'secret-xyz';

      // Set reminderTime to earlier than now so reminder fires
      const sSheet = env.ss.getSheetByName('Settings');
      sSheet.getRange(2, 1, 1, 4).setValues([['reminderTime', '00:01', '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z']]);

      // Add active habit with no check-in
      const hSheet = env.ss.getSheetByName('Habits');
      hSheet.getRange(2, 1, 1, 7).setValues([['h1', 'Meditation', 1, 'FALSE', '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z']]);

      // Add 2 push subscriptions
      const pSheet = env.ss.getSheetByName('Push_Subscriptions');
      pSheet.getRange(2, 1, 2, 5).setValues([
        ['dev-active', 'https://push.example.com/active', 'key1', 'auth1', '2026-10-20T00:00:00Z'],
        ['dev-dead', 'https://push.example.com/dead', 'key2', 'auth2', '2026-10-20T00:00:00Z']
      ]);

      env.context.UrlFetchApp.fetch = (url, opts) => {
        env.fetchCalls.push({ url, opts });
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            results: [
              { endpoint: 'https://push.example.com/active', ok: true, statusCode: 201 },
              { endpoint: 'https://push.example.com/dead', ok: false, statusCode: 410, error: 'Gone' }
            ]
          })
        };
      };

      env.exports.checkReminder();

      // Push was sent
      expect(env.fetchCalls.length).toBe(1);
      const call = env.fetchCalls[0];
      expect(call.opts.headers['x-push-secret']).toBe('secret-xyz');
      const payload = JSON.parse(call.opts.payload);
      expect(payload.notification.body).toBe('1 habit left · Journal not written yet');

      // Dead subscription was pruned
      const remainingSubs = pSheet.getDataRange().getValues();
      expect(remainingSubs.length).toBe(2); // header + active
      expect(remainingSubs[1][0]).toBe('dev-active');

      // LAST_REMINDER_DAY set
      expect(env.props['LAST_REMINDER_DAY']).toBeDefined();
    });

    it('auto-exports today journal entry to Google Doc during 10-minute checkReminder run', () => {
      const todayJakarta = env.exports.getTodayJakarta();
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      rows.push([todayJakarta, 'First draft today', `${todayJakarta}T10:00:00Z`, '', `${todayJakarta}T10:00:00Z`]);
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);

      env.exports.checkReminder();

      // Verify sheet marked as printedToDiaryAt
      const rowsAfter = jSheet.getDataRange().getValues();
      expect(rowsAfter[1][3]).not.toBe('');
      const firstPrintedAt = rowsAfter[1][3];

      // Verify Google Doc was created in folder and contains today's entry
      const docs = Array.from(env.docs.values());
      expect(docs.length).toBe(1);
      const doc = docs[0];
      const year = todayJakarta.slice(0, 4);
      expect(doc.getName()).toBe(`Habbit – Diary ${year}`);
      expect(doc.getBody().getChild(1).getText()).toBe('First draft today');

      // User updates today's entry later
      rowsAfter[1][1] = 'First draft today + evening thoughts';
      rowsAfter[1][2] = `${todayJakarta}T20:00:00Z`;
      rowsAfter[1][4] = `${todayJakarta}T20:00:00Z`; // serverUpdatedAt
      jSheet.getRange(1, 1, rowsAfter.length, 5).setValues(rowsAfter);
      env.exports.checkReminder();

      // Verify Doc was updated in-place
      const rowsAfterSecond = jSheet.getDataRange().getValues();
      expect(rowsAfterSecond[1][3]).not.toBe(firstPrintedAt);
      expect(doc.getBody().getChild(1).getText()).toBe('First draft today + evening thoughts');
    });

    it('handles Google Doc export error gracefully without crashing checkReminder', () => {
      const todayJakarta = env.exports.getTodayJakarta();
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      rows.push([todayJakarta, 'Will fail export', `${todayJakarta}T10:00:00Z`, '', `${todayJakarta}T10:00:00Z`]);
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);

      // Break DocumentApp.create to simulate transient error
      const originalCreate = env.context.DocumentApp.create;
      env.context.DocumentApp.create = () => {
        throw new Error('Google Drive quota exceeded');
      };

      try {
        // Should not throw
        expect(() => env.exports.checkReminder()).not.toThrow();
        // Sheet printedToDiaryAt remains empty so next run can retry
        const rowsAfter = jSheet.getDataRange().getValues();
        expect(rowsAfter[1][3]).toBe('');
      } finally {
        env.context.DocumentApp.create = originalCreate;
      }
    });

    it('is immune to client clock skew and does not repeatedly re-export when serverUpdatedAt has not changed', () => {
      const todayJakarta = env.exports.getTodayJakarta();
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      // Fast client clock: updatedAt is 3 hours in the future, serverUpdatedAt is current
      rows.push([todayJakarta, 'Clock skew entry', `${todayJakarta}T23:00:00Z`, '', `${todayJakarta}T10:00:00Z`]);
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);

      env.exports.checkReminder();

      const rowsAfterFirst = jSheet.getDataRange().getValues();
      const initialPrintedAt = rowsAfterFirst[1][3];
      expect(initialPrintedAt).not.toBe('');

      // Run checkReminder again without any new server edits
      env.exports.checkReminder();

      const rowsAfterSecond = jSheet.getDataRange().getValues();
      // printedToDiaryAt should NOT be updated again because serverUpdatedAt has not changed
      expect(rowsAfterSecond[1][3]).toBe(initialPrintedAt);
    });

    it('does not export future-dated journal entries in checkReminder or syncDiaryEntries', () => {
      const todayJakarta = env.exports.getTodayJakarta();
      const futureDay = '2099-12-31';
      const jSheet = env.ss.getSheetByName('Journal_Entries');
      const rows = jSheet.getDataRange().getValues();
      rows.push([futureDay, 'Future entry draft', `${futureDay}T10:00:00Z`, '', `${todayJakarta}T10:00:00Z`]);
      jSheet.getRange(1, 1, rows.length, 5).setValues(rows);

      env.exports.checkReminder();

      // Verify sheet marked as printedToDiaryAt is still empty
      const rowsAfter = jSheet.getDataRange().getValues();
      expect(rowsAfter[1][3]).toBe('');

      // Verify no doc was created for 2099
      const docs = Array.from(env.docs.values());
      const futureDoc = docs.find(d => d.getName().includes('2099'));
      expect(futureDoc).toBeUndefined();
    });
  });
});
