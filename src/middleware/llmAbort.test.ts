import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { describe, it, vi } from 'vitest';
import { handleLlmAbort } from './llmAbort.js';

describe('handleLlmAbort', () => {
  it('returns false for non-abort errors', () => {
    const info = vi.fn();
    const req = { log: { info } } as unknown as Request;
    const res = { headersSent: false, status: vi.fn() } as unknown as Response;
    assert.equal(handleLlmAbort(new Error('boom'), req, res), false);
    assert.equal(info.mock.calls.length, 0);
  });

  it('logs llm.aborted and ends with 499 when headers are not sent', () => {
    const info = vi.fn();
    const end = vi.fn();
    const status = vi.fn(() => ({ end }));
    const req = { log: { info } } as unknown as Request;
    const res = { headersSent: false, status } as unknown as Response;
    const err = Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });

    assert.equal(handleLlmAbort(err, req, res), true);
    assert.equal(info.mock.calls.length, 1);
    const logPayload = (info.mock.calls as unknown as Array<[{ event: string }]>)[0][0];
    assert.equal(logPayload.event, 'llm.aborted');
    assert.equal(status.mock.calls.length, 1);
    const statusCode = (status.mock.calls as unknown as Array<[number]>)[0][0];
    assert.equal(statusCode, 499);
    assert.equal(end.mock.calls.length, 1);
  });

  it('does not write a body when headers were already sent', () => {
    const info = vi.fn();
    const status = vi.fn();
    const req = { log: { info } } as unknown as Request;
    const res = { headersSent: true, status } as unknown as Response;
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });

    assert.equal(handleLlmAbort(err, req, res), true);
    assert.equal(info.mock.calls.length, 1);
    assert.equal(status.mock.calls.length, 0);
  });
});
