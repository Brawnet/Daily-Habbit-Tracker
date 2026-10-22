/**
 * Habbit Apps Script Backend (SPEC §6)
 * Container-bound to Google Spreadsheet
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const SCHEMA = {
  Habits: ['id', 'name', 'sortOrder', 'archived', 'createdAt', 'updatedAt', 'serverUpdatedAt'],
  Check_Ins: ['id', 'habitId', 'day', 'deleted', 'updatedAt', 'serverUpdatedAt'],
  Journal_Entries: ['day', 'content', 'updatedAt', 'printedToDiaryAt', 'serverUpdatedAt'],
  Settings: ['key', 'value', 'updatedAt', 'serverUpdatedAt'],
  Push_Subscriptions: ['deviceId', 'endpoint', 'p256dh', 'auth', 'createdAt'],
  Activities: ['id', 'title', 'author', 'type', 'status', 'totalPages', 'summary', 'archived', 'createdAt', 'updatedAt', 'serverUpdatedAt']
};

// ==========================================
// Pure Logic Functions
// ==========================================

/**
 * Formats 'YYYY-MM-DD' into 'Tuesday, 20 October 2026' (Heading 2 format)
 * @param {string} day
 * @returns {string}
 */
function formatDiaryHeading(day) {
  if (!day || typeof day !== 'string') return '';
  const match = String(day).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const monthIndex = parseInt(match[2], 10) - 1;
  const dayNum = parseInt(match[3], 10);
  if (monthIndex < 0 || monthIndex > 11) return '';
  const dt = new Date(Date.UTC(year, monthIndex, dayNum));
  const dayName = DAYS[dt.getUTCDay()];
  const monthName = MONTHS[monthIndex];
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

/**
 * Parses 'Tuesday, 20 October 2026' back to 'YYYY-MM-DD'
 * @param {string} headingText
 * @returns {string|null}
 */
function parseDiaryHeading(headingText) {
  if (!headingText || typeof headingText !== 'string') return null;
  const match = String(headingText).trim().match(/^([A-Za-z]+),\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const [, , dayNumStr, monthName, yearStr] = match;
  const monthIndex = MONTHS.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
  if (monthIndex === -1) return null;
  const y = yearStr;
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(dayNumStr).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Finds index before first heading whose day > newDay, or -1 (append).
 * Supports array of string headings, day strings, or objects with day/text/childIndex/index.
 * @param {Array<string|object>} existingHeadings
 * @param {string} newDay
 * @returns {number}
 */
function findChronologicalInsertIndex(existingHeadings, newDay) {
  if (!Array.isArray(existingHeadings) || existingHeadings.length === 0 || !newDay) {
    return -1;
  }
  for (let i = 0; i < existingHeadings.length; i++) {
    const item = existingHeadings[i];
    let headingDay = null;
    let targetIndex = i;

    if (typeof item === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(item)) {
        headingDay = item;
      } else {
        headingDay = parseDiaryHeading(item);
      }
    } else if (item && typeof item === 'object') {
      if (item.day) {
        headingDay = item.day;
      } else if (item.text) {
        headingDay = parseDiaryHeading(item.text) || (/^\d{4}-\d{2}-\d{2}$/.test(item.text) ? item.text : null);
      } else if (item.heading) {
        headingDay = parseDiaryHeading(item.heading) || (/^\d{4}-\d{2}-\d{2}$/.test(item.heading) ? item.heading : null);
      }
      if (item.childIndex !== undefined) {
        targetIndex = item.childIndex;
      } else if (item.index !== undefined) {
        targetIndex = item.index;
      }
    }

    if (headingDay && headingDay > newDay) {
      return targetIndex;
    }
  }
  return -1;
}

/**
 * Decides whether reminder should be sent.
 * @param {object} params
 * @param {string} params.nowHHMM
 * @param {string} [params.reminderTime]
 * @param {string|null} [params.lastReminderDay]
 * @param {string} params.todayJakarta
 * @param {Array} [params.activeHabits]
 * @param {Array} [params.checkInsToday]
 * @param {object|null} [params.journalEntryToday]
 * @param {Array} [params.subscriptions]
 * @param {string} [params.pushEndpointUrl]
 * @returns {{ shouldSend: boolean, body: string, reason?: string }}
 */
function decideReminder({
  nowHHMM,
  reminderTime,
  lastReminderDay,
  todayJakarta,
  activeHabits,
  checkInsToday,
  journalEntryToday,
  subscriptions,
  pushEndpointUrl
}) {
  if (!pushEndpointUrl || typeof pushEndpointUrl !== 'string' || pushEndpointUrl.trim() === '') {
    return { shouldSend: false, body: '', reason: 'NO_ENDPOINT' };
  }
  if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
    return { shouldSend: false, body: '', reason: 'NO_SUBSCRIPTIONS' };
  }
  const effectiveReminderTime = reminderTime && String(reminderTime).trim() !== '' ? String(reminderTime).trim() : '20:00';
  if (nowHHMM < effectiveReminderTime) {
    return { shouldSend: false, body: '', reason: 'BEFORE_REMINDER_TIME' };
  }
  if (lastReminderDay && lastReminderDay === todayJakarta) {
    return { shouldSend: false, body: '', reason: 'ALREADY_SENT_TODAY' };
  }

  // Active habits
  const habitsList = Array.isArray(activeHabits) ? activeHabits : [];
  const habits = habitsList.filter(h => h && h.archived !== true && h.archived !== 'TRUE');

  // Check-ins today
  const checkInsList = Array.isArray(checkInsToday) ? checkInsToday : [];
  const checkedInHabitIds = new Set(
    checkInsList
      .filter(c => c && c.deleted !== true && c.deleted !== 'TRUE')
      .map(c => c.habitId)
  );

  const habitsLeft = habits.filter(h => !checkedInHabitIds.has(h.id)).length;

  // Journal entry today
  const journalWritten = Boolean(
    journalEntryToday &&
    journalEntryToday.content &&
    typeof journalEntryToday.content === 'string' &&
    journalEntryToday.content.trim() !== ''
  );
  const journalLeft = !journalWritten;

  if (habitsLeft === 0 && !journalLeft) {
    return { shouldSend: false, body: '', reason: 'ALL_COMPLETED' };
  }

  const habitText = habitsLeft === 1 ? '1 habit left' : `${habitsLeft} habits left`;
  let body = '';
  if (habitsLeft > 0 && journalLeft) {
    body = `${habitText} · Journal not written yet`;
  } else if (habitsLeft > 0) {
    body = habitText;
  } else {
    body = 'Journal not written yet';
  }

  return { shouldSend: true, body };
}

/**
 * Helper to get record key
 */
function getRecordKey(rec) {
  if (!rec) return '';
  if (rec.key !== undefined) return String(rec.key);
  if (rec.day !== undefined && rec.habitId === undefined) return String(rec.day);
  if (rec.id !== undefined) return String(rec.id);
  return '';
}

/**
 * Helper to check if record is journal entry
 */
function isJournalRecord(rec) {
  if (!rec) return false;
  return (rec.day !== undefined && rec.habitId === undefined) || rec.printedToDiaryAt !== undefined || rec.content !== undefined;
}

/**
 * Compares records by key. If incoming.updatedAt > existing.updatedAt (or new), write with serverUpdatedAt = nowMonotonic.
 * If existing JournalEntry has printedToDiaryAt !== '', reject with reason: 'LOCKED'.
 * @param {Array|object} existingRecords
 * @param {Array|object} incomingRecords
 * @param {string} nowMonotonic
 * @returns {Array|object}
 */
function mergeRecordsLWW(existingRecords, incomingRecords, nowMonotonic, todayJakarta) {
  if (!Array.isArray(incomingRecords)) {
    const merged = {};
    const updated = {};
    const rejected = [];
    const stores = ['habits', 'checkIns', 'journalEntries', 'settings', 'activities'];
    for (const store of stores) {
      const exList = (existingRecords && existingRecords[store]) || [];
      const inList = (incomingRecords && incomingRecords[store]) || [];
      const res = mergeRecordsLWW(exList, inList, nowMonotonic, todayJakarta);
      merged[store] = res.merged || res;
      updated[store] = res.updated || [];
      if (res.rejected && res.rejected.length > 0) {
        rejected.push(...res.rejected);
      }
    }
    return { merged, updated, rejected };
  }

  const existingMap = new Map();
  if (Array.isArray(existingRecords)) {
    for (const rec of existingRecords) {
      const key = getRecordKey(rec);
      if (key) existingMap.set(key, { ...rec });
    }
  }

  const resultMap = new Map(existingMap);
  const updatedList = [];
  const rejected = [];

  for (const incoming of incomingRecords) {
    const key = getRecordKey(incoming);
    if (!key) continue;
    const existing = existingMap.get(key);
    const isJournal = isJournalRecord(incoming) || isJournalRecord(existing);

    if (isJournal && existing && existing.printedToDiaryAt && String(existing.printedToDiaryAt).trim() !== '') {
      const today = todayJakarta !== undefined
        ? todayJakarta
        : (typeof getTodayJakarta === 'function' ? getTodayJakarta() : '');
      if (!today || key < today) {
        rejected.push({
          type: 'journalEntries',
          key: key,
          reason: 'LOCKED'
        });
        continue;
      }
    }

    if (!existing || !existing.updatedAt || (incoming.updatedAt && incoming.updatedAt > existing.updatedAt)) {
      const toWrite = {
        ...incoming,
        serverUpdatedAt: nowMonotonic
      };
      if (isJournal) {
        toWrite.printedToDiaryAt = existing ? (existing.printedToDiaryAt || '') : '';
      }
      resultMap.set(key, toWrite);
      updatedList.push(toWrite);
    }
  }

  const mergedList = Array.from(resultMap.values());
  mergedList.merged = mergedList;
  mergedList.records = mergedList;
  mergedList.updated = updatedList;
  mergedList.rejected = rejected;

  return mergedList;
}

// ==========================================
// Time & Helpers
// ==========================================

function getTodayJakarta() {
  const now = new Date();
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
}

function getNowHHMMJakarta() {
  const now = new Date();
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(now, 'Asia/Jakarta', 'HH:mm');
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now);
}

