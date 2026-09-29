import { describe, expect, it } from 'vitest';
import { activity, makeModel, placed } from '../test/builders';
import { placedInstances } from './model';
import { cardNumber, happeningAt, unscheduledGroups } from './views';

describe('unscheduledGroups', () => {
  it('groups remaining instances per activity, lowest number next', () => {
    const m = makeModel([activity('act', { counts: { sat: 3, sun: 0 } })], [placed('act', 'sat', 1, ['main', '10:00'])]);
    expect(unscheduledGroups(m, 'sat').map((g) => [g.activity.id, g.remaining, g.nextInstanceId])).toEqual([['act', 2, 'act-sat-2']]);
    expect(unscheduledGroups(m, 'sun')).toEqual([]);
  });

  it('counts placed orphan rows toward the requirement', () => {
    const m = makeModel(
      [activity('act', { counts: { sat: 2, sun: 0 } })],
      [placed('act', 'sat', 1, ['main', '10:00']), placed('act', 'sat', 3, ['main', '12:00'])],
    );
    expect(unscheduledGroups(m, 'sat')).toEqual([]);
  });

  it('drops the other day once a weekend count is met', () => {
    const solo = activity('solo', { counts: { sat: null, sun: null }, weekendCount: 1, durationMin: 60 });
    expect(unscheduledGroups(makeModel([solo]), 'sun').map((g) => g.remaining)).toEqual([1]);
    const m = makeModel([solo], [placed('solo', 'sat', 1, ['gate', '11:00'])]);
    expect(unscheduledGroups(m, 'sun')).toEqual([]);
  });

  it('offers unlimited flexible cards, reusing cleared numbers', () => {
    const filler = activity('filler', { counts: { sat: null, sun: null }, flexibleCount: true, durationMin: 15 });
    const m = makeModel([filler], [placed('filler', 'sat', 1, ['main', '10:00']), placed('filler', 'sat', 2, null), placed('filler', 'sat', 3, ['side', '14:00'])]);
    expect(unscheduledGroups(m, 'sat')[0]).toMatchObject({ remaining: null, nextN: 2, nextInstanceId: 'filler-sat-2' });
  });

  it('skips inactive, continuous and duration-less activities', () => {
    const m = makeModel([
      activity('off', { active: false }),
      activity('roam', { kind: 'roaming', counts: { sat: null, sun: null }, durationMin: null, continuousDays: ['sat'] }),
      activity('tbd', { durationMin: null }),
    ]);
    expect(unscheduledGroups(m, 'sat')).toEqual([]);
  });
});

describe('cardNumber', () => {
  it('numbers chronologically, not by instance id', () => {
    const m = makeModel(
      [activity('act', { counts: { sat: 3, sun: 0 } })],
      [placed('act', 'sat', 3, ['main', '10:00']), placed('act', 'sat', 1, ['main', '14:00'])],
    );
    const byId = Object.fromEntries(placedInstances(m).map((i) => [i.id, cardNumber(m, i)]));
    expect(byId['act-sat-3']).toEqual({ ordinal: 1, of: 3 });
    expect(byId['act-sat-1']).toEqual({ ordinal: 2, of: 3 });
  });

  it('numbers weekend counts across days and leaves flexible open-ended', () => {
    const m = makeModel(
      [
        activity('duo', { counts: { sat: null, sun: null }, weekendCount: 2 }),
        activity('filler', { counts: { sat: null, sun: null }, flexibleCount: true }),
      ],
      [placed('duo', 'sun', 1, ['main', '10:00']), placed('duo', 'sat', 1, ['main', '19:00']), placed('filler', 'sat', 4, ['side', '12:00'])],
    );
    const byId = Object.fromEntries(placedInstances(m).map((i) => [i.id, cardNumber(m, i)]));
    expect(byId['duo-sat-1']).toEqual({ ordinal: 1, of: 2 });
    expect(byId['duo-sun-1']).toEqual({ ordinal: 2, of: 2 });
    expect(byId['filler-sat-4']).toEqual({ ordinal: 1, of: null });
  });
});

describe('happeningAt', () => {
  const roam = activity('roam', { kind: 'roaming', performerId: 'pat', counts: { sat: null, sun: null }, durationMin: null, continuousDays: ['sat'] });
  const show = activity('show', { performerId: 'pat', counts: { sat: 1, sun: 0 }, setupMin: 10 });
  const other = activity('other', { counts: { sat: 1, sun: 0 } });
  const m = makeModel([roam, show, other], [placed('show', 'sat', 1, ['main', '14:00']), placed('other', 'sat', 1, ['side', '14:15'])]);

  it('lists shows in progress and continuous roamers who are free', () => {
    const at = happeningAt(m, 'sat', 13 * 60);
    expect(at.instances).toEqual([]);
    expect(at.roaming.map((b) => b.activity.id)).toEqual(['roam']);
  });

  it('shows a roamer at their show instead of roaming, including setup', () => {
    expect(happeningAt(m, 'sat', 13 * 60 + 55).roaming).toEqual([]);
    const at = happeningAt(m, 'sat', 14 * 60 + 20);
    expect(at.instances.map((i) => i.id)).toEqual(['show-sat-1', 'other-sat-1']);
    expect(at.roaming).toEqual([]);
  });

  it('treats end times as exclusive', () => {
    expect(happeningAt(m, 'sat', 14 * 60 + 30).instances.map((i) => i.id)).toEqual(['other-sat-1']);
  });
});
