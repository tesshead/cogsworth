// Synthetic fixtures. Never put real Faire data here: this repo is public.

import { instanceId } from '../domain/ids';
import { buildModel, type Model } from '../domain/model';
import { parseTime } from '../domain/time';
import type { Acceptance, Activity, DayKey, Location, ScheduleRow } from '../domain/types';

const t = (s: string) => parseTime(s)!;

export function activity(id: string, over: Partial<Activity> = {}): Activity {
  return {
    id,
    performerId: id,
    name: id,
    kind: 'stage',
    counts: { sat: 1, sun: 1 },
    weekendCount: null,
    flexibleCount: false,
    continuousDays: [],
    durationMin: 30,
    setupMin: 0,
    breakdownMin: 0,
    availability: { sat: { from: null, until: null }, sun: { from: null, until: null } },
    minBreakMin: null,
    allowedLocations: [],
    locationRule: 'preferred',
    requires: [],
    tags: [],
    parentEvent: null,
    acceptance: null,
    reviewedOffer: null,
    reviewedDays: null,
    notes: '',
    active: true,
    ...over,
  };
}

export function location(id: string, over: Partial<Location> = {}): Location {
  return {
    id,
    name: id,
    type: 'stage',
    hours: { sat: { open: null, close: null }, sun: { open: null, close: null } },
    provides: [],
    active: true,
    notes: '',
    ...over,
  };
}

/** A placed schedule row. Pass `where: null` for an unscheduled (cleared) row. */
export function placed(
  activityId: string,
  day: DayKey,
  n: number,
  where: [locationId: string, start: string] | null,
  over: Partial<ScheduleRow> = {},
): ScheduleRow {
  return {
    id: instanceId(activityId, day, n),
    activityId,
    day,
    performanceNo: n,
    locationId: where ? where[0] : null,
    start: where ? t(where[1]) : null,
    durationMin: null,
    locked: false,
    notes: '',
    rev: 1,
    updatedAt: '',
    updatedBy: 'test',
    ...over,
  };
}

/** Locations of a small imaginary faire. */
export const LOCATIONS: Location[] = [
  location('main', { name: 'Main Stage', provides: ['power', 'fire-safe'] }),
  location('side', { name: 'Side Stage', provides: ['fire-safe'] }),
  location('grove', {
    name: 'Grove',
    hours: { sat: { open: t('11:00'), close: null }, sun: { open: t('11:00'), close: null } },
  }),
  location('gate', { name: 'Gate', type: 'ambient' }),
  location('arena', { name: 'Arena', type: 'dedicated' }),
  location('hall', { name: 'Hall', type: 'dedicated' }),
  location('lanes', { name: 'Lanes', type: 'roaming' }),
];

export function makeModel(
  activities: Activity[],
  schedule: ScheduleRow[] = [],
  locations: Location[] = LOCATIONS,
  acceptances: Acceptance[] | null = null,
): Model {
  return buildModel({ activities, locations, schedule, acceptances, issues: [] });
}
