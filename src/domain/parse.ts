// Raw Sheet rows (header → display string) → typed records plus DataIssues.
// Parsing never throws: a bad cell becomes an issue and a safe default, and a row that
// can't be used at all is skipped with an issue.

import { parseTime } from './time';
import {
  ACTIVITY_KINDS,
  type Acceptance,
  DAY_KEYS,
  LOCATION_RULES,
  LOCATION_TYPES,
  type Activity,
  type DataIssue,
  type DayKey,
  type Location,
  type ScheduleRow,
  type SheetTab,
} from './types';
import { instanceId } from './ids';

export type RawRow = Record<string, string>;

export interface RawSheetData {
  activities: RawRow[];
  locations: RawRow[];
  schedule: RawRow[];
  /** Absent or null when the Sheet has no Acceptances tab. */
  acceptances?: RawRow[] | null;
}

export interface ParsedSheetData {
  activities: Activity[];
  locations: Location[];
  schedule: ScheduleRow[];
  acceptances: Acceptance[] | null;
  issues: DataIssue[];
}

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TRUE_WORDS = new Set(['true', 'yes', 'y', 'x', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', '']);

export function parseSheetData(raw: RawSheetData): ParsedSheetData {
  const issues: DataIssue[] = [];
  return {
    activities: parseRows(raw.activities, 'activities', issues, parseActivity),
    locations: parseRows(raw.locations, 'locations', issues, parseLocation),
    schedule: parseRows(raw.schedule, 'schedule', issues, parseScheduleRow),
    acceptances: raw.acceptances ? parseAcceptances(raw.acceptances) : null,
    issues,
  };
}

function parseAcceptances(rows: RawRow[]): Acceptance[] {
  return rows
    .map((r) => ({
      name: (r.name ?? '').trim(),
      offer: (r.offer ?? '').trim(),
      daysAgreed: (r.days_agreed ?? '').trim(),
      confirmed: /^yes$/i.test((r.confirmed ?? '').trim()),
    }))
    .filter((a) => a.name !== '');
}

function parseRows<T extends { id: string }>(
  rows: RawRow[],
  tab: SheetTab,
  issues: DataIssue[],
  parseOne: (r: Reader) => T | null,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const cells = normalizeHeaders(row);
    if (Object.values(cells).every((v) => v === '')) return;
    // Header is sheet row 1, so data row 0 is sheet row 2.
    const reader = makeReader(cells, tab, cells.id || `row ${index + 2}`, issues);
    const parsed = parseOne(reader);
    if (!parsed) return;
    if (seen.has(parsed.id)) {
      reader.issue('id', `Duplicate id "${parsed.id}"; this row is ignored`);
      return;
    }
    seen.add(parsed.id);
    out.push(parsed);
  });
  return out;
}

function normalizeHeaders(row: RawRow): RawRow {
  const out: RawRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.trim().toLowerCase().replace(/\s+/g, '_')] = String(value ?? '').trim();
  }
  return out;
}

type Reader = ReturnType<typeof makeReader>;

function makeReader(cells: RawRow, tab: SheetTab, rowLabel: string, issues: DataIssue[]) {
  const issue = (field: string | undefined, message: string) =>
    issues.push({ tab, row: rowLabel, ...(field ? { field } : {}), message });

  const str = (field: string) => cells[field] ?? '';

  return {
    issue,
    str,
    id(field: string): string | null {
      const value = str(field);
      if (!value) return null;
      if (!ID_RE.test(value)) issue(field, `"${value}" should be lowercase kebab-case`);
      return value;
    },
    int(field: string): number | null {
      const value = str(field);
      if (!value) return null;
      if (!/^\d+(\.0+)?$/.test(value)) {
        issue(field, `"${value}" is not a whole number`);
        return null;
      }
      return Number(value);
    },
    bool(field: string, blank: boolean): boolean {
      const value = str(field).toLowerCase();
      if (value === '') return blank;
      if (TRUE_WORDS.has(value)) return true;
      if (FALSE_WORDS.has(value)) return false;
      issue(field, `"${str(field)}" is not TRUE/FALSE; treated as ${blank}`);
      return blank;
    },
    time(field: string): number | null {
      const value = str(field);
      if (!value) return null;
      const minutes = parseTime(value);
      if (minutes === null) issue(field, `"${value}" is not a time`);
      return minutes;
    },
    list(field: string): string[] {
      return str(field)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    },
    oneOf<T extends string>(field: string, allowed: readonly T[]): T | null {
      const value = str(field).toLowerCase();
      if ((allowed as readonly string[]).includes(value)) return value as T;
      issue(field, value ? `"${str(field)}" must be one of: ${allowed.join(', ')}` : 'Missing');
      return null;
    },
  };
}

