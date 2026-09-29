import { describe, expect, it } from 'vitest';
import { activity, location, makeModel, placed } from '../test/builders';
import { placedInstances } from './model';

const ids = (m: ReturnType<typeof makeModel>) => m.instances.map((i) => i.id);

describe('instance expansion', () => {
  it('generates fixed-count instances per day and joins placed rows', () => {
    const m = makeModel([activity('act', { counts: { sat: 2, sun: 1 } })], [placed('act', 'sat', 2, ['main', '13:00'])]);
    expect(ids(m)).toEqual(['act-sat-1', 'act-sat-2', 'act-sun-1']);
    const second = m.instances[1]!;
    expect(second.placement).toMatchObject({ locationId: 'main', start: 780, end: 810 });
    expect(m.instances[0]!.placement).toBeNull();
  });

  it('orphans rows beyond the count and rows of inactive activities', () => {
    const m = makeModel(
      [activity('act', { counts: { sat: 1, sun: 0 } }), activity('gone', { active: false })],
      [placed('act', 'sat', 2, ['main', '13:00']), placed('act', 'sun', 1, null), placed('gone', 'sat', 1, ['side', '10:00'])],
    );
    const orphans = m.instances.filter((i) => i.orphan).map((i) => [i.id, i.orphan]);
    expect(orphans).toEqual([
      ['act-sat-2', 'exceeds-count'],
      ['act-sun-1', 'exceeds-count'],
      ['gone-sat-1', 'inactive-activity'],
    ]);
  });

  it('uses the weekend count as the default per-day cap', () => {
    const m = makeModel([
      activity('duo', { counts: { sat: null, sun: null }, weekendCount: 2 }),
      activity('solo', { counts: { sat: 1, sun: 0 }, weekendCount: 1 }),
    ]);
    expect(ids(m)).toEqual(['duo-sat-1', 'duo-sat-2', 'duo-sun-1', 'duo-sun-2', 'solo-sat-1']);
  });

  it('creates flexible instances only from rows', () => {
    const m = makeModel(
      [activity('filler', { counts: { sat: null, sun: null }, flexibleCount: true, durationMin: 15 })],
      [placed('filler', 'sat', 1, ['main', '11:00']), placed('filler', 'sat', 3, null)],
    );
    expect(ids(m)).toEqual(['filler-sat-1', 'filler-sat-3']);
    expect(m.instances.every((i) => i.orphan === null)).toBe(true);
  });

  it('turns continuous roaming into bands, not instances', () => {
    const m = makeModel([
      activity('roamer', {
        kind: 'roaming',
        counts: { sat: null, sun: null },
        durationMin: null,
        continuousDays: ['sat', 'sun'],
        availability: { sat: { from: null, until: null }, sun: { from: 660, until: null } },
      }),
    ]);
    expect(m.instances).toEqual([]);
    expect(m.bands.map((b) => [b.day, b.start, b.end])).toEqual([
      ['sat', 600, 1200],
      ['sun', 660, 1020],
    ]);
    expect(m.issues).toEqual([]);
  });

  it('flags activities with no duration and generates no cards for them', () => {
    const m = makeModel([activity('tbd', { durationMin: null })]);
    expect(m.instances).toEqual([]);
    expect(m.issues[0]).toMatchObject({ row: 'tbd', field: 'duration_min' });
  });
});

describe('placements', () => {
  it('applies duration overrides and setup/breakdown buffers', () => {
    const m = makeModel(
      [activity('aerial', { durationMin: 15, setupMin: 15, breakdownMin: 15 })],
      [placed('aerial', 'sun', 1, ['side', '12:00'], { durationMin: 20 })],
    );
    expect(placedInstances(m)[0]!.placement).toEqual({
      locationId: 'side',
      durationMin: 20,
      start: 720,
      end: 740,
      occStart: 705,
      occEnd: 755,
    });
  });

  it('treats unknown or inactive locations as unscheduled and reports them', () => {
    const m = makeModel(
      [activity('act', { counts: { sat: 2, sun: 0 } })],
      [placed('act', 'sat', 1, ['nowhere', '10:00']), placed('act', 'sat', 2, ['closed', '10:00'])],
      [location('closed', { active: false })],
    );
    expect(placedInstances(m)).toEqual([]);
    expect(m.issues.map((i) => i.message)).toEqual([
      'Unknown location "nowhere"; shown as unscheduled',
      'Inactive location "closed"; shown as unscheduled',
    ]);
    expect(m.locationOrder).toEqual([]);
  });

  it('keeps rows for unknown activities aside', () => {
    const m = makeModel([], [placed('ghost', 'sat', 1, ['main', '10:00'])]);
    expect(m.unknownRows.map((r) => r.id)).toEqual(['ghost-sat-1']);
    expect(m.instances).toEqual([]);
  });
});

describe('reference checks', () => {
  it('reports bad references and contradictory counts', () => {
    const m = makeModel([
      activity('show', { allowedLocations: ['nowhere'], parentEvent: 'other' }),
      activity('other'),
      activity('roamer', { kind: 'stage', continuousDays: ['sat'] }),
      activity('filler', { flexibleCount: true }),
    ]);
    expect(m.issues.map((i) => `${i.row}.${i.field}`)).toEqual([
      'show.allowed_locations',
      'show.parent_event',
      'roamer.continuous',
      'roamer.continuous',
      'filler.flexible_count',
    ]);
  });
});
