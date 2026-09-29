import { describe, expect, it } from 'vitest';
import { activity, makeModel, placed } from '../test/builders';
import { performerStatuses } from './status';

describe('performerStatuses', () => {
  it('groups activities by performer with the worst state first', () => {
    const m = makeModel(
      [
        activity('show', { performerId: 'pat', counts: { sat: 2, sun: 0 } }),
        activity('stroll', { performerId: 'pat', kind: 'roaming', counts: { sat: 1, sun: 0 } }),
        activity('solo', { counts: { sat: 1, sun: 0 } }),
      ],
      [
        placed('show', 'sat', 1, ['main', '10:00']),
        placed('show', 'sat', 2, ['side', '13:00']),
        placed('solo', 'sat', 1, ['grove', '12:00']),
      ],
    );
    const statuses = performerStatuses(m);
    expect(statuses.map((s) => [s.performerId, s.state])).toEqual([
      ['pat', 'under'],
      ['solo', 'ok'],
    ]);
    const show = statuses[0]!.activities[0]!;
    expect(show.days.sat).toEqual({ placed: 2, required: 2, firstStart: 600, lastEnd: 810, locationIds: ['main', 'side'] });
  });

  it('reports weekend, flexible and continuous activities', () => {
    const m = makeModel(
      [
        activity('duo', { counts: { sat: null, sun: null }, weekendCount: 2 }),
        activity('filler', { counts: { sat: null, sun: null }, flexibleCount: true }),
        activity('roam', { kind: 'roaming', counts: { sat: null, sun: null }, durationMin: null, continuousDays: ['sun'] }),
        activity('off', { active: false }),
      ],
      [placed('duo', 'sat', 1, ['main', '10:00']), placed('duo', 'sat', 2, ['main', '11:00'])],
    );
    const byId = Object.fromEntries(performerStatuses(m).flatMap((p) => p.activities).map((a) => [a.activity.id, a]));
    expect(Object.keys(byId)).toEqual(['duo', 'filler', 'roam']);
    expect(byId.duo).toMatchObject({ state: 'ok', weekend: { placed: 2, required: 2 } });
    expect(byId.duo!.days.sat.required).toBeNull();
    expect(byId.filler!.state).toBe('flexible');
    expect(byId.roam!.state).toBe('continuous');
  });
});
