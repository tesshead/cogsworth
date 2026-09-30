// Runs Code.gs in a Node VM against a fake SpreadsheetApp, so the deployed API's behaviour
// is tested without Google. The fake stores every cell as a display string, like
// getDisplayValues() would return.

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

type Grid = string[][];

function fakeSheet(grid: Grid) {
  const lastRow = () => {
    for (let r = grid.length; r > 0; r--) if (grid[r - 1]!.some((v) => v !== '')) return r;
    return 0;
  };
  const lastCol = () => Math.max(0, ...grid.map((row) => row.reduceRight((acc, v, i) => (acc || v === '' ? acc : i + 1), 0)));
  const cell = (r: number, c: number) => {
    while (grid.length < r) grid.push([]);
    const row = grid[r - 1]!;
    while (row.length < c) row.push('');
    return row;
  };
  const read = (r: number, c: number, nr: number, nc: number) =>
    Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => grid[r - 1 + i]?.[c - 1 + j] ?? ''));
  return {
    grid,
    formats: new Map<string, string>(),
    getLastRow: lastRow,
    getLastColumn: lastCol,
    getDataRange() {
      return { getDisplayValues: () => read(1, 1, lastRow(), lastCol()) };
    },
    getRange(r: number, c: number, nr = 1, nc = 1) {
      const sheet = this;
      return {
        getDisplayValues: () => read(r, c, nr, nc),
        setNumberFormat(f: string) {
          sheet.formats.set(`${r},${c}`, f);
          return this;
        },
        setValue(v: unknown) {
          cell(r, c)[c - 1] = String(v);
          return this;
        },
      };
    },
    deleteRow(r: number) {
      grid.splice(r - 1, 1);
    },
  };
}

function loadApi(tabs: Record<string, Grid>, editKey: string | null = 'secret') {
  const sheets = Object.fromEntries(Object.entries(tabs).map(([name, grid]) => [name, fakeSheet(grid)]));
  let lockHeld = false;
  const context: Record<string, unknown> = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (name: string) => sheets[name] ?? null }),
      flush: () => {},
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === 'EDIT_KEY' ? editKey : null) }) },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          lockHeld = true;
        },
        releaseLock: () => {
          lockHeld = false;
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ text, setMimeType: () => ({ text }) }),
    },
  };
  runInNewContext(readFileSync(new URL('./Code.gs', import.meta.url), 'utf8'), context);
  const doPost = context.doPost as (e: unknown) => { text: string };
  const post = (body: unknown) => JSON.parse(doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  return { post, sheets, lockHeld: () => lockHeld };
}

const ACTIVITIES: Grid = [
  ['id', 'Name', 'kind'],
  ['act', 'Act', 'stage'],
  ['', '', ''],
];
const LOCATIONS: Grid = [
  ['id', 'name', 'type'],
  ['main', 'Main', 'stage'],
];
const scheduleGrid = (): Grid => [
  ['id', 'activity_id', 'day', 'performance_no', 'location_id', 'start_time', 'my_column', 'duration_min', 'locked', 'notes', 'rev', 'updated_at', 'updated_by'],
  ['act-sat-1', 'act', 'sat', '1', 'main', '10:00', 'keep me', '', 'FALSE', '', '3', '', 'draft-import'],
];

let api: ReturnType<typeof loadApi>;
beforeEach(() => {
  api = loadApi({ Scheduler_Activities: ACTIVITIES.map((r) => [...r]), Scheduler_Locations: LOCATIONS, Scheduler_Schedule: scheduleGrid() });
});

const change = (over: Record<string, unknown> = {}) => ({ id: 'act-sat-1', activity_id: 'act', day: 'sat', performance_no: 1, base_rev: 3, ...over });

describe('requests', () => {
  it('requires the key', () => {
    expect(api.post({ action: 'load' })).toEqual({ ok: false, error: { code: 'unauthorized', message: 'Wrong or missing key' } });
    expect(api.post({ action: 'load', key: 'nope' }).error.code).toBe('unauthorized');
  });

  it('reports a missing EDIT_KEY property instead of letting everyone in', () => {
    const open = loadApi({ Scheduler_Activities: ACTIVITIES, Scheduler_Locations: LOCATIONS, Scheduler_Schedule: scheduleGrid() }, null);
    expect(open.post({ action: 'load', key: '' }).error).toMatchObject({ code: 'server_error' });
  });

  it('rejects malformed bodies and unknown actions', () => {
    expect(api.post('not json').error.code).toBe('bad_request');
    expect(api.post({ action: 'drop-tables', key: 'secret' }).error.code).toBe('bad_request');
  });
});

describe('load', () => {
  it('returns rows keyed by normalized header, skipping blank rows', () => {
    const res = api.post({ action: 'load', key: 'secret' });
    expect(res.ok).toBe(true);
    expect(res.activities).toEqual([{ id: 'act', name: 'Act', kind: 'stage' }]);
    expect(res.schedule[0]).toMatchObject({ id: 'act-sat-1', start_time: '10:00', my_column: 'keep me' });
  });
});

