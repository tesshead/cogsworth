/**
 * Cogsworth API — Google Apps Script web app bound to the scheduling Sheet.
 * See docs/design.md §5 and apps-script/README.md.
 *
 * Every request is a POST with a text/plain body containing JSON:
 *   { action: 'load', key }
 *   { action: 'save', key, updatedBy, changes: [...] }
 *   { action: 'review', key, activityIds: [...] }
 * Every response is HTTP 200 with { ok: true, ... } or { ok: false, error: { code, message } }.
 *
 * This file only stores data. It never enforces scheduling rules (those are warnings,
 * computed by the app).
 *
 * @OnlyCurrentDoc
 */

var TABS = {
  activities: 'Scheduler_Activities',
  locations: 'Scheduler_Locations',
  schedule: 'Scheduler_Schedule',
  // Read-only: watched for offer changes. Only the columns below ever leave the Sheet
  // (never contacts or fees).
  acceptances: 'Acceptances',
};

var ACCEPTANCE_COLUMNS = {
  name: 'performerstagename',
  offer: 'offer',
  days_agreed: 'daysagreed',
  confirmed: 'confirmed',
};

var REVIEW_HEADERS = ['acceptance', 'reviewed_offer', 'reviewed_days'];

var SCHEDULE_HEADERS = [
  'id', 'activity_id', 'day', 'performance_no', 'location_id', 'start_time',
  'duration_min', 'locked', 'notes', 'rev', 'updated_at', 'updated_by',
];

var DAYS = ['sat', 'sun'];
var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
var LOCK_WAIT_MS = 10000;

function doPost(e) {
  var request;
  try {
    request = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return respond_(fail_('bad_request', 'Body must be JSON'));
  }
  return respond_(handle_(request));
}

/**
 * Run once from the Apps Script editor (choose it in the function menu, press Run) to create
 * the edit key, or again later to rotate it. The new key appears in the execution log.
 */
function setUpEditKey() {
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('EDIT_KEY', key);
  Logger.log('New edit key (share only with editors): ' + key);
}

/** A GET just confirms the deployment is reachable. It returns no data. */
function doGet() {
  return respond_({ ok: true, service: 'cogsworth' });
}

function handle_(request) {
  try {
    if (!request || typeof request !== 'object') return fail_('bad_request', 'Body must be a JSON object');
    var keyProblem = checkKey_(request.key);
    if (keyProblem) return keyProblem;
    if (request.action === 'load') return load_();
    if (request.action === 'save') return save_(request.changes, request.updatedBy);
    if (request.action === 'review') return review_(request.activityIds);
    return fail_('bad_request', 'Unknown action "' + request.action + '"');
  } catch (err) {
    return fail_('server_error', String((err && err.message) || err));
  }
}

function checkKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('EDIT_KEY');
  if (!expected) return fail_('server_error', 'EDIT_KEY is not set in Script Properties');
  if (typeof key !== 'string' || key !== expected) return fail_('unauthorized', 'Wrong or missing key');
  return null;
}

// ---------------------------------------------------------------------------
// load

function load_() {
  return {
    ok: true,
    serverTime: new Date().toISOString(),
    activities: readTab_(TABS.activities),
    locations: readTab_(TABS.locations),
    schedule: readTab_(TABS.schedule),
    acceptances: readAcceptances_(),
  };
}

/**
 * The Acceptances tab has summary rows above its header, so the header row is found by its
 * "Performer / Stage Name" cell. Returns null if the tab or header is missing.
 */
function readAcceptances_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABS.acceptances);
  if (!sheet) return null;
  var values = sheet.getDataRange().getDisplayValues();
  for (var r = 0; r < values.length; r++) {
    var compact = values[r].map(compactHeader_);
    if (compact.indexOf(ACCEPTANCE_COLUMNS.name) === -1) continue;
    var col = {};
    Object.keys(ACCEPTANCE_COLUMNS).forEach(function (k) {
      col[k] = compact.indexOf(ACCEPTANCE_COLUMNS[k]);
    });
    var rows = [];
    for (var i = r + 1; i < values.length; i++) {
      var row = {};
      Object.keys(col).forEach(function (k) {
        row[k] = col[k] === -1 ? '' : String(values[i][col[k]]).trim();
      });
      if (row.name) rows.push(row);
    }
    return rows;
  }
  return null;
}