function getMonotonicNow() {
  const props = PropertiesService.getScriptProperties();
  const lastNow = props.getProperty('LAST_SERVER_NOW') || '';
  let now = new Date().toISOString();
  if (lastNow && now <= lastNow) {
    const nextMs = new Date(lastNow).getTime() + 1;
    now = new Date(nextMs).toISOString();
  }
  props.setProperty('LAST_SERVER_NOW', now);
  return now;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 1), Math.max(sheet.getMaxColumns(), headers.length)).setNumberFormat('@');
  }
  return sheet;
}

// ==========================================
// Sheet Data Readers
// ==========================================

function readAllHabits(sheet) {
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    list.push({
      id: String(row[0]),
      name: String(row[1] || ''),
      sortOrder: Number(row[2]) || 0,
      archived: row[3] === 'TRUE' || row[3] === true,
      createdAt: String(row[4] || ''),
      updatedAt: String(row[5] || ''),
      serverUpdatedAt: String(row[6] || '')
    });
  }
  return list;
}

function readAllCheckIns(sheet) {
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    list.push({
      id: String(row[0]),
      habitId: String(row[1] || ''),
      day: String(row[2] || ''),
      deleted: row[3] === 'TRUE' || row[3] === true,
      updatedAt: String(row[4] || ''),
      serverUpdatedAt: String(row[5] || '')
    });
  }
  return list;
}

