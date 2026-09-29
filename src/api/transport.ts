// The API as the app sees it. Implementations: mockTransport (dev/tests); fetchTransport
// (GitHub Pages → Apps Script) and gasTransport (served from Apps Script) arrive in M3/M6.
// See docs/design.md §5.

import type { RawRow } from '../domain/parse';

export interface LoadResult {
  serverTime: string;
  activities: RawRow[];
  locations: RawRow[];
  schedule: RawRow[];
}

export interface Transport {
  /** Human-readable name shown in the toolbar, e.g. "Mock data". */
  readonly label: string;
  load(): Promise<LoadResult>;
}