/** Rows as { header: displayValue } objects, skipping blank rows. */
function readTab_(name) {
  var values = sheet_(name).getDataRange().getDisplayValues();
  if (values.length === 0) return [];
  var headers = values[0].map(normalizeHeader_);
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    var blank = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = String(values[r][c]).trim();
      row[headers[c]] = v;
      if (v !== '') blank = false;
    }
    if (!blank) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// save

function save_(changes, updatedBy) {
  if (!Array.isArray(changes)) return fail_('bad_request', 'changes must be an array');
  var who = typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim().slice(0, 80) : 'unknown';

  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    var activityIds = idSet_(readTab_(TABS.activities));
    var locationIds = idSet_(readTab_(TABS.locations));
    var table = openSchedule_();
    var now = new Date().toISOString();
    var results = changes.map(function (change) {
      return applyChange_(table, change, activityIds, locationIds, who, now);
    });
    SpreadsheetApp.flush();
    return { ok: true, results: results };
  } finally {
    lock.releaseLock();
  }
}

function applyChange_(table, change, activityIds, locationIds, who, now) {
  var id = change && change.id;
  if (typeof id !== 'string' || !id) return { id: String(id), status: 'error', message: 'Missing id' };
  if (DAYS.indexOf(change.day) === -1) return { id: id, status: 'error', message: 'day must be sat or sun' };
  if (id !== change.activity_id + '-' + change.day + '-' + change.performance_no) {
    return { id: id, status: 'error', message: 'id does not match activity_id/day/performance_no' };
  }
  if (!activityIds[change.activity_id]) return { id: id, status: 'error', message: 'Unknown activity "' + change.activity_id + '"' };

  var current = table.get(id);
  var currentRev = current ? Number(current.rev || 0) : 0;
  if (currentRev !== Number(change.base_rev)) return { id: id, status: 'conflict', row: current };

  if (change['delete'] === true) {
    table.remove(id);
    return { id: id, status: 'ok', row: null };
  }

  var next = current
    ? copy_(current)
    : { id: id, activity_id: change.activity_id, day: change.day, performance_no: String(change.performance_no), locked: 'FALSE', notes: '' };
  var set = change.set || {};
  if (set.location_id !== undefined) {
    if (set.location_id !== null && !locationIds[set.location_id]) {
      return { id: id, status: 'error', message: 'Unknown location "' + set.location_id + '"' };
    }
    next.location_id = set.location_id || '';
  }
  if (set.start_time !== undefined) {
    if (set.start_time !== null && !TIME_RE.test(set.start_time)) return { id: id, status: 'error', message: 'Bad time "' + set.start_time + '"' };
    next.start_time = set.start_time || '';
  }
  if (!next.location_id !== !next.start_time) {
    return { id: id, status: 'error', message: 'location_id and start_time must be set or cleared together' };
  }
  if (set.duration_min !== undefined) {
    if (set.duration_min !== null && !(set.duration_min > 0 && set.duration_min % 1 === 0)) {
      return { id: id, status: 'error', message: 'duration_min must be a positive whole number' };
    }
    next.duration_min = set.duration_min === null ? '' : String(set.duration_min);
  }
  if (set.locked !== undefined) next.locked = set.locked ? 'TRUE' : 'FALSE';
  if (set.notes !== undefined) next.notes = String(set.notes).slice(0, 2000);

  next.rev = String(currentRev + 1);
  next.updated_at = now;
  next.updated_by = who;
  table.put(next);
  return { id: id, status: 'ok', row: copy_(next) };
}

// ---------------------------------------------------------------------------
// review

/**
 * Marks activities as reviewed against Acceptances: copies the current offer text and agreed
 * days into reviewed_offer/reviewed_days. The values come from the Sheet, not the request.
 */