function readAllJournalEntries(sheet) {
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    list.push({
      day: String(row[0]),
      content: String(row[1] || ''),
      updatedAt: String(row[2] || ''),
      printedToDiaryAt: String(row[3] || ''),
      serverUpdatedAt: String(row[4] || '')
    });
  }
  return list;
}

function readAllSettings(sheet) {
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    list.push({
      key: String(row[0]),
      value: String(row[1] || ''),
      updatedAt: String(row[2] || ''),
      serverUpdatedAt: String(row[3] || '')
    });
  }
  return list;
}

function readAllActivities(sheet) {
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    list.push({
      id: String(row[0]),
      title: String(row[1] || ''),
      author: String(row[2] || ''),
      type: String(row[3] || ''),
      status: String(row[4] || ''),
      totalPages: Number(row[5]) || 0,
      summary: String(row[6] || ''),
      archived: row[7] === 'TRUE' || row[7] === true,
      createdAt: String(row[8] || ''),
      updatedAt: String(row[9] || ''),
      serverUpdatedAt: String(row[10] || '')
    });
  }
  return list;
}

function readAllPushSubscriptions(sheet) {
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    list.push({
      deviceId: String(row[0]),
      endpoint: String(row[1] || ''),
      p256dh: String(row[2] || ''),
      auth: String(row[3] || ''),
      createdAt: String(row[4] || '')
    });
  }
  return list;
}

// ==========================================
// Sync Helpers
// ==========================================

function syncHabits(sheet, incomingHabits, nowMonotonic) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || SCHEMA.Habits;
  const rowMap = new Map();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) rowMap.set(String(data[i][0]), i);
  }

  for (const habit of incomingHabits) {
    const id = String(habit.id);
    if (!id) continue;
    const rowIndex = rowMap.get(id);
    if (rowIndex !== undefined) {
      const existingUpdatedAt = String(data[rowIndex][5] || '');
      if (!existingUpdatedAt || (habit.updatedAt && habit.updatedAt > existingUpdatedAt)) {
        data[rowIndex][1] = habit.name;
        data[rowIndex][2] = Number(habit.sortOrder) || 0;
        data[rowIndex][3] = habit.archived ? 'TRUE' : 'FALSE';
        data[rowIndex][4] = habit.createdAt;
        data[rowIndex][5] = habit.updatedAt;
        data[rowIndex][6] = nowMonotonic;
      }
    } else {
      const newRow = [
        id,
        habit.name,
        Number(habit.sortOrder) || 0,
        habit.archived ? 'TRUE' : 'FALSE',
        habit.createdAt,
        habit.updatedAt,
        nowMonotonic
      ];
      data.push(newRow);
      rowMap.set(id, data.length - 1);
    }
  }
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
  sheet.getRange(1, 1, data.length, headers.length).setNumberFormat('@');
}

function syncCheckIns(sheet, incomingCheckIns, nowMonotonic) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || SCHEMA.Check_Ins;
  const rowMap = new Map();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) rowMap.set(String(data[i][0]), i);
  }

  for (const checkIn of incomingCheckIns) {
    const id = String(checkIn.id);
    if (!id) continue;
    const rowIndex = rowMap.get(id);
    if (rowIndex !== undefined) {
      const existingUpdatedAt = String(data[rowIndex][4] || '');
      if (!existingUpdatedAt || (checkIn.updatedAt && checkIn.updatedAt > existingUpdatedAt)) {
        data[rowIndex][1] = checkIn.habitId;
        data[rowIndex][2] = checkIn.day;
        data[rowIndex][3] = checkIn.deleted ? 'TRUE' : 'FALSE';
        data[rowIndex][4] = checkIn.updatedAt;
        data[rowIndex][5] = nowMonotonic;
      }
    } else {
      const newRow = [
        id,
        checkIn.habitId,
        checkIn.day,
        checkIn.deleted ? 'TRUE' : 'FALSE',
        checkIn.updatedAt,
        nowMonotonic
      ];
      data.push(newRow);
      rowMap.set(id, data.length - 1);
    }
  }
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
  sheet.getRange(1, 1, data.length, headers.length).setNumberFormat('@');
}

