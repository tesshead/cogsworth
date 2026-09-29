import { describe, expect, it } from 'vitest';
import { activity, makeModel, placed } from '../../test/builders';
import { assignLanes, buildColumns, type SectionKey } from './layout';

describe('assignLanes', () => {
  it('keeps non-overlapping items full width', () => {
    const lanes = assignLanes([
      { id: 'a', start: 0, end: 30 },
      { id: 'b', start: 30, end: 60 },
    ]);
    expect([...lanes]).toEqual([
      ['a', { lane: 0, lanes: 1 }],
      ['b', { lane: 0, lanes: 1 }],
    ]);
  });

  it('shares lanes within a cluster and reuses freed lanes', () => {
    const lanes = assignLanes([
      { id: 'long', start: 0, end: 90 },
      { id: 'early', start: 0, end: 30 },
      { id: 'late', start: 45, end: 75 },
      { id: 'after', start: 120, end: 150 },
    ]);
    expect(lanes.get('long')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('early')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('late')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('after')).toEqual({ lane: 0, lanes: 1 });
  });
});

describe('buildColumns', () => {
  const all = new Set<SectionKey>(['stage', 'ambient', 'dedicated', 'roaming']);
  const model = makeModel(
    [
      activity('show', { counts: { sat: 1, sun: 0 } }),
      activity('feast', { kind: 'event', counts: { sat: 1, sun: 0 } }),
      activity('roam', { kind: 'roaming', counts: { sat: null, sun: null }, durationMin: null, continuousDays: ['sat'] }),
      activity('deer', { kind: 'roaming', counts: { sat: 1, sun: 0 } }),
    ],
    [placed('show', 'sat', 1, ['grove', '12:00']), placed('feast', 'sat', 1, ['hall', '12:00']), placed('deer', 'sat', 1, ['lanes', '13:00'])],
  );

  it('orders sections and uses location hours', () => {
    const cols = buildColumns(model, 'sat', all);
    expect(cols.map((c) => c.key)).toEqual(['main', 'side', 'grove', 'gate', 'arena', 'hall', 'roaming:deer', 'roaming:roam']);
    const grove = cols.find((c) => c.key === 'grove')!;
    expect([grove.open, grove.close, grove.items.length]).toEqual([660, 1200, 1]);
  });

  it('separates events and gives roamers their own lanes', () => {
    const cols = buildColumns(model, 'sat', all);
    const hall = cols.find((c) => c.key === 'hall')!;
    expect([hall.items.length, hall.events.length]).toEqual([0, 1]);
    expect(cols.find((c) => c.key === 'roaming:roam')!.bands).toHaveLength(1);
    expect(cols.find((c) => c.key === 'roaming:deer')!.items).toHaveLength(1);
  });

  it('hides sections that are toggled off and roamers with nothing that day', () => {
    expect(buildColumns(model, 'sat', new Set(['stage'])).map((c) => c.section)).toEqual(['stage', 'stage', 'stage']);
    expect(buildColumns(model, 'sun', new Set(['roaming'])).map((c) => c.key)).toEqual([]);
  });
});