function review_(activityIds) {
  if (!Array.isArray(activityIds)) return fail_('bad_request', 'activityIds must be an array');
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    var acceptances = readAcceptances_();
    if (!acceptances) return fail_('bad_request', 'No Acceptances tab with a "Performer / Stage Name" header');
    var byName = {};
    acceptances.forEach(function (a) {
      byName[normalizeName_(a.name)] = a;
    });
    var sheet = sheet_(TABS.activities);
    var headers = ensureHeaders_(sheet, ['id'].concat(REVIEW_HEADERS));
    var col = {};
    headers.forEach(function (h, i) {
      if (h && col[h] === undefined) col[h] = i + 1;
    });
    var lastRow = sheet.getLastRow();
    var values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues() : [];
    var results = activityIds.map(function (id) {
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][col.id - 1]).trim() !== id) continue;
        var acceptance = byName[normalizeName_(values[i][col.acceptance - 1])];
        if (!acceptance) return { id: id, status: 'error', message: 'Its acceptance name matches no Acceptances row' };
        sheet.getRange(i + 2, col.reviewed_offer).setNumberFormat('@').setValue(acceptance.offer);
        sheet.getRange(i + 2, col.reviewed_days).setNumberFormat('@').setValue(acceptance.days_agreed);
        return { id: id, status: 'ok' };
      }
      return { id: id, status: 'error', message: 'Unknown activity' };
    });
    SpreadsheetApp.flush();
    return { ok: true, results: results };
  } finally {
    lock.releaseLock();
  }
}

/**
 * The Schedule tab as a small table keyed by id. Rows are always found by id, never by
 * position, so sorting or filtering the tab by hand is safe. Columns this script doesn't
 * know about are left alone.
 */
function openSchedule_() {
  var sheet = sheet_(TABS.schedule);
  var headers = ensureHeaders_(sheet, SCHEDULE_HEADERS);
  var col = {};
  headers.forEach(function (h, i) {
    if (h && col[h] === undefined) col[h] = i + 1;
  });
  var lastRow = sheet.getLastRow();
  var values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues() : [];
  var rowNumber = {};
  var rows = {};
  values.forEach(function (v, i) {
    var id = String(v[col.id - 1]).trim();
    if (!id || rowNumber[id]) return; // first row wins for duplicate ids
    var row = {};
    SCHEDULE_HEADERS.forEach(function (h) {
      row[h] = String(v[col[h] - 1]).trim();
    });
    rowNumber[id] = i + 2;
    rows[id] = row;
  });

  return {
    get: function (id) {
      return rows[id] ? copy_(rows[id]) : null;
    },
    put: function (row) {
      var n = rowNumber[row.id];
      if (!n) {
        n = sheet.getLastRow() + 1;
        rowNumber[row.id] = n;
      }
      SCHEDULE_HEADERS.forEach(function (h) {
        var before = rows[row.id] ? rows[row.id][h] : undefined;
        var value = row[h] === undefined ? '' : String(row[h]);
        if (before === value) return;
        // Plain text, so Sheets never turns times into dates or notes into formulas.
        sheet.getRange(n, col[h]).setNumberFormat('@').setValue(value);
      });
      rows[row.id] = copy_(row);
    },
    remove: function (id) {
      var n = rowNumber[id];
      if (!n) return;
      sheet.deleteRow(n);
      delete rowNumber[id];
      delete rows[id];
      Object.keys(rowNumber).forEach(function (k) {
        if (rowNumber[k] > n) rowNumber[k]--;
      });
    },
  };
}

/** Adds any missing columns to the header row and returns the headers. */
function ensureHeaders_(sheet, required) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(normalizeHeader_);
  required.forEach(function (h) {
    if (headers.indexOf(h) === -1) {
      var emptyAt = headers.indexOf('');
      var at = emptyAt === -1 ? headers.length : emptyAt;
      sheet.getRange(1, at + 1).setValue(h);
      headers[at] = h;
    }
  });
  return headers;
}

// ---------------------------------------------------------------------------
// helpers

function sheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing tab "' + name + '"');
  return sheet;
}

function normalizeHeader_(h) {
  return String(h).trim().toLowerCase().replace(/\s+/g, '_');
}

function compactHeader_(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Case- and whitespace-insensitive, matching the app's normalizeName. */
function normalizeName_(s) {
  return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
}

function idSet_(rows) {
  var out = {};
  rows.forEach(function (r) {
    if (r.id) out[r.id] = true;
  });
  return out;
}

function copy_(o) {
  var out = {};
  Object.keys(o).forEach(function (k) {
    out[k] = o[k];
  });
  return out;
}

function fail_(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

function respond_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