function syncJournalEntries(sheet, incomingJournalEntries, nowMonotonic) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || SCHEMA.Journal_Entries;
  const rowMap = new Map();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) rowMap.set(String(data[i][0]), i);
  }

  const todayJakarta = getTodayJakarta();
  const rejected = [];
  for (const entry of incomingJournalEntries) {
    const day = String(entry.day);
    if (!day) continue;
    const rowIndex = rowMap.get(day);
    if (rowIndex !== undefined) {
      const printedToDiaryAt = String(data[rowIndex][3] || '');
      if (day < todayJakarta && printedToDiaryAt.trim() !== '') {
        rejected.push({
          type: 'journalEntries',
          key: day,
          reason: 'LOCKED'
        });
        continue;
      }
      const existingUpdatedAt = String(data[rowIndex][2] || '');
      if (!existingUpdatedAt || (entry.updatedAt && entry.updatedAt > existingUpdatedAt)) {
        data[rowIndex][1] = entry.content || '';
        data[rowIndex][2] = entry.updatedAt;
        data[rowIndex][4] = nowMonotonic;
      }
    } else {
      const newRow = [
        day,
        entry.content || '',
        entry.updatedAt,
        '',
        nowMonotonic
      ];
      data.push(newRow);
      rowMap.set(day, data.length - 1);
    }
  }
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
  sheet.getRange(1, 1, data.length, headers.length).setNumberFormat('@');
  return rejected;
}

function syncSettings(sheet, incomingSettings, nowMonotonic) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || SCHEMA.Settings;
  const rowMap = new Map();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) rowMap.set(String(data[i][0]), i);
  }

  for (const setting of incomingSettings) {
    const key = String(setting.key);
    if (!key) continue;
    const rowIndex = rowMap.get(key);
    if (rowIndex !== undefined) {
      const existingUpdatedAt = String(data[rowIndex][2] || '');
      if (!existingUpdatedAt || (setting.updatedAt && setting.updatedAt > existingUpdatedAt)) {
        data[rowIndex][1] = String(setting.value ?? '');
        data[rowIndex][2] = setting.updatedAt;
        data[rowIndex][3] = nowMonotonic;
      }
    } else {
      const newRow = [
        key,
        String(setting.value ?? ''),
        setting.updatedAt,
        nowMonotonic
      ];
      data.push(newRow);
      rowMap.set(key, data.length - 1);
    }
  }
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
  sheet.getRange(1, 1, data.length, headers.length).setNumberFormat('@');
}

function syncActivities(sheet, incomingActivities, nowMonotonic) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || SCHEMA.Activities;
  const rowMap = new Map();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) rowMap.set(String(data[i][0]), i);
  }

  for (const act of incomingActivities) {
    const id = String(act.id);
    if (!id) continue;
    const existingIndex = rowMap.get(id);

    if (existingIndex !== undefined) {
      const existingUpdatedAt = String(data[existingIndex][9] || '');
      if (!existingUpdatedAt || (act.updatedAt && act.updatedAt > existingUpdatedAt)) {
        data[existingIndex][1] = act.title !== undefined ? act.title : data[existingIndex][1];
        data[existingIndex][2] = act.author !== undefined ? act.author : data[existingIndex][2];
        data[existingIndex][3] = act.type !== undefined ? act.type : data[existingIndex][3];
        data[existingIndex][4] = act.status !== undefined ? act.status : data[existingIndex][4];
        data[existingIndex][5] = act.totalPages !== undefined ? act.totalPages : data[existingIndex][5];
        data[existingIndex][6] = act.summary !== undefined ? act.summary : data[existingIndex][6];
        data[existingIndex][7] = act.archived ? 'TRUE' : 'FALSE';
        data[existingIndex][8] = act.createdAt !== undefined ? act.createdAt : data[existingIndex][8];
        data[existingIndex][9] = act.updatedAt;
        data[existingIndex][10] = nowMonotonic;
      }
    } else {
      const newRow = [
        id,
        act.title || '',
        act.author || '',
        act.type || '',
        act.status || '',
        act.totalPages !== undefined ? act.totalPages : 0,
        act.summary || '',
        act.archived ? 'TRUE' : 'FALSE',
        act.createdAt || '',
        act.updatedAt || '',
        nowMonotonic
      ];
      data.push(newRow);
      rowMap.set(id, data.length - 1);
    }
  }
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
  sheet.getRange(1, 1, data.length, headers.length).setNumberFormat('@');
}

function collectChanges(ss, since) {
  const habitsSheet = ss.getSheetByName('Habits');
  const checkInsSheet = ss.getSheetByName('Check_Ins');
  const journalSheet = ss.getSheetByName('Journal_Entries');
  const settingsSheet = ss.getSheetByName('Settings');
  const activitiesSheet = ss.getSheetByName('Activities');

  const habits = habitsSheet ? readAllHabits(habitsSheet) : [];
  const checkIns = checkInsSheet ? readAllCheckIns(checkInsSheet) : [];
  const journalEntries = journalSheet ? readAllJournalEntries(journalSheet) : [];
  const settings = settingsSheet ? readAllSettings(settingsSheet) : [];
  const activities = activitiesSheet ? readAllActivities(activitiesSheet) : [];

  const filterSince = (rec) => !since || (rec.serverUpdatedAt && rec.serverUpdatedAt > since);

  return {
    habits: habits.filter(filterSince),
    checkIns: checkIns.filter(filterSince),
    journalEntries: journalEntries.filter(filterSince),
    settings: settings.filter(filterSince),
    activities: activities.filter(filterSince)
  };
}
// ==========================================
// Push Subscription Helpers
// ==========================================

