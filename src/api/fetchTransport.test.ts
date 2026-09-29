import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchTransport, isUnauthorized } from './fetchTransport';

const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('fetchTransport', () => {
  it('posts JSON as text/plain with the key, and unwraps results', async () => {
    const fetchMock = respond({ ok: true, results: [{ id: 'a-sat-1', status: 'ok', row: null }] });
    vi.stubGlobal('fetch', fetchMock);
    const results = await fetchTransport('https://example.test/exec', () => 'k').save([], 'Tess');
    expect(results).toEqual([{ id: 'a-sat-1', status: 'ok', row: null }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/exec');
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' });
    expect(JSON.parse(init.body as string)).toEqual({ action: 'save', changes: [], updatedBy: 'Tess', key: 'k' });
  });

  it('turns API errors into ApiError, recognising a bad key', async () => {
    vi.stubGlobal('fetch', respond({ ok: false, error: { code: 'unauthorized', message: 'Wrong or missing key' } }));
    const err = await fetchTransport('u', () => '').load().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isUnauthorized(err)).toBe(true);
  });

  it('explains non-JSON responses and network failures', async () => {
    vi.stubGlobal('fetch', respond('<html>Sign in</html>'));
    await expect(fetchTransport('u', () => '').load()).rejects.toThrow(/deployment URL/);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(fetchTransport('u', () => '').load()).rejects.toMatchObject({ code: 'network' });
  });
});
