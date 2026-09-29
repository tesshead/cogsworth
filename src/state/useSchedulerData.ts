// Loads Sheet data through a transport and derives the model and warnings.
// Read-only for now; the reducer and sync queue arrive with drag and drop (M4).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Transport } from '../api/transport';
import { buildModel, type Model } from '../domain/model';
import { parseSheetData } from '../domain/parse';
import type { Warning } from '../validation/types';
import { validate } from '../validation/validate';

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: Model; warnings: Warning[]; loadedAt: string };

export function useSchedulerData(transport: Transport) {
  const [raw, setRaw] = useState<Awaited<ReturnType<Transport['load']>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setRaw(await transport.load());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [transport]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const state = useMemo<LoadState>(() => {
    if (error) return { status: 'error', message: error };
    if (!raw) return { status: 'loading' };
    const model = buildModel(parseSheetData(raw));
    return { status: 'ready', model, warnings: validate(model), loadedAt: raw.serverTime };
  }, [raw, error]);

  return { state, reload };
}