function handleSubscribePush(ss, deviceId, subscription) {
  if (!deviceId) {
    return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing deviceId' });
  }
  if (!subscription || !subscription.endpoint) {
    return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing subscription or endpoint' });
  }
  const sheet = getOrCreateSheet(ss, 'Push_Subscriptions', SCHEMA.Push_Subscriptions);
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === deviceId) {
      rowIndex = i;
      break;
    }
  }

  const endpoint = subscription.endpoint;
  const p256dh = (subscription.keys && subscription.keys.p256dh) || subscription.p256dh || '';
  const auth = (subscription.keys && subscription.keys.auth) || subscription.auth || '';
  const now = new Date().toISOString();

  if (rowIndex !== -1) {
    data[rowIndex][1] = endpoint;
    data[rowIndex][2] = p256dh;
    data[rowIndex][3] = auth;
    sheet.getRange(rowIndex + 1, 1, 1, 5).setValues([[deviceId, endpoint, p256dh, auth, data[rowIndex][4] || now]]);
  } else {
    data.push([deviceId, endpoint, p256dh, auth, now]);
    sheet.getRange(1, 1, data.length, 5).setValues(data);
    sheet.getRange(1, 1, data.length, 5).setNumberFormat('@');
  }
  return createJsonResponse({ ok: true });
}

function handleUnsubscribePush(ss, deviceId) {
  if (!deviceId) {
    return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing deviceId' });
  }
  const sheet = ss.getSheetByName('Push_Subscriptions');
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === deviceId) {
        sheet.deleteRow(i + 1);
      }
    }
  }
  return createJsonResponse({ ok: true });
}

function handleTestPush(ss, deviceId, props) {
  if (!deviceId) {
    return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing deviceId' });
  }
  const sheet = ss.getSheetByName('Push_Subscriptions');
  if (!sheet) {
    return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'No subscriptions found' });
  }
  const subs = readAllPushSubscriptions(sheet);
  const sub = subs.find(s => s.deviceId === deviceId);
  if (!sub) {
    return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Subscription not found for device' });
  }

  const pushEndpointUrl = props.getProperty('PUSH_ENDPOINT_URL');
  const pushSecret = props.getProperty('PUSH_SHARED_SECRET');
  if (!pushEndpointUrl) {
    return createJsonResponse({ ok: false, error: 'INTERNAL', message: 'PUSH_ENDPOINT_URL not configured' });
  }

  try {
    const resp = UrlFetchApp.fetch(pushEndpointUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-push-secret': pushSecret || ''
      },
      payload: JSON.stringify({
        subscriptions: [{
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }],
        notification: {
          title: 'Habbit',
          body: 'Test notification from Habbit',
          url: '/?tab=today'
        }
      }),
      muteHttpExceptions: true
    });

    const resJson = JSON.parse(resp.getContentText() || '{}');
    return createJsonResponse({
      ok: true,
      results: resJson.results || []
    });
  } catch (err) {
    return createJsonResponse({
      ok: false,
      error: 'INTERNAL',
      message: 'Failed to send test push: ' + err.message
    });
  }
}

// ==========================================
// Diary Helpers
// ==========================================

function getOrCreateDiaryDoc(folder, year, props) {
  const propKey = 'DIARY_DOC_' + year;
  const docId = props.getProperty(propKey);
  let doc = null;
  if (docId) {
    try {
      doc = DocumentApp.openById(docId);
    } catch (e) {
      doc = null;
    }
  }
  if (!doc) {
    const docName = 'Habbit – Diary ' + year;
    const files = folder.getFilesByName(docName);
    if (files.hasNext()) {
      const file = files.next();
      doc = DocumentApp.openById(file.getId());
      props.setProperty(propKey, file.getId());
    } else {
      doc = DocumentApp.create(docName);
      DriveApp.getFileById(doc.getId()).moveTo(folder);
      props.setProperty(propKey, doc.getId());
    }
  }
  return doc;
}

function writeEntryParagraphs(body, startIndex, lines) {
  let pos = startIndex;
  for (const line of lines) {
    const p = pos === -1 ? body.appendParagraph(line) : body.insertParagraph(pos++, line);
    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  }
  const blank = pos === -1 ? body.appendParagraph('') : body.insertParagraph(pos++, '');
  blank.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  return pos;
}

