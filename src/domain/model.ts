// Joins parsed Sheet data into the scheduling model: expected instances, their placements,
// orphans, and continuous-roaming bands. See docs/design.md §3.

import { DAYS, type DayConfig } from '../config';
import { instanceId } from './ids';
import type { ParsedSheetData } from './parse';
import { parseTime } from './time';
import {
  DAY_KEYS,
  type Acceptance,
  type Activity,
  type DataIssue,
  type DayKey,
  type Location,
  type ScheduleRow,
} from './types';

export interface Placement {
  locationId: string;
  durationMin: number;
  /** Public slot. */
  start: number;
  end: number;
  /** Including setup and breakdown: when the location (and performer) is busy. */
  occStart: number;
  occEnd: number;
}

export type OrphanReason = 'inactive-activity' | 'exceeds-count' | 'continuous-activity' | 'missing-duration';

export interface Instance {
  id: string;
  activity: Activity;
  day: DayKey;
  n: number;
  row: ScheduleRow | null;
  placement: Placement | null;
  locked: boolean;
  orphan: OrphanReason | null;
}

export interface PlacedInstance extends Instance {
  placement: Placement;
}

export interface RoamingBand {
  activity: Activity;
  day: DayKey;
  start: number;
  end: number;
}

export interface DayBounds {
  open: number;
  close: number;
}

export interface Model {
  days: Record<DayKey, DayBounds>;
  activities: Map<string, Activity>;
  locations: Map<string, Location>;
  /** Active locations in Sheet order (board column order). */
  locationOrder: Location[];
  instances: Instance[];
  /** Schedule rows whose activity id doesn't exist. */
  unknownRows: ScheduleRow[];
  bands: RoamingBand[];
  /** Null when the Sheet has no Acceptances tab. */
  acceptances: Acceptance[] | null;
  issues: DataIssue[];
}

export function buildModel(data: ParsedSheetData, dayConfigs: readonly DayConfig[] = DAYS): Model {
  const issues = [...data.issues];
  const days = dayBounds(dayConfigs);
  const activities = new Map(data.activities.map((a) => [a.id, a]));
  const locations = new Map(data.locations.map((l) => [l.id, l]));

  checkActivityReferences(data.activities, activities, locations, issues);

  const rowsByActivity = new Map<string, ScheduleRow[]>();
  const unknownRows: ScheduleRow[] = [];
  for (const row of data.schedule) {
    if (!activities.has(row.activityId)) {
      unknownRows.push(row);
      issues.push({ tab: 'schedule', row: row.id, field: 'activity_id', message: `Unknown activity "${row.activityId}"` });
      continue;
    }
    const list = rowsByActivity.get(row.activityId) ?? [];
    list.push(row);
    rowsByActivity.set(row.activityId, list);
  }

  const instances: Instance[] = [];
  const bands: RoamingBand[] = [];
  const makeInstance = (activity: Activity, day: DayKey, n: number, row: ScheduleRow | null, orphan: OrphanReason | null): Instance => ({
    id: instanceId(activity.id, day, n),
    activity,
    day,
    n,
    row,
    placement: row ? placementFor(row, activity, locations, issues) : null,
    locked: row?.locked ?? false,
    orphan,
  });

  for (const activity of data.activities) {
    const rows = rowsByActivity.get(activity.id) ?? [];
    const rowById = new Map(rows.map((r) => [r.id, r]));

    if (!activity.active || isContinuous(activity)) {
      const reason: OrphanReason = !activity.active ? 'inactive-activity' : 'continuous-activity';
      for (const row of rows) instances.push(makeInstance(activity, row.day, row.performanceNo, row, reason));
      if (activity.active) {
        for (const day of activity.continuousDays) bands.push(bandFor(activity, day, days[day]));
      }
      continue;
    }

    if (activity.durationMin === null) {
      issues.push({ tab: 'activities', row: activity.id, field: 'duration_min', message: 'Missing duration; no cards generated' });
    }

    if (activity.flexibleCount) {
      for (const row of rows) instances.push(makeInstance(activity, row.day, row.performanceNo, row, null));
      continue;
    }

    for (const day of DAY_KEYS) {
      const cap = dayCap(activity, day);
      if (activity.durationMin !== null) {
        for (let n = 1; n <= cap; n++) {
          instances.push(makeInstance(activity, day, n, rowById.get(instanceId(activity.id, day, n)) ?? null, null));
        }
      }
      for (const row of rows) {
        if (row.day !== day) continue;
        if (activity.durationMin === null) instances.push(makeInstance(activity, day, row.performanceNo, row, 'missing-duration'));
        else if (row.performanceNo > cap) instances.push(makeInstance(activity, day, row.performanceNo, row, 'exceeds-count'));
      }
    }
  }

  return {
    days,
    activities,
    locations,
    locationOrder: data.locations.filter((l) => l.active),
    instances,
    unknownRows,
    bands,
    acceptances: data.acceptances,
    issues,
  };
}

