// Wires the pure sync reducer to a transport: loads, derives the model and warnings from
// server ⊕ local edits, and runs the save queue (one request at a time, retry with backoff).

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { isUnauthorized } from '../api/fetchTransport';
import type { Transport } from '../api/transport';
import { buildModel, type Model } from '../domain/model';
import { parseSheetData } from '../domain/parse';
import type { Warning } from '../validation/types';
import { validate } from '../validation/validate';
import { buildChanges, effectiveSchedule, initialSyncState, syncReducer, unsavedIds, type Patch } from './sync';

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

export interface ScheduleView {
  model: Model;
  warnings: Warning[];
  unsaved: Set<string>;
}

/** `onUnauthorized` runs when the API rejects the key; saving then waits for `retryNow`. */
export function useScheduleStore(transport: Transport, updatedBy: string, onUnauthorized: () => void) {
  const [state, dispatch] = useReducer(syncReducer, initialSyncState);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sending = useRef(false);

  const reload = useCallback(async () => {
    try {
      dispatch({ type: 'loaded', data: await transport.load() });
    } catch (e) {
      if (isUnauthorized(e)) onUnauthorized();
      dispatch({ type: 'loadFailed', message: errorMessage(e) });
    }
  }, [transport, onUnauthorized]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Save queue: whenever nothing is in flight and edits are waiting, send them all.
  useEffect(() => {
    if (sending.current || state.inFlight.size > 0 || state.pending.size === 0 || state.saveError) return;
    const changes = buildChanges(state);
    sending.current = true;
    dispatch({ type: 'sendStarted' });
    transport
      .save(changes, updatedBy)
      .then((results) => {
        failures.current = 0;
        dispatch({ type: 'sendSucceeded', results });
      })
      .catch((e) => {
        dispatch({ type: 'sendFailed', message: errorMessage(e) });
        // A bad key won't fix itself: wait for a new one instead of retrying.
        if (isUnauthorized(e)) {
          onUnauthorized();
          return;
        }
        failures.current++;
        const delay = Math.min(RETRY_BASE_MS * 2 ** (failures.current - 1), RETRY_MAX_MS);
        retryTimer.current = setTimeout(() => dispatch({ type: 'retry' }), delay);
      })
      .finally(() => {
        sending.current = false;
      });
  }, [state, transport, updatedBy, onUnauthorized]);

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  const view = useMemo<ScheduleView | null>(() => {
    if (!state.base) return null;
    const model = buildModel(parseSheetData({ activities: state.base.activities, locations: state.base.locations, schedule: effectiveSchedule(state) }));
    return { model, warnings: validate(model), unsaved: unsavedIds(state) };
  }, [state]);

  const edit = useCallback((patch: Patch) => dispatch({ type: 'edit', patch }), []);
  const retryNow = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    dispatch({ type: 'retry' });
  }, []);
  const dismissNotice = useCallback((seq: number) => dispatch({ type: 'dismissNotice', seq }), []);

  return {
    view,
    loadError: state.loadError,
    saveError: state.saveError,
    saving: state.inFlight.size > 0,
    unsavedCount: state.pending.size + state.inFlight.size,
    notices: state.notices,
    reload,
    edit,
    retryNow,
    dismissNotice,
  };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