function insertEntryIntoDoc(doc, entry) {
  const body = doc.getBody();
  const existingHeadings = [];
  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      const p = child.asParagraph();
      if (p.getHeading() === DocumentApp.ParagraphHeading.HEADING_2) {
        const headingDay = parseDiaryHeading(p.getText());
        if (headingDay) {
          existingHeadings.push({ day: headingDay, childIndex: i });
        }
      }
    }
  }

  const existingIndex = existingHeadings.findIndex(h => h.day === entry.day);
  const hasContent = entry.content && String(entry.content).trim() !== '';

  if (existingIndex !== -1) {
    const currentHeading = existingHeadings[existingIndex];
    const nextHeading = existingHeadings[existingIndex + 1];
    const endIndex = nextHeading ? nextHeading.childIndex : body.getNumChildren();

    if (!hasContent) {
      // Content cleared: remove heading and all following paragraphs for this entry
      for (let i = endIndex - 1; i >= currentHeading.childIndex; i--) {
        if (body.getNumChildren() > 1) {
          body.removeChild(body.getChild(i));
        } else {
          const blank = body.appendParagraph('');
          blank.setHeading(DocumentApp.ParagraphHeading.NORMAL);
          body.removeChild(body.getChild(i));
        }
      }
      return;
    }

    // Content updated: remove previous body paragraphs and insert updated content
    for (let i = endIndex - 1; i > currentHeading.childIndex; i--) {
      body.removeChild(body.getChild(i));
    }

    const lines = (entry.content || '').split('\n');
    writeEntryParagraphs(body, currentHeading.childIndex + 1, lines);
    return;
  }

  // Not in doc yet: if no content, do not insert empty section
  if (!hasContent) {
    return;
  }

  const insertIndex = findChronologicalInsertIndex(existingHeadings, entry.day);
  const headingText = formatDiaryHeading(entry.day);
  const lines = (entry.content || '').split('\n');

  if (insertIndex === -1) {
    const h2 = body.appendParagraph(headingText);
    h2.setHeading(DocumentApp.ParagraphHeading.HEADING_2);
    writeEntryParagraphs(body, -1, lines);
  } else {
    let pos = insertIndex;
    const h2 = body.insertParagraph(pos++, headingText);
    h2.setHeading(DocumentApp.ParagraphHeading.HEADING_2);
    writeEntryParagraphs(body, pos, lines);
  }
}

const upsertEntryInDoc = insertEntryIntoDoc;

function updateJournalEntryInSheet(sheet, entry) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === entry.day) {
      data[i][1] = entry.content || '';
      data[i][2] = entry.updatedAt;
      data[i][3] = entry.printedToDiaryAt || '';
      data[i][4] = entry.serverUpdatedAt || '';
      sheet.getRange(i + 1, 1, 1, 5).setValues([[
        entry.day,
        entry.content || '',
        entry.updatedAt,
        entry.printedToDiaryAt || '',
        entry.serverUpdatedAt || ''
      ]]);
      return;
    }
  }
}

function deletePushSubscriptionsByEndpoints(sheet, deadEndpoints) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const endpoint = data[i][1];
    if (deadEndpoints.has(endpoint)) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ==========================================
