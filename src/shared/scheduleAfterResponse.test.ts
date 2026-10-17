import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockWaitUntil, mockError } = vi.hoisted(() => ({
  mockWaitUntil: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: mockWaitUntil,
}));

vi.mock('../logger.js', () => ({
  logger: { error: mockError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { scheduleAfterResponse } from './scheduleAfterResponse.js';

describe('scheduleAfterResponse', () => {
  afterEach(() => {
    delete process.env.VERCEL;
    mockWaitUntil.mockReset();
    mockError.mockReset();
  });

  it('runs on the next tick and does not call waitUntil when VERCEL is unset', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    scheduleAfterResponse(task);
    expect(mockWaitUntil).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(task).toHaveBeenCalledOnce();
  });

  it('passes the task promise to waitUntil only when VERCEL is set', async () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = '1';
    const task = vi.fn().mockResolvedValue(undefined);
    scheduleAfterResponse(task);
    await Promise.resolve();
    expect(task).toHaveBeenCalledOnce();
    expect(mockWaitUntil).toHaveBeenCalledOnce();
    await mockWaitUntil.mock.calls[0]?.[0];
    if (prev === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev;
  });
});
