import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors.js';
import { resetInFlightRequests } from './fetchDeduped.js';
import { fetchJson } from './fetchJson.js';

vi.mock('../../services/authService.js', () => ({
  authService: {
    getToken: () => 'test-token',
    refresh: vi.fn(async () => false),
    clearStorage: vi.fn(),
  },
  isReadingRoute: () => false,
  openAuthModal: vi.fn(),
  AUTH_CHANGED_EVENT: 'arcane:auth-changed',
}));

describe('fetchJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetInFlightRequests();
  });

  it('returns parsed JSON on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    } as Response);

    await expect(fetchJson<{ ok: boolean }>('/api/test')).resolves.toEqual({ ok: true });
  });

  it('throws ApiError with parsed body on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found', code: 'NOT_FOUND' }),
    } as Response);

    await expect(fetchJson('/api/missing')).rejects.toMatchObject({
      message: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns undefined for 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    } as Response);

    await expect(fetchJson('/api/empty')).resolves.toBeUndefined();
  });
});

describe('fetchJsonDeduped', () => {
  beforeEach(() => {
    resetInFlightRequests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetInFlightRequests();
  });

  it('dedupes concurrent GET requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ n: 1 }),
    } as Response);

    const { fetchJsonDeduped } = await import('./fetchDeduped.js');
    const [a, b] = await Promise.all([
      fetchJsonDeduped<{ n: number }>('/api/dedupe'),
      fetchJsonDeduped<{ n: number }>('/api/dedupe'),
    ]);

    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not dedupe when AbortSignal is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    } as Response);

    const { fetchJsonDeduped } = await import('./fetchDeduped.js');
    const controller = new AbortController();
    await Promise.all([
      fetchJsonDeduped('/api/signal', { signal: controller.signal }),
      fetchJsonDeduped('/api/signal', { signal: controller.signal }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchFormData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts FormData without Content-Type header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ uploaded: true }),
    } as Response);

    const { fetchFormData } = await import('./fetchFormData.js');
    const formData = new FormData();
    formData.append('file', new Blob(['x']), 'a.txt');

    await expect(fetchFormData('/api/upload', formData)).resolves.toEqual({ uploaded: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.body).toBe(formData);
  });

  it('throws ApiError on error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad upload' }),
    } as Response);

    const { fetchFormData } = await import('./fetchFormData.js');
    await expect(fetchFormData('/api/upload', new FormData())).rejects.toBeInstanceOf(ApiError);
  });
});