// GAS Action Handlers
// ==========================================

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'habbit' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let payload = {};
  try {
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (typeof e === 'object' && e !== null && !e.postData) {
      payload = e;
    } else {
      return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing request body' });
    }
  } catch (err) {
    return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON payload' });
  }

  const cache = CacheService.getScriptCache();
  const lockout = cache.get('RL_LOCKOUT');
  if (lockout) {
    return createJsonResponse({
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Too many failed attempts. Locked out for 10 minutes.'
    });
  }

  const props = PropertiesService.getScriptProperties();
  const configuredPin = props.getProperty('PIN');

  // Check PIN
  if (!configuredPin || payload.pin !== configuredPin) {
    const failCountStr = cache.get('RL_FAIL_COUNT');
    const failCount = (failCountStr ? parseInt(failCountStr, 10) : 0) + 1;
    if (failCount > 10) {
      cache.put('RL_LOCKOUT', '1', 600);
      cache.remove('RL_FAIL_COUNT');
      return createJsonResponse({
        ok: false,
        error: 'RATE_LIMITED',
        message: 'Too many failed attempts. Locked out for 10 minutes.'
      });
    } else {
      cache.put('RL_FAIL_COUNT', String(failCount), 600);
      return createJsonResponse({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid PIN'
      });
    }
  }

  // Clear fail count on successful PIN
  cache.remove('RL_FAIL_COUNT');

  const action = payload.action;
  if (!action) {
    return createJsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing action' });
  }

  const lock = LockService.getScriptLock();
  let hasLock = false;
  try {
    hasLock = lock.waitLock(20000);
  } catch (err) {
    hasLock = false;
  }
  if (!hasLock && typeof lock.hasLock === 'function' && !lock.hasLock()) {
    return createJsonResponse({
      ok: false,
      error: 'INTERNAL',
      message: 'Could not acquire script lock'
    });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case 'ping':
        return createJsonResponse({
          ok: true,
          serverTime: new Date().toISOString(),
          timeZone: 'Asia/Jakarta'
        });

      case 'sync': {
        const serverNow = getMonotonicNow();
        const incoming = payload.changes || {};
        const incomingHabits = incoming.habits || [];
        const incomingCheckIns = incoming.checkIns || [];
        const incomingJournal = incoming.journalEntries || [];
        const incomingSettings = incoming.settings || [];
        const incomingActivities = incoming.activities || [];

        const habitsSheet = getOrCreateSheet(ss, 'Habits', SCHEMA.Habits);
        const checkInsSheet = getOrCreateSheet(ss, 'Check_Ins', SCHEMA.Check_Ins);
        const journalSheet = getOrCreateSheet(ss, 'Journal_Entries', SCHEMA.Journal_Entries);
        const settingsSheet = getOrCreateSheet(ss, 'Settings', SCHEMA.Settings);
        const activitiesSheet = getOrCreateSheet(ss, 'Activities', SCHEMA.Activities);

        syncHabits(habitsSheet, incomingHabits, serverNow);
        syncCheckIns(checkInsSheet, incomingCheckIns, serverNow);
        const rejected = syncJournalEntries(journalSheet, incomingJournal, serverNow);
        syncSettings(settingsSheet, incomingSettings, serverNow);
        syncActivities(activitiesSheet, incomingActivities, serverNow);
        const changes = collectChanges(ss, payload.since);

        return createJsonResponse({
          ok: true,
          cursor: serverNow,
          changes,
          rejected
        });
      }

      case 'subscribePush':
        return handleSubscribePush(ss, payload.deviceId, payload.subscription);

      case 'unsubscribePush':
        return handleUnsubscribePush(ss, payload.deviceId);

      case 'testPush':
        return handleTestPush(ss, payload.deviceId, props);

      default:
        return createJsonResponse({
          ok: false,
          error: 'BAD_REQUEST',
          message: 'Unknown action: ' + action
        });
    }
  } catch (err) {
    return createJsonResponse({
      ok: false,
      error: 'INTERNAL',
      message: err.message || 'Internal server error'
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  for (const sheetName of Object.keys(SCHEMA)) {
    const headers = SCHEMA[sheetName];
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const maxRows = Math.max(sheet.getMaxRows(), 1);
    const maxCols = Math.max(sheet.getMaxColumns(), headers.length);
    sheet.getRange(1, 1, maxRows, maxCols).setNumberFormat('@');
  }

  const props = PropertiesService.getScriptProperties();

  // Folder 'Habbit Diary'
  let folderId = props.getProperty('DIARY_FOLDER_ID');
  let folder = null;
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      folder = null;
    }
  }
  if (!folder) {
    const folders = DriveApp.getFoldersByName('Habbit Diary');
    if (folders.hasNext()) {
      folder = folders.next();
      folderId = folder.getId();
    } else {
      folder = DriveApp.createFolder('Habbit Diary');
      folderId = folder.getId();
    }
    props.setProperty('DIARY_FOLDER_ID', folderId);
  }

  // PUSH_SHARED_SECRET
  let secret = props.getProperty('PUSH_SHARED_SECRET');
  if (!secret) {
    if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
      secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    } else {
      secret = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    props.setProperty('PUSH_SHARED_SECRET', secret);
    if (typeof Logger !== 'undefined') {
      Logger.log('Generated PUSH_SHARED_SECRET: ' + secret);
    }
  }

  // Triggers
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    const t = triggers[i];
    const handler = t.getHandlerFunction();
    if (handler === 'printDiary' || handler === 'checkReminder') {
      ScriptApp.deleteTrigger(t);
    }
  }

  ScriptApp.newTrigger('printDiary')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  ScriptApp.newTrigger('checkReminder')
    .timeBased()
    .everyMinutes(10)
    .create();

  if (typeof Logger !== 'undefined') {
    Logger.log('Habbit setup completed successfully.');
  }
}

