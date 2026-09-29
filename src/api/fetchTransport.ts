// GitHub Pages → Apps Script web app. Requests are "simple" CORS requests (POST with a
// text/plain body) because Apps Script can't answer a preflight. See docs/design.md §5.

import type { Change, ChangeResult, LoadResult, Transport } from './transport';

export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function isUnauthorized(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'unauthorized';
}

export function fetchTransport(url: string, getKey: () => string): Transport {
  async function call<T>(body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...body, key: getKey() }),
        redirect: 'follow',
      });
    } catch {
      throw new ApiError('network', 'Could not reach the Apps Script API');
    }
    let json: { ok?: boolean; error?: { code?: string; message?: string } } & Record<string, unknown>;
    try {
      json = await res.json();
    } catch {
      throw new ApiError('bad_response', `Unexpected response (HTTP ${res.status}); is the deployment URL right?`);
    }
    if (!json.ok) throw new ApiError(json.error?.code ?? 'server_error', json.error?.message ?? 'Unknown error');
    return json as T;
  }

  return {
    label: 'Google Sheet',
    load: () => call<LoadResult>({ action: 'load' }),
    save: async (changes: Change[], updatedBy: string) =>
      (await call<{ results: ChangeResult[] }>({ action: 'save', changes, updatedBy })).results,
  };
}
