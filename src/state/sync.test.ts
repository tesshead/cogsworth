import { describe, expect, it } from 'vitest';
import type { RawRow } from '../domain/parse';
import { buildChanges, effectiveSchedule, initialSyncState, syncReducer, unsavedIds, type Patch, type SyncAction, type SyncState } from './sync';

const serverRow = (id: string, over: RawRow = {}): RawRow => {
  const [activity, day, n] = id.split('-');
  return { id, activity_id: activity!, day: day!, performance_no: n!, location_id: 'main', start_time: '10:00', rev: '1', ...over };
};
const move = (id: string, location: string | null, start: string | null): Patch => {
  const [activityId, day, n] = id.split('-');
  return { id, activityId: activityId!, day: day as 'sat', n: Number(n), set: { location_id: location, start_time: start } };
};
const run = (state: SyncState, ...actions: SyncAction[]) => actions.reduce(syncReducer, state);
const loaded = (schedule: RawRow[]): SyncAction => ({ type: 'loaded', data: { serverTime: '', activities: [], locations: [], schedule } });
const rowOf = (s: SyncState, id: string) => effectiveSchedule(s).find((r) => r.id === id);

describe('optimistic edits', () => {
  it('shows pending edits over server rows and merges repeated edits', () => {
    const s = run(
      initialSyncState,
      loaded([serverRow('act-sat-1')]),
      { type: 'edit', patch: move('act-sat-1', 'side', '11:00') },
      { type: 'edit', patch: move('act-sat-1', 'glen', '12:00') },
    );
    expect(s.pending.size).toBe(1);
    expect(rowOf(s, 'act-sat-1')).toMatchObject({ location_id: 'glen', start_time: '12:00', rev: '1' });
  });

  it('builds a new row for an instance the server has never seen', () => {
    const s = run(initialSyncState, loaded([]), { type: 'edit', patch: move('act-sat-2', 'main', '13:00') });
    expect(rowOf(s, 'act-sat-2')).toEqual({ id: 'act-sat-2', activity_id: 'act', day: 'sat', performance_no: '2', location_id: 'main', start_time: '13:00' });
    expect(buildChanges(s)[0]).toMatchObject({ id: 'act-sat-2', base_rev: 0, performance_no: 2 });
  });

  it('writes a cleared placement as blanks', () => {
    const s = run(initialSyncState, loaded([serverRow('act-sat-1')]), { type: 'edit', patch: move('act-sat-1', null, null) });
    expect(rowOf(s, 'act-sat-1')).toMatchObject({ location_id: '', start_time: '' });
  });
});

describe('save queue', () => {
  const start = run(initialSyncState, loaded([serverRow('act-sat-1')]), { type: 'edit', patch: move('act-sat-1', 'side', '11:00') });

  it('sends pending edits with the confirmed rev and clears them on success', () => {
    expect(buildChanges(start)).toEqual([
      { id: 'act-sat-1', activity_id: 'act', day: 'sat', performance_no: 1, base_rev: 1, set: { location_id: 'side', start_time: '11:00' } },
    ]);
    const sent = syncReducer(start, { type: 'sendStarted' });
    expect([sent.pending.size, sent.inFlight.size]).toEqual([0, 1]);
    expect(rowOf(sent, 'act-sat-1')).toMatchObject({ location_id: 'side' });

    const done = syncReducer(sent, {
      type: 'sendSucceeded',
      results: [{ id: 'act-sat-1', status: 'ok', row: serverRow('act-sat-1', { location_id: 'side', start_time: '11:00', rev: '2' }) }],
    });
    expect(unsavedIds(done).size).toBe(0);
    expect(done.server.get('act-sat-1')!.rev).toBe('2');
  });

  it('holds edits made during a save and sends them next with the new rev', () => {
    const s = run(
      start,
      { type: 'sendStarted' },
      { type: 'edit', patch: move('act-sat-1', 'glen', '14:00') },
      { type: 'sendStarted' }, // ignored while a save is in flight
    );
    expect([s.pending.size, s.inFlight.size]).toEqual([1, 1]);
    expect(rowOf(s, 'act-sat-1')).toMatchObject({ location_id: 'glen' });

    const after = syncReducer(s, {
      type: 'sendSucceeded',
      results: [{ id: 'act-sat-1', status: 'ok', row: serverRow('act-sat-1', { location_id: 'side', start_time: '11:00', rev: '2' }) }],
    });
    expect(rowOf(after, 'act-sat-1')).toMatchObject({ location_id: 'glen' });
    expect(buildChanges(after)[0]!.base_rev).toBe(2);
  });

  it('lets the server row win a conflict, dropping later local edits for that instance', () => {
    const s = run(start, { type: 'sendStarted' }, { type: 'edit', patch: move('act-sat-1', 'glen', '14:00') }, {
      type: 'sendSucceeded',
      results: [{ id: 'act-sat-1', status: 'conflict', row: serverRow('act-sat-1', { start_time: '15:00', rev: '5', updated_by: 'Sam' }) }],
    });
    expect(unsavedIds(s).size).toBe(0);
    expect(rowOf(s, 'act-sat-1')).toMatchObject({ start_time: '15:00', rev: '5' });
    expect(s.notices).toMatchObject([{ kind: 'conflict', instanceId: 'act-sat-1', by: 'Sam' }]);
  });

  it('reverts a rejected change and reports it', () => {
    const s = run(start, { type: 'sendStarted' }, { type: 'sendSucceeded', results: [{ id: 'act-sat-1', status: 'error', message: 'Unknown location "side"' }] });
    expect(rowOf(s, 'act-sat-1')).toMatchObject({ location_id: 'main' });
    expect(s.notices[0]).toMatchObject({ kind: 'rejected', message: 'Unknown location "side"' });
  });

  it('requeues everything on a network failure, keeping newer edits on top', () => {
    const s = run(start, { type: 'sendStarted' }, { type: 'edit', patch: move('act-sat-1', 'glen', '14:00') }, { type: 'sendFailed', message: 'offline' });
    expect([s.pending.size, s.inFlight.size, s.saveError]).toEqual([1, 0, 'offline']);
    expect(s.pending.get('act-sat-1')!.set).toEqual({ location_id: 'glen', start_time: '14:00' });
    expect(syncReducer(s, { type: 'retry' }).saveError).toBeNull();
  });
});

describe('loading', () => {
  it('keeps the newer row when a load races a save', () => {
    const s = run(initialSyncState, loaded([serverRow('act-sat-1', { rev: '4', start_time: '12:00' })]), loaded([serverRow('act-sat-1', { rev: '3' })]));
    expect(s.server.get('act-sat-1')).toMatchObject({ rev: '4', start_time: '12:00' });
  });

  it('turns a failed refresh into a notice once data exists', () => {
    const first = syncReducer(initialSyncState, { type: 'loadFailed', message: 'offline' });
    expect([first.loadError, first.notices.length]).toEqual(['offline', 0]);
    const later = run(initialSyncState, loaded([]), { type: 'loadFailed', message: 'offline' });
    expect(later.notices[0]).toMatchObject({ kind: 'load-failed' });
    expect(syncReducer(later, { type: 'dismissNotice', seq: later.notices[0]!.seq }).notices).toEqual([]);
  });
});
