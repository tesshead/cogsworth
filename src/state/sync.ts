// Pure state for optimistic edits and the save queue. See docs/design.md §6.
//
// - `server` holds schedule rows as last confirmed by the API (the source of truth).
// - `pending` holds local edits not yet sent, merged per instance.
// - `inFlight` holds the one batch currently being saved (empty when idle).
// What the board shows is server ⊕ inFlight ⊕ pending.

import type { RawRow } from '../domain/parse';
import type { DayKey } from '../domain/types';
import type { Change, ChangeResult, FieldSet, LoadResult } from '../api/transport';

export interface Patch {
  id: string;
  activityId: string;
  day: DayKey;
  n: number;
  set: FieldSet;
}

export interface Notice {
  seq: number;
  kind: 'conflict' | 'rejected' | 'load-failed' | 'review-failed';
  instanceId: string | null;
  /** Who made the change that won, for conflicts. */
  by: string;
  message: string;
}

export interface SyncState {
  base: Pick<LoadResult, 'activities' | 'locations' | 'acceptances' | 'serverTime'> | null;
  server: Map<string, RawRow>;
  pending: Map<string, Patch>;
  inFlight: Map<string, Patch>;
  /** Last save failure (network/auth). Saving pauses until a retry. */
  saveError: string | null;
  loadError: string | null;
  notices: Notice[];
  noticeSeq: number;
}

export type SyncAction =
  | { type: 'loaded'; data: LoadResult }
  | { type: 'loadFailed'; message: string }
  | { type: 'edit'; patch: Patch }
  | { type: 'sendStarted' }
  | { type: 'sendSucceeded'; results: ChangeResult[] }
  | { type: 'sendFailed'; message: string }
  | { type: 'retry' }
  | { type: 'reviewFailed'; message: string }
  | { type: 'dismissNotice'; seq: number };

export const initialSyncState: SyncState = {
  base: null,
  server: new Map(),
  pending: new Map(),
  inFlight: new Map(),
  saveError: null,
  loadError: null,
  notices: [],
  noticeSeq: 0,
};

const MAX_NOTICES = 6;

export function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case 'loaded': {
      // A load can race a save; never let an older row replace a newer one.
      const server = new Map<string, RawRow>();
      for (const row of action.data.schedule) {
        const known = state.server.get(row.id!);
        server.set(row.id!, known && rev(known) > rev(row) ? known : row);
      }
      const { activities, locations, acceptances, serverTime } = action.data;
      return { ...state, base: { activities, locations, acceptances: acceptances ?? null, serverTime }, server, loadError: null };
    }

    case 'loadFailed':
      return state.base
        ? addNotice({ ...state, loadError: action.message }, { kind: 'load-failed', instanceId: null, by: '', message: action.message })
        : { ...state, loadError: action.message };

    case 'edit': {
      const pending = new Map(state.pending);
      const existing = pending.get(action.patch.id);
      pending.set(action.patch.id, { ...action.patch, set: { ...existing?.set, ...action.patch.set } });
      return { ...state, pending };
    }

    case 'sendStarted':
      if (state.inFlight.size > 0 || state.pending.size === 0) return state;
      return { ...state, inFlight: state.pending, pending: new Map() };

    case 'sendSucceeded': {
      let next: SyncState = { ...state, saveError: null };
      const server = new Map(state.server);
      const pending = new Map(state.pending);
      const inFlight = new Map(state.inFlight);
      for (const result of action.results) {
        inFlight.delete(result.id);
        if (result.status === 'error') {
          pending.delete(result.id);
          next = addNotice(next, { kind: 'rejected', instanceId: result.id, by: '', message: result.message });
          continue;
        }
        if (result.row) server.set(result.id, result.row);
        else server.delete(result.id);
        if (result.status === 'conflict') {
          // The server's row wins, including over edits made on top of the stale one.
          pending.delete(result.id);
          next = addNotice(next, {
            kind: 'conflict',
            instanceId: result.id,
            by: result.row?.updated_by || 'someone',
            message: 'was changed by someone else; your change was replaced',
          });
        }
      }
      // Anything the server didn't answer goes back in the queue.
      for (const [id, patch] of inFlight) pending.set(id, mergePatch(patch, pending.get(id)));
      return { ...next, server, pending, inFlight: new Map() };
    }

    case 'sendFailed': {
      const pending = new Map(state.pending);
      for (const [id, patch] of state.inFlight) pending.set(id, mergePatch(patch, pending.get(id)));
      return { ...state, pending, inFlight: new Map(), saveError: action.message };
    }

    case 'retry':
      return { ...state, saveError: null };

    case 'reviewFailed':
      return addNotice(state, { kind: 'review-failed', instanceId: null, by: '', message: action.message });

    case 'dismissNotice':
      return { ...state, notices: state.notices.filter((n) => n.seq !== action.seq) };
  }
}

/** Changes for everything pending, based on the latest confirmed revs. */
export function buildChanges(state: SyncState): Change[] {
  return [...state.pending.values()].map((p) => {
    const row = state.server.get(p.id);
    return { id: p.id, activity_id: p.activityId, day: p.day, performance_no: p.n, base_rev: row ? rev(row) : 0, set: p.set };
  });
}

/** Schedule rows as the board should show them: server ⊕ in-flight ⊕ pending. */
export function effectiveSchedule(state: SyncState): RawRow[] {
  const ids = new Set([...state.server.keys(), ...state.inFlight.keys(), ...state.pending.keys()]);
  return [...ids].map((id) => {
    const patches = [state.inFlight.get(id), state.pending.get(id)].filter((p): p is Patch => p !== undefined);
    const first = patches[0];
    let row: RawRow = state.server.get(id) ?? (first ? { id, activity_id: first.activityId, day: first.day, performance_no: String(first.n) } : { id });
    for (const p of patches) row = applySet(row, p.set);
    return row;
  });
}

export function unsavedIds(state: SyncState): Set<string> {
  return new Set([...state.pending.keys(), ...state.inFlight.keys()]);
}

function applySet(row: RawRow, set: FieldSet): RawRow {
  const out = { ...row };
  if (set.location_id !== undefined) out.location_id = set.location_id ?? '';
  if (set.start_time !== undefined) out.start_time = set.start_time ?? '';
  if (set.duration_min !== undefined) out.duration_min = set.duration_min === null ? '' : String(set.duration_min);
  if (set.locked !== undefined) out.locked = set.locked ? 'TRUE' : 'FALSE';
  if (set.notes !== undefined) out.notes = set.notes;
  return out;
}

function mergePatch(older: Patch, newer: Patch | undefined): Patch {
  return newer ? { ...older, set: { ...older.set, ...newer.set } } : older;
}

function rev(row: RawRow): number {
  return Number(row.rev || 0);
}

function addNotice(state: SyncState, notice: Omit<Notice, 'seq'>): SyncState {
  const seq = state.noticeSeq + 1;
  return { ...state, noticeSeq: seq, notices: [...state.notices, { ...notice, seq }].slice(-MAX_NOTICES) };
}
