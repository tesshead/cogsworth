// The API as the app sees it. Implementations: mockTransport (dev/tests); fetchTransport
// (GitHub Pages → Apps Script) and gasTransport (served from Apps Script) arrive in M3/M6.
// See docs/design.md §5.

import type { RawRow } from '../domain/parse';
import type { DayKey } from '../domain/types';

export interface LoadResult {
  serverTime: string;
  activities: RawRow[];
  locations: RawRow[];
  schedule: RawRow[];
  /** Name/offer/days_agreed/confirmed from the Acceptances tab; null if there is none. */
  acceptances?: RawRow[] | null;
}

export interface ReviewResult {
  id: string;
  status: 'ok' | 'error';
  message?: string;
}

/** Fields a save may change. null clears the cell. */
export interface FieldSet {
  location_id?: string | null;
  start_time?: string | null;
  duration_min?: number | null;
  locked?: boolean;
  notes?: string;
}

export interface Change {
  id: string;
  activity_id: string;
  day: DayKey;
  performance_no: number;
  /** The row's rev the change was based on; 0 when the row isn't expected to exist. */
  base_rev: number;
  set?: FieldSet;
  /** Orphan cleanup only. */
  delete?: true;
}

export type ChangeResult =
  | { id: string; status: 'ok'; row: RawRow | null }
  | { id: string; status: 'conflict'; row: RawRow | null }
  | { id: string; status: 'error'; message: string };

export interface Transport {
  /** Human-readable name shown in the toolbar, e.g. "Mock data". */
  readonly label: string;
  load(): Promise<LoadResult>;
  /** Throws on network/auth failure; per-change problems come back as results. */
  save(changes: Change[], updatedBy: string): Promise<ChangeResult[]>;
  /** Marks activities as reviewed against their current Acceptances offer. */
  review(activityIds: string[]): Promise<ReviewResult[]>;
}