export function isContinuous(activity: Activity): boolean {
  return activity.continuousDays.length > 0;
}

/**
 * Instances generated for a day. With a weekend count, the per-day count is a cap and
 * defaults to the weekend total.
 */
export function dayCap(activity: Activity, day: DayKey): number {
  if (activity.weekendCount !== null) return activity.counts[day] ?? activity.weekendCount;
  return activity.counts[day] ?? 0;
}

export function isPlaced(instance: Instance): instance is PlacedInstance {
  return instance.placement !== null;
}

export function placedInstances(model: Model, day?: DayKey): PlacedInstance[] {
  return model.instances.filter((i): i is PlacedInstance => isPlaced(i) && (day === undefined || i.day === day));
}

function placementFor(row: ScheduleRow, activity: Activity, locations: Map<string, Location>, issues: DataIssue[]): Placement | null {
  if (row.locationId === null || row.start === null) return null;
  const location = locations.get(row.locationId);
  if (!location || !location.active) {
    issues.push({
      tab: 'schedule',
      row: row.id,
      field: 'location_id',
      message: `${location ? 'Inactive' : 'Unknown'} location "${row.locationId}"; shown as unscheduled`,
    });
    return null;
  }
  const durationMin = row.durationMin ?? activity.durationMin;
  if (durationMin === null) return null;
  const end = row.start + durationMin;
  return {
    locationId: row.locationId,
    durationMin,
    start: row.start,
    end,
    occStart: row.start - activity.setupMin,
    occEnd: end + activity.breakdownMin,
  };
}

function bandFor(activity: Activity, day: DayKey, bounds: DayBounds): RoamingBand {
  const { from, until } = activity.availability[day];
  return { activity, day, start: from ?? bounds.open, end: until ?? bounds.close };
}

function dayBounds(configs: readonly DayConfig[]): Record<DayKey, DayBounds> {
  const out = {} as Record<DayKey, DayBounds>;
  for (const c of configs) out[c.key] = { open: parseTime(c.open) ?? 0, close: parseTime(c.close) ?? 24 * 60 };
  return out;
}

function checkActivityReferences(
  list: Activity[],
  activities: Map<string, Activity>,
  locations: Map<string, Location>,
  issues: DataIssue[],
) {
  const issue = (a: Activity, field: string, message: string) => issues.push({ tab: 'activities', row: a.id, field, message });
  for (const a of list) {
    for (const id of a.allowedLocations) {
      if (!locations.has(id)) issue(a, 'allowed_locations', `Unknown location "${id}"`);
    }
    if (a.parentEvent !== null) {
      const parent = activities.get(a.parentEvent);
      if (!parent) issue(a, 'parent_event', `Unknown activity "${a.parentEvent}"`);
      else if (parent.kind !== 'event') issue(a, 'parent_event', `"${a.parentEvent}" is not an event`);
      else if (parent.id === a.id) issue(a, 'parent_event', 'An event cannot be its own parent');
    }
    if (isContinuous(a)) {
      if (a.kind !== 'roaming') issue(a, 'continuous', 'Only roaming activities can be continuous');
      if (a.counts.sat !== null || a.counts.sun !== null || a.weekendCount !== null || a.flexibleCount) {
        issue(a, 'continuous', 'Continuous activities have no counts; counts are ignored');
      }
    } else if (a.flexibleCount && (a.counts.sat !== null || a.counts.sun !== null || a.weekendCount !== null)) {
      issue(a, 'flexible_count', 'Flexible activities have no required count; counts are ignored');
    }
  }
}
