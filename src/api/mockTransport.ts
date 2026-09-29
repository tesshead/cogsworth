import { MOCK_ACTIVITIES, MOCK_LOCATIONS, MOCK_SCHEDULE } from './mockData';
import type { LoadResult, Transport } from './transport';

/** In-memory API over invented data. `latencyMs` imitates Apps Script's slow responses. */
export function mockTransport({ latencyMs = 300 } = {}): Transport {
  return {
    label: 'Mock data',
    async load(): Promise<LoadResult> {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
      return {
        serverTime: new Date().toISOString(),
        activities: structuredClone(MOCK_ACTIVITIES),
        locations: structuredClone(MOCK_LOCATIONS),
        schedule: structuredClone(MOCK_SCHEDULE),
      };
    },
  };
}