function syncDiaryEntries(ss, props, options) {
  const lock = LockService.getScriptLock();
  let hasLock = false;
  try {
    hasLock = lock.waitLock(10000);
  } catch (err) {
    hasLock = false;
  }
  if (!hasLock) {
    if (typeof Logger !== 'undefined') {
      Logger.log('syncDiaryEntries: could not obtain script lock; skipping run');
    }
    return;
  }

  try {
    const includeToday = options && options.includeToday !== undefined ? options.includeToday : true;
    const folderId = props.getProperty('DIARY_FOLDER_ID');
    if (!folderId) {
      if (typeof Logger !== 'undefined') Logger.log('DIARY_FOLDER_ID not set');
      return;
    }
    let folder = null;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (err) {
      if (typeof Logger !== 'undefined') Logger.log('Failed to access DIARY_FOLDER_ID: ' + err.message);
      return;
    }
    if (!folder) return;

    const sheet = ss.getSheetByName('Journal_Entries');
    if (!sheet) return;

    const todayJakarta = getTodayJakarta();
    const entries = readAllJournalEntries(sheet);
    const toExport = entries.filter(e => {
      if (e.day > todayJakarta) return false;
      if (!includeToday && e.day === todayJakarta) return false;
      const notPrinted = !e.printedToDiaryAt || String(e.printedToDiaryAt).trim() === '';
      const hasContent = e.content && String(e.content).trim() !== '';
      if (notPrinted) {
        return hasContent;
      }
      return Boolean(e.serverUpdatedAt && e.serverUpdatedAt > e.printedToDiaryAt);
    });

    toExport.sort((a, b) => a.day.localeCompare(b.day));

    // Group entries by year to batch Doc open/save operations
    const entriesByYear = new Map();
    for (const entry of toExport) {
      const year = entry.day.slice(0, 4);
      if (!entriesByYear.has(year)) entriesByYear.set(year, []);
      entriesByYear.get(year).push(entry);
    }

    for (const [year, entriesForYear] of entriesByYear) {
      try {
        const doc = getOrCreateDiaryDoc(folder, year, props);
        for (const entry of entriesForYear) {
          insertEntryIntoDoc(doc, entry);
        }
        doc.saveAndClose();

        const serverNow = getMonotonicNow();
        for (const entry of entriesForYear) {
          entry.printedToDiaryAt = serverNow;
          entry.serverUpdatedAt = serverNow;
          updateJournalEntryInSheet(sheet, entry);
        }
      } catch (err) {
        if (typeof Logger !== 'undefined') {
          Logger.log('Error exporting Journal Entries for year ' + year + ': ' + err.message);
        }
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function printDiary() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  syncDiaryEntries(ss, props, { includeToday: false });
}

function checkReminder() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Auto-sync journal entries to Google Doc (10-minute background cycle)
  try {
    syncDiaryEntries(ss, props, { includeToday: true });
  } catch (err) {
    if (typeof Logger !== 'undefined') {
      Logger.log('Error auto-syncing diary in checkReminder: ' + err.message);
    }
  }

  const pushEndpointUrl = props.getProperty('PUSH_ENDPOINT_URL') || '';
  const pushSharedSecret = props.getProperty('PUSH_SHARED_SECRET') || '';
  const lastReminderDay = props.getProperty('LAST_REMINDER_DAY') || '';
  const todayJakarta = getTodayJakarta();
  const nowHHMM = getNowHHMMJakarta();
  const settingsSheet = ss.getSheetByName('Settings');
  let reminderTime = '20:00';
  if (settingsSheet) {
    const settings = readAllSettings(settingsSheet);
    const rt = settings.find(s => s.key === 'reminderTime');
    if (rt && rt.value && rt.value.trim() !== '') {
      reminderTime = rt.value.trim();
    }
  }

  const pushSheet = ss.getSheetByName('Push_Subscriptions');
  const subscriptions = pushSheet ? readAllPushSubscriptions(pushSheet) : [];

  const habitsSheet = ss.getSheetByName('Habits');
  const habits = habitsSheet ? readAllHabits(habitsSheet) : [];
  const activeHabits = habits.filter(h => !h.archived);

  const checkInsSheet = ss.getSheetByName('Check_Ins');
  const checkIns = checkInsSheet ? readAllCheckIns(checkInsSheet) : [];
  const checkInsToday = checkIns.filter(c => c.day === todayJakarta && !c.deleted);

  const journalSheet = ss.getSheetByName('Journal_Entries');
  const journalEntries = journalSheet ? readAllJournalEntries(journalSheet) : [];
  const journalEntryToday = journalEntries.find(j => j.day === todayJakarta);

  const decision = decideReminder({
    nowHHMM,
    reminderTime,
    lastReminderDay,
    todayJakarta,
    activeHabits,
    checkInsToday,
    journalEntryToday,
    subscriptions,
    pushEndpointUrl
  });

  if (!decision.shouldSend) {
    if (decision.reason === 'ALL_COMPLETED') {
      props.setProperty('LAST_REMINDER_DAY', todayJakarta);
    }
    return;
  }

  // Send push
  const subsPayload = subscriptions.map(s => ({
    endpoint: s.endpoint,
    keys: {
      p256dh: s.p256dh,
      auth: s.auth
    }
  }));

  try {
    const response = UrlFetchApp.fetch(pushEndpointUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-push-secret': pushSharedSecret
      },
      payload: JSON.stringify({
        subscriptions: subsPayload,
        notification: {
          title: 'Habbit',
          body: decision.body,
          url: '/?tab=today'
        }
      }),
      muteHttpExceptions: true
    });

    const resJson = JSON.parse(response.getContentText() || '{}');
    const results = resJson.results || [];

    const deadEndpoints = new Set(
      results
        .filter(r => r.statusCode === 404 || r.statusCode === 410)
        .map(r => r.endpoint)
    );

    if (deadEndpoints.size > 0 && pushSheet) {
      deletePushSubscriptionsByEndpoints(pushSheet, deadEndpoints);
    }

    props.setProperty('LAST_REMINDER_DAY', todayJakarta);
  } catch (err) {
    if (typeof Logger !== 'undefined') {
      Logger.log('Error sending reminder push: ' + err.message);
    }
  }
}

// Export for Node/Vitest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DAYS,
    MONTHS,
    SCHEMA,
    formatDiaryHeading,
    parseDiaryHeading,
    findChronologicalInsertIndex,
    decideReminder,
    mergeRecordsLWW,
    getTodayJakarta,
    getNowHHMMJakarta,
    getMonotonicNow,
    createJsonResponse,
    getOrCreateSheet,
    readAllHabits,
    readAllCheckIns,
    readAllJournalEntries,
    readAllSettings,
    readAllPushSubscriptions,
    syncHabits,
    syncCheckIns,
    syncJournalEntries,
    syncSettings,
    syncActivities,
    readAllActivities,
    collectChanges,
    handleSubscribePush,
    handleUnsubscribePush,
    handleTestPush,
    getOrCreateDiaryDoc,
    insertEntryIntoDoc,
    upsertEntryInDoc,
    updateJournalEntryInSheet,
    deletePushSubscriptionsByEndpoints,
    doGet,
    doPost,
    setup,
    printDiary,
    checkReminder,
    syncDiaryEntries
  };
}
