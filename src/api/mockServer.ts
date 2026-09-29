// An in-memory stand-in for the Apps Script API with the same save semantics:
// rows found by id, rev checked against base_rev, inputs validated, rev bumped on write.
// Scheduling rules are not enforced (warnings are the client's job).

import { instanceId } from '../domain/ids';
import type { RawRow } from '../domain/parse';
import type { Change, ChangeResult, LoadResult } from './transport';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface MockServer {
  load(): LoadResult;
  save(changes: Change[], updatedBy: string, now?: Date): ChangeResult[];
  /** Imitates another editor changing a row (for trying out conflict handling). */
  externalEdit(id: string, set: RawRow, updatedBy?: string): void;
}

export function createMockServer(seed: { activities: RawRow[]; locations: RawRow[]; schedule: RawRow[] }): MockServer {
  const activities = structuredClone(seed.activities);
  const locations = structuredClone(seed.locations);
  const rows = new Map(seed.schedule.map((r) => [r.id!, { ...r }]));
  const activityIds = new Set(activities.map((a) => a.id));
  const locationIds = new Set(locations.map((l) => l.id));

  const save = (changes: Change[], updatedBy: string, now = new Date()): ChangeResult[] =>
    changes.map((change): ChangeResult => {
      const { id } = change;
      if (id !== instanceId(change.activity_id, change.day, change.performance_no)) {
        return { id, status: 'error', message: 'id does not match activity_id/day/performance_no' };
      }
      if (!activityIds.has(change.activity_id)) return { id, status: 'error', message: `Unknown activity "${change.activity_id}"` };

      const current = rows.get(id);
      const currentRev = current ? Number(current.rev || 0) : 0;
      if (currentRev !== change.base_rev) return { id, status: 'conflict', row: current ? { ...current } : null };

      if (change.delete) {
        rows.delete(id);
        return { id, status: 'ok', row: null };
      }

      const next: RawRow = current
        ? { ...current }
        : { id, activity_id: change.activity_id, day: change.day, performance_no: String(change.performance_no), locked: 'FALSE', notes: '' };
      const set = change.set ?? {};
      if (set.location_id !== undefined) {
        if (set.location_id !== null && !locationIds.has(set.location_id)) {
          return { id, status: 'error', message: `Unknown location "${set.location_id}"` };
        }
        next.location_id = set.location_id ?? '';
      }
      if (set.start_time !== undefined) {
        if (set.start_time !== null && !TIME_RE.test(set.start_time)) return { id, status: 'error', message: `Bad time "${set.start_time}"` };
        next.start_time = set.start_time ?? '';
      }
      if (!next.location_id !== !next.start_time) return { id, status: 'error', message: 'location_id and start_time must be set or cleared together' };
      if (set.duration_min !== undefined) next.duration_min = set.duration_min === null ? '' : String(set.duration_min);
      if (set.locked !== undefined) next.locked = set.locked ? 'TRUE' : 'FALSE';
      if (set.notes !== undefined) next.notes = set.notes;

      next.rev = String(currentRev + 1);
      next.updated_at = now.toISOString();
      next.updated_by = updatedBy;
      rows.set(id, next);
      return { id, status: 'ok', row: { ...next } };
    });

  return {
    load: () => ({
      serverTime: new Date().toISOString(),
      activities: structuredClone(activities),
      locations: structuredClone(locations),
      schedule: [...rows.values()].map((r) => ({ ...r })),
    }),
    save,
    externalEdit(id, set, updatedBy = 'someone else') {
      const current = rows.get(id);
      if (!current) return;
      rows.set(id, { ...current, ...set, rev: String(Number(current.rev || 0) + 1), updated_by: updatedBy, updated_at: new Date().toISOString() });
    },
  };
}