describe('save', () => {
  const save = (changes: unknown[]) => api.post({ action: 'save', key: 'secret', updatedBy: 'Tess', changes });

  it('updates only the changed cells, as plain text, and leaves unknown columns alone', () => {
    const res = save([change({ set: { location_id: 'main', start_time: '11:15' } })]);
    expect(res.results[0]).toMatchObject({ status: 'ok', row: { start_time: '11:15', rev: '4', updated_by: 'Tess' } });
    const sheet = api.sheets.Scheduler_Schedule!;
    expect(sheet.grid[1]).toMatchObject({ 5: '11:15', 6: 'keep me', 10: '4', 12: 'Tess' });
    expect(sheet.formats.get('2,6')).toBe('@');
    expect(sheet.formats.has('2,5')).toBe(false); // location_id didn't change
    expect(api.lockHeld()).toBe(false);
  });

  it('appends new rows and finds rows by id even after the tab is re-sorted', () => {
    save([change({ id: 'act-sat-2', performance_no: 2, base_rev: 0, set: { location_id: 'main', start_time: '12:00' } })]);
    const sheet = api.sheets.Scheduler_Schedule!;
    expect(sheet.grid[2]!.slice(0, 6)).toEqual(['act-sat-2', 'act', 'sat', '2', 'main', '12:00']);
    // Someone sorts the tab by hand.
    [sheet.grid[1], sheet.grid[2]] = [sheet.grid[2]!, sheet.grid[1]!];
    const res = save([change({ set: { location_id: null, start_time: null } })]);
    expect(res.results[0].status).toBe('ok');
    expect(sheet.grid[2]!.slice(0, 6)).toEqual(['act-sat-1', 'act', 'sat', '1', '', '']);
  });

  it('returns the current row on a stale rev', () => {
    const res = save([change({ base_rev: 2, set: { start_time: '12:00' } })]);
    expect(res.results[0]).toMatchObject({ status: 'conflict', row: { start_time: '10:00', rev: '3' } });
  });

  it('deletes orphan rows on request', () => {
    const res = save([change({ delete: true })]);
    expect(res.results[0]).toEqual({ id: 'act-sat-1', status: 'ok', row: null });
    expect(api.sheets.Scheduler_Schedule!.grid).toHaveLength(1);
  });

  it('validates input like the mock server', () => {
    const res = save([
      change({ id: 'act-sun-1' }),
      change({ activity_id: 'nope', id: 'nope-sat-1' }),
      change({ set: { location_id: 'moon', start_time: '10:00' } }),
      change({ set: { start_time: '9:00' } }),
      change({ set: { location_id: null } }),
      change({ set: { duration_min: -5 } }),
      change({ day: 'mon', id: 'act-mon-1' }),
    ]);
    expect(res.results.map((r: { status: string }) => r.status)).toEqual(['error', 'error', 'error', 'error', 'error', 'error', 'error']);
  });

  it('adds missing schedule columns to the header row', () => {
    const bare = loadApi({ Scheduler_Activities: ACTIVITIES, Scheduler_Locations: LOCATIONS, Scheduler_Schedule: [['id', 'activity_id']] });
    bare.post({ action: 'save', key: 'secret', updatedBy: 'Tess', changes: [change({ base_rev: 0, set: { location_id: 'main', start_time: '10:00' } })] });
    expect(bare.sheets.Scheduler_Schedule!.grid[0]).toEqual([
      'id', 'activity_id', 'day', 'performance_no', 'location_id', 'start_time', 'duration_min', 'locked', 'notes', 'rev', 'updated_at', 'updated_by',
    ]);
  });
});

describe('acceptances', () => {
  const ACCEPTANCES: Grid = [
    ['FINAL PERFORMER SELECTIONS'],
    ['PERFORMER BUDGET', '20000'],
    ['Performer / Stage Name', 'Contact Name', 'Contact Email', 'Final Agreed Price', 'Offer', 'Days Agreed', 'Confirmed?'],
    ['Raptors ', 'Pat', 'pat@example.test', '100', 'two 30 min shows', 'Saturday', 'Yes'],
    ['', '', '', '', '', '', ''],
    ['Declined Act', 'Sam', 'sam@example.test', '0', 'tbd', '', 'No'],
  ];
  const withAcceptances = () =>
    loadApi({
      Scheduler_Activities: [
        ['id', 'kind', 'acceptance'],
        ['raptors', 'stage', 'raptors'],
        ['typo', 'stage', 'Rapturs'],
      ],
      Scheduler_Locations: LOCATIONS,
      Scheduler_Schedule: scheduleGrid(),
      Acceptances: ACCEPTANCES.map((r) => [...r]),
    });

  it('returns only the scheduling columns, finding the header below summary rows', () => {
    const res = withAcceptances().post({ action: 'load', key: 'secret' });
    expect(res.acceptances).toEqual([
      { name: 'Raptors', offer: 'two 30 min shows', days_agreed: 'Saturday', confirmed: 'Yes' },
      { name: 'Declined Act', offer: 'tbd', days_agreed: '', confirmed: 'No' },
    ]);
    expect(JSON.stringify(res)).not.toContain('example.test');
  });

  it('is null without an Acceptances tab', () => {
    expect(api.post({ action: 'load', key: 'secret' }).acceptances).toBeNull();
  });

  it('marks activities reviewed with the current offer, adding the columns if needed', () => {
    const a = withAcceptances();
    const res = a.post({ action: 'review', key: 'secret', activityIds: ['raptors', 'typo', 'ghost'] });
    expect(res.results.map((r: { status: string }) => r.status)).toEqual(['ok', 'error', 'error']);
    const grid = a.sheets.Scheduler_Activities!.grid;
    expect(grid[0]).toEqual(['id', 'kind', 'acceptance', 'reviewed_offer', 'reviewed_days']);
    expect(grid[1]).toEqual(['raptors', 'stage', 'raptors', 'two 30 min shows', 'Saturday']);
  });

  it('requires the key to review', () => {
    expect(withAcceptances().post({ action: 'review', activityIds: [] }).error.code).toBe('unauthorized');
  });
});
