import { MOCK_ACCEPTANCES, MOCK_ACTIVITIES, MOCK_LOCATIONS, MOCK_SCHEDULE } from './mockData';
import { createMockServer, type MockServer } from './mockServer';
import type { Transport } from './transport';

export interface MockOptions {
  /** Imitates Apps Script's slow responses. */
  latencyMs?: number;
  /** Fraction of saves that fail with a network error, for trying out retries. */
  failRate?: number;
  server?: MockServer;
}

/** In-memory API over invented data. State resets on page reload. */
export function mockTransport({ latencyMs = 400, failRate = 0, server }: MockOptions = {}): Transport & { server: MockServer } {
  const srv = server ?? createMockServer({ activities: MOCK_ACTIVITIES, locations: MOCK_LOCATIONS, schedule: MOCK_SCHEDULE, acceptances: MOCK_ACCEPTANCES });
  const respond = async <T>(fn: () => T, canFail = false): Promise<T> => {
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
    if (canFail && Math.random() < failRate) throw new Error('Network error (simulated)');
    return fn();
  };
  return {
    label: 'Mock data',
    server: srv,
    load: () => respond(() => srv.load()),
    save: (changes, updatedBy) => respond(() => srv.save(changes, updatedBy), true),
    review: (activityIds) => respond(() => srv.review(activityIds)),
  };
}