function parseActivity(r: Reader): Activity | null {
  const id = r.id('id');
  if (!id) {
    r.issue('id', 'Missing id; row ignored');
    return null;
  }
  const kind = r.oneOf('kind', ACTIVITY_KINDS);
  if (!kind) return null;

  const continuousDays = r.list('continuous').filter((d): d is DayKey => {
    const ok = (DAY_KEYS as readonly string[]).includes(d.toLowerCase());
    if (!ok) r.issue('continuous', `"${d}" is not a day (sat, sun)`);
    return ok;
  });

  const ruleText = r.str('location_rule');
  const locationRule = ruleText ? (r.oneOf('location_rule', LOCATION_RULES) ?? 'preferred') : 'preferred';

  return {
    id,
    performerId: r.id('performer_id') ?? id,
    name: r.str('name') || id,
    kind,
    counts: { sat: r.int('sat_count'), sun: r.int('sun_count') },
    weekendCount: r.int('weekend_count'),
    flexibleCount: r.bool('flexible_count', false),
    continuousDays: continuousDays.map((d) => d.toLowerCase() as DayKey),
    durationMin: r.int('duration_min'),
    setupMin: r.int('setup_min') ?? 0,
    breakdownMin: r.int('breakdown_min') ?? 0,
    availability: {
      sat: { from: r.time('sat_available_from'), until: r.time('sat_available_until') },
      sun: { from: r.time('sun_available_from'), until: r.time('sun_available_until') },
    },
    minBreakMin: r.int('min_break_min'),
    allowedLocations: r.list('allowed_locations'),
    locationRule,
    requires: r.list('requires'),
    tags: r.list('tags'),
    parentEvent: r.str('parent_event') || null,
    acceptance: r.str('acceptance') || null,
    reviewedOffer: r.str('reviewed_offer') || null,
    reviewedDays: r.str('reviewed_days') || null,
    notes: r.str('notes'),
    active: r.bool('active', true),
  };
}

function parseLocation(r: Reader): Location | null {
  const id = r.id('id');
  if (!id) {
    r.issue('id', 'Missing id; row ignored');
    return null;
  }
  const type = r.oneOf('type', LOCATION_TYPES);
  if (!type) return null;
  return {
    id,
    name: r.str('name') || id,
    type,
    hours: {
      sat: { open: r.time('sat_open'), close: r.time('sat_close') },
      sun: { open: r.time('sun_open'), close: r.time('sun_close') },
    },
    provides: r.list('provides'),
    active: r.bool('active', true),
    notes: r.str('notes'),
  };
}

function parseScheduleRow(r: Reader): ScheduleRow | null {
  const id = r.str('id');
  const activityId = r.str('activity_id');
  const day = r.oneOf('day', DAY_KEYS);
  const performanceNo = r.int('performance_no');
  if (!id || !activityId || !day || !performanceNo) {
    r.issue(undefined, 'Needs id, activity_id, day and performance_no; row ignored');
    return null;
  }
  const expected = instanceId(activityId, day, performanceNo);
  if (id !== expected) {
    r.issue('id', `id should be "${expected}" to match activity_id/day/performance_no; row ignored`);
    return null;
  }

  let locationId: string | null = r.str('location_id') || null;
  let start = r.time('start_time');
  if ((locationId === null) !== (start === null)) {
    r.issue(undefined, 'Needs both location_id and start_time to be placed; treated as unscheduled');
    locationId = null;
    start = null;
  }

  return {
    id,
    activityId,
    day,
    performanceNo,
    locationId,
    start,
    durationMin: r.int('duration_min'),
    locked: r.bool('locked', false),
    notes: r.str('notes'),
    rev: r.int('rev') ?? 0,
    updatedAt: r.str('updated_at'),
    updatedBy: r.str('updated_by'),
  };
}
