import { describe, expect, it } from 'vitest';
import type { Activity, ScheduleRow } from '../domain/types';
import { activity, makeModel, placed } from '../test/builders';
import type { WarningCode } from './types';
import { validate } from './validate';

function warnings(activities: Activity[], rows: ScheduleRow[], code?: WarningCode) {
  return validate(makeModel(activities, rows)).filter((w) => !code || w.code === code);
}

// Most tests place one instance of activities with count 1/0 so count warnings stay quiet.
const one = (id: string, over: Partial<Activity> = {}) => activity(id, { counts: { sat: 1, sun: 0 }, ...over });

describe('location-overlap', () => {
  it('flags overlapping shows on a stage', () => {
    const ws = warnings([one('a'), one('b')], [placed('a', 'sat', 1, ['main', '12:00']), placed('b', 'sat', 1, ['main', '12:15'])]);
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ code: 'location-overlap', severity: 'error', instanceIds: ['a-sat-1', 'b-sat-1'] });
    expect(ws[0]!.message).toBe('a (12:00 PM–12:30 PM) and b (12:15 PM–12:45 PM) overlap at Main Stage');
  });

  it('allows back-to-back shows and overlaps at ambient locations', () => {
    const rows = [
      placed('a', 'sat', 1, ['main', '12:00']),
      placed('b', 'sat', 1, ['main', '12:30']),
      placed('c', 'sat', 1, ['gate', '12:00']),
      placed('d', 'sat', 1, ['gate', '12:00']),
    ];
    const ambient = { kind: 'ambient' as const };
    expect(warnings([one('a'), one('b'), one('c', ambient), one('d', ambient)], rows)).toEqual([]);
  });

  it('counts setup and breakdown as occupied time', () => {
    const ws = warnings(
      [one('aerial', { setupMin: 15, breakdownMin: 15, durationMin: 15 }), one('b')],
      [placed('aerial', 'sat', 1, ['side', '12:00']), placed('b', 'sat', 1, ['side', '12:15'])],
      'location-overlap',
    );
    expect(ws).toHaveLength(1);
  });

  describe('events', () => {
    const feast = one('feast', { kind: 'event', durationMin: 60, allowedLocations: ['hall'] });
    const feastAct = one('feast-act', { kind: 'dedicated', durationMin: 60, parentEvent: 'feast' });
    const rows = [placed('feast', 'sat', 1, ['hall', '12:00']), placed('feast-act', 'sat', 1, ['hall', '12:00'])];

    it('allows a child to overlap its parent event', () => {
      expect(warnings([feast, feastAct], rows)).toEqual([]);
    });

    it('flags an unrelated performance overlapping the event', () => {
      const ws = warnings([feast, feastAct, one('stray', { kind: 'dedicated' })], [...rows, placed('stray', 'sat', 1, ['hall', '12:15'])], 'location-overlap');
      expect(ws.map((w) => w.instanceIds)).toEqual([
        ['feast-sat-1', 'stray-sat-1'],
        ['feast-act-sat-1', 'stray-sat-1'],
      ]);
    });

    it('flags two children of the same event overlapping each other', () => {
      const other = one('other-act', { kind: 'dedicated', parentEvent: 'feast' });
      const ws = warnings([feast, feastAct, other], [...rows, placed('other-act', 'sat', 1, ['hall', '12:30'])], 'location-overlap');
      expect(ws.map((w) => w.instanceIds)).toEqual([['feast-act-sat-1', 'other-act-sat-1']]);
    });

    it('flags two events overlapping', () => {
      const tea = one('tea', { kind: 'event', durationMin: 60 });
      const ws = warnings([feast, tea], [rows[0]!, placed('tea', 'sat', 1, ['hall', '12:30'])], 'location-overlap');
      expect(ws).toHaveLength(1);
    });
  });
});

