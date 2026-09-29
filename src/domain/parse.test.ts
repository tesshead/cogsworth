import { describe, expect, it } from 'vitest';
import { parseSheetData, type RawRow } from './parse';

const parse = (over: { activities?: RawRow[]; locations?: RawRow[]; schedule?: RawRow[] }) =>
  parseSheetData({ activities: [], locations: [], schedule: [], ...over });

describe('activities', () => {
  it('reads by header name, tolerating case, spacing and number formatting', () => {
    const { activities, issues } = parse({
      activities: [
        {
          ' ID ': 'fire-troupe',
          Name: 'Fire Troupe',
          Kind: 'Stage',
          'Sat Count': '3.0',
          sun_count: '2',
          duration_min: '30',
          sat_available_until: '6:00 PM',
          requires: 'fire-safe, power',
          flexible_count: 'no',
          extra_column: 'ignored',
        },
      ],
    });
    expect(issues).toEqual([]);
    expect(activities).toHaveLength(1);
    const a = activities[0]!;
    expect(a).toMatchObject({
      id: 'fire-troupe',
      performerId: 'fire-troupe',
      kind: 'stage',
      counts: { sat: 3, sun: 2 },
      durationMin: 30,
      requires: ['fire-safe', 'power'],
      locationRule: 'preferred',
      active: true,
      setupMin: 0,
    });
    expect(a.availability.sat.until).toBe(18 * 60);
  });

  it('parses continuous days, weekend counts and parent events', () => {
    const { activities, issues } = parse({
      activities: [
        { id: 'roamer', kind: 'roaming', continuous: 'Sat, sun' },
        { id: 'duo', kind: 'stage', weekend_count: '2', duration_min: '40' },
        { id: 'feast-act', kind: 'dedicated', parent_event: 'feast', location_rule: 'Required', allowed_locations: 'hall' },
      ],
    });
    expect(issues).toEqual([]);
    expect(activities.map((a) => a.continuousDays)).toEqual([['sat', 'sun'], [], []]);
    expect(activities[1]!.weekendCount).toBe(2);
    expect(activities[2]).toMatchObject({ parentEvent: 'feast', locationRule: 'required', allowedLocations: ['hall'] });
  });

  it('reports bad cells without failing the row', () => {
    const { activities, issues } = parse({
      activities: [{ id: 'act', kind: 'stage', sat_count: 'three', active: 'maybe', continuous: 'mon' }],
    });
    expect(activities).toHaveLength(1);
    expect(activities[0]!.counts.sat).toBeNull();
    expect(activities[0]!.active).toBe(true);
    expect(issues.map((i) => i.field)).toEqual(['continuous', 'sat_count', 'active']);
  });

  it('skips rows that cannot be used, and blank rows silently', () => {
    const { activities, issues } = parse({
      activities: [
        { id: '', kind: 'stage' },
        { id: 'x', kind: 'juggling' },
        { id: 'x', kind: 'stage' },
        { id: 'x', kind: 'stage' },
        { id: '', kind: '' },
      ],
    });
    expect(activities.map((a) => a.id)).toEqual(['x']);
    expect(issues.map((i) => i.message)).toEqual([
      'Missing id; row ignored',
      '"juggling" must be one of: stage, dedicated, ambient, roaming, event',
      'Duplicate id "x"; this row is ignored',
    ]);
    expect(issues[0]!.row).toBe('row 2');
  });
});

describe('locations', () => {
  it('parses type, hours and capabilities', () => {
    const { locations, issues } = parse({
      locations: [{ id: 'grove', name: 'Grove', type: 'Stage', sat_open: '11:00', provides: 'power', active: '' }],
    });
    expect(issues).toEqual([]);
    expect(locations[0]).toMatchObject({ type: 'stage', provides: ['power'], active: true });
    expect(locations[0]!.hours.sat).toEqual({ open: 660, close: null });
  });
});

describe('schedule', () => {
  const row = (over: RawRow): RawRow => ({
    id: 'act-sat-2',
    activity_id: 'act',
    day: 'sat',
    performance_no: '2',
    location_id: 'main',
    start_time: '13:15',
    rev: '4',
    ...over,
  });

  it('parses a placed row', () => {
    const { schedule, issues } = parse({ schedule: [row({ locked: 'TRUE' })] });
    expect(issues).toEqual([]);
    expect(schedule[0]).toMatchObject({ id: 'act-sat-2', performanceNo: 2, start: 795, locked: true, rev: 4 });
  });

  it('rejects rows whose id does not match their parts', () => {
    const { schedule, issues } = parse({ schedule: [row({ id: 'act-sun-2' })] });
    expect(schedule).toEqual([]);
    expect(issues[0]!.message).toContain('id should be "act-sat-2"');
  });

  it('treats a half-placed row as unscheduled', () => {
    const { schedule, issues } = parse({ schedule: [row({ start_time: '' })] });
    expect(schedule[0]).toMatchObject({ locationId: null, start: null });
    expect(issues).toHaveLength(1);
  });

  it('treats a cleared row as unscheduled without complaint', () => {
    const { schedule, issues } = parse({ schedule: [row({ location_id: '', start_time: '' })] });
    expect(schedule[0]).toMatchObject({ locationId: null, start: null, rev: 4 });
    expect(issues).toEqual([]);
  });
});
