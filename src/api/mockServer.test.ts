import { describe, expect, it } from 'vitest';
import { createMockServer } from './mockServer';
import type { Change } from './transport';

const seed = () =>
  createMockServer({
    activities: [{ id: 'act', kind: 'stage' }],
    locations: [{ id: 'main', type: 'stage' }],
    schedule: [{ id: 'act-sat-1', activity_id: 'act', day: 'sat', performance_no: '1', location_id: 'main', start_time: '10:00', rev: '3' }],
  });

const change = (over: Partial<Change>): Change => ({ id: 'act-sat-1', activity_id: 'act', day: 'sat', performance_no: 1, base_rev: 3, ...over });

describe('mock server save', () => {
  it('updates a row, bumping rev and recording who', () => {
    const [result] = seed().save([change({ set: { location_id: 'main', start_time: '11:15' } })], 'Tess', new Date('2026-11-01T12:00:00Z'));
    expect(result).toMatchObject({
      status: 'ok',
      row: { start_time: '11:15', rev: '4', updated_by: 'Tess', updated_at: '2026-11-01T12:00:00.000Z' },
    });
  });

  it('creates a missing row when base_rev is 0', () => {
    const server = seed();
    const [result] = server.save([change({ id: 'act-sat-2', performance_no: 2, base_rev: 0, set: { location_id: 'main', start_time: '12:00' } })], 'Tess');
    expect(result).toMatchObject({ status: 'ok', row: { id: 'act-sat-2', rev: '1', locked: 'FALSE' } });
    expect(server.load().schedule).toHaveLength(2);
  });

  it('returns the current row on a stale base_rev', () => {
    const [result] = seed().save([change({ base_rev: 2, set: { start_time: '12:00' } })], 'Tess');
    expect(result).toMatchObject({ status: 'conflict', row: { start_time: '10:00', rev: '3' } });
  });

  it('clears a placement without deleting the row', () => {
    const server = seed();
    server.save([change({ set: { location_id: null, start_time: null } })], 'Tess');
    expect(server.load().schedule[0]).toMatchObject({ location_id: '', start_time: '', rev: '4' });
  });

  it('rejects bad input', () => {
    const results = seed().save(
      [
        change({ id: 'act-sun-1' }),
        change({ activity_id: 'nope', id: 'nope-sat-1' }),
        change({ set: { location_id: 'moon', start_time: '10:00' } }),
        change({ set: { start_time: '9:00' } }),
        change({ set: { location_id: null } }),
      ],
      'Tess',
    );
    expect(results.map((r) => r.status)).toEqual(['error', 'error', 'error', 'error', 'error']);
  });
});