describe('performer-overlap', () => {
  it('flags the same performer in two places across activities', () => {
    const ws = warnings(
      [one('show', { performerId: 'pat' }), one('stroll', { performerId: 'pat', kind: 'roaming' })],
      [placed('show', 'sat', 1, ['main', '12:00']), placed('stroll', 'sat', 1, ['lanes', '12:20'])],
      'performer-overlap',
    );
    expect(ws).toHaveLength(1);
    expect(ws[0]!.message).toBe('show at Main Stage (12:00 PM–12:30 PM) and stroll at Lanes (12:20 PM–12:50 PM) need the same performer');
  });

  it('still applies between an event child and the performer’s other activities', () => {
    const ws = warnings(
      [
        one('feast', { kind: 'event', durationMin: 60 }),
        one('feast-act', { kind: 'dedicated', durationMin: 60, parentEvent: 'feast', performerId: 'kat' }),
        one('demo', { kind: 'dedicated', durationMin: 15, performerId: 'kat' }),
      ],
      [placed('feast', 'sat', 1, ['hall', '12:00']), placed('feast-act', 'sat', 1, ['hall', '12:00']), placed('demo', 'sat', 1, ['arena', '12:30'])],
      'performer-overlap',
    );
    expect(ws.map((w) => w.activityIds)).toEqual([['feast-act', 'demo']]);
  });

  it('includes setup and breakdown time', () => {
    const ws = warnings(
      [one('aerial', { performerId: 'lee', durationMin: 15, setupMin: 15 }), one('talk', { performerId: 'lee', durationMin: 30 })],
      [placed('talk', 'sat', 1, ['main', '11:00']), placed('aerial', 'sat', 1, ['side', '11:40'])],
      'performer-overlap',
    );
    expect(ws).toHaveLength(1);
  });

  it('lets shows carve through the same performer’s continuous roaming', () => {
    const roam = activity('roam', { kind: 'roaming', performerId: 'pat', counts: { sat: null, sun: null }, durationMin: null, continuousDays: ['sat'] });
    expect(warnings([roam, one('show', { performerId: 'pat' })], [placed('show', 'sat', 1, ['main', '12:00'])])).toEqual([]);
  });
});

describe('outside-parent-event', () => {
  it('warns when a child is not inside its event at the same location', () => {
    const feast = one('feast', { kind: 'event', durationMin: 60 });
    const child = one('feast-act', { kind: 'dedicated', durationMin: 60, parentEvent: 'feast' });
    const ws = warnings([feast, child], [placed('feast', 'sat', 1, ['hall', '12:00']), placed('feast-act', 'sat', 1, ['hall', '12:30'])]);
    expect(ws.map((w) => w.code)).toEqual(['outside-parent-event']);
  });
});

describe('allowed locations', () => {
  it('is an error when required and info when preferred', () => {
    const ws = warnings(
      [
        one('must', { allowedLocations: ['grove'], locationRule: 'required' }),
        one('likes', { allowedLocations: ['side', 'grove'] }),
      ],
      [placed('must', 'sat', 1, ['main', '12:00']), placed('likes', 'sat', 1, ['main', '13:00'])],
    );
    expect(ws.map((w) => [w.code, w.severity, w.message])).toEqual([
      ['required-location', 'error', 'must must be at Grove, not Main Stage'],
      ['preferred-location', 'info', 'likes prefers Side Stage or Grove (placed at Main Stage)'],
    ]);
  });
});

describe('missing-capability', () => {
  it('warns when the location lacks a requirement', () => {
    const pyro = one('pyro', { requires: ['fire-safe'] });
    expect(warnings([pyro], [placed('pyro', 'sat', 1, ['side', '12:00'])])).toEqual([]);
    const ws = warnings([pyro], [placed('pyro', 'sat', 1, ['grove', '12:00'])]);
    expect(ws.map((w) => w.message)).toEqual(["pyro requires fire-safe; Grove doesn't provide it"]);
  });
});

describe('performer-availability', () => {
  it('warns when the slot does not fit the window', () => {
    const early = one('early', { availability: { sat: { from: null, until: 18 * 60 }, sun: { from: null, until: null } } });
    expect(warnings([early], [placed('early', 'sat', 1, ['main', '17:30'])])).toEqual([]);
    const ws = warnings([early], [placed('early', 'sat', 1, ['main', '17:45'])]);
    expect(ws.map((w) => w.message)).toEqual(['early (5:45 PM–6:15 PM) is outside their availability (open–6:00 PM)']);
  });
});

describe('location-hours', () => {
  it('uses location hours, falling back to event hours', () => {
    const ws = warnings(
      [activity('a', { counts: { sat: 1, sun: 1 } })],
      [placed('a', 'sat', 1, ['grove', '10:30']), placed('a', 'sun', 1, ['main', '16:45'])],
    );
    expect(ws.map((w) => w.message)).toEqual([
      'a (10:30 AM–11:00 AM) is outside Grove hours (11:00 AM–8:00 PM)',
      'a (4:45 PM–5:15 PM) is outside Main Stage hours (10:00 AM–5:00 PM)',
    ]);
  });
});

describe('min-break', () => {
  it('warns when consecutive appearances are too close', () => {
    const act = activity('act', { counts: { sat: 3, sun: 0 }, minBreakMin: 30 });
    const ws = warnings([act], [
      placed('act', 'sat', 1, ['main', '10:00']),
      placed('act', 'sat', 2, ['side', '10:45']),
      placed('act', 'sat', 3, ['main', '11:45']),
    ]);
    expect(ws.map((w) => w.message)).toEqual(['Only 15 min between act and act; needs 30']);
  });
});

describe('counts', () => {
  it('reports under- and over-scheduled days', () => {
    const act = activity('act', { counts: { sat: 2, sun: 0 } });
    expect(warnings([act], [placed('act', 'sat', 1, ['main', '10:00'])]).map((w) => w.message)).toEqual([
      'act: 1 of 2 placed on Saturday',
    ]);
    const over = warnings([act], [
      placed('act', 'sat', 1, ['main', '10:00']),
      placed('act', 'sat', 2, ['main', '11:00']),
      placed('act', 'sat', 3, ['main', '12:00']),
    ]);
    expect(over.map((w) => [w.code, w.message])).toEqual([['over-scheduled', 'act: 3 of 2 placed on Saturday']]);
  });

  it('measures weekend counts across both days', () => {
    const duo = activity('duo', { counts: { sat: null, sun: null }, weekendCount: 2, durationMin: 40 });
    expect(warnings([duo], [placed('duo', 'sat', 1, ['main', '18:00'])]).map((w) => w.message)).toEqual([
      'duo: 1 of 2 placed this weekend',
    ]);
    expect(warnings([duo], [placed('duo', 'sat', 1, ['main', '18:00']), placed('duo', 'sun', 1, ['main', '12:00'])])).toEqual([]);
  });

  it('never warns about flexible or continuous counts', () => {
    const filler = activity('filler', { counts: { sat: null, sun: null }, flexibleCount: true, durationMin: 15 });
    const roam = activity('roam', { kind: 'roaming', counts: { sat: null, sun: null }, durationMin: null, continuousDays: ['sat'] });
    expect(warnings([filler, roam], [])).toEqual([]);
  });

  it('reports placed rows for inactive or unknown activities', () => {
    const ws = warnings(
      [activity('gone', { active: false })],
      [placed('gone', 'sat', 1, ['main', '10:00']), placed('ghost', 'sun', 1, ['main', '10:00'])],
    );
    expect(ws.map((w) => [w.code, w.message])).toEqual([
      ['orphan', 'gone is inactive but still placed'],
      ['orphan', 'Schedule row ghost-sun-1 refers to unknown activity "ghost"'],
    ]);
  });
});

describe('kind-mismatch', () => {
  it('notes a roaming activity placed on a stage, but not events', () => {
    const ws = warnings(
      [one('juggler', { kind: 'roaming' }), one('contest', { kind: 'event' })],
      [placed('juggler', 'sat', 1, ['main', '10:00']), placed('contest', 'sat', 1, ['side', '10:00'])],
    );
    expect(ws.map((w) => [w.code, w.severity])).toEqual([['kind-mismatch', 'info']]);
  });
});

it('sorts warnings by severity', () => {
  const ws = warnings(
    [one('a', { kind: 'roaming' }), one('b')],
    [placed('a', 'sat', 1, ['main', '12:00']), placed('b', 'sat', 1, ['main', '12:15'])],
  );
  expect(ws.map((w) => w.severity)).toEqual(['error', 'info']);
});
