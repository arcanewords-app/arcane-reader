import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  getInvocationAbortSignal,
  isInvocationAbortError,
  isInvocationAborted,
  runWithAbortSignal,
} from './invocationAbort.js';

describe('invocationAbort', () => {
  it('exposes the signal inside runWithAbortSignal and not outside', () => {
    const controller = new AbortController();
    assert.equal(getInvocationAbortSignal(), undefined);
    runWithAbortSignal(controller.signal, () => {
      assert.equal(getInvocationAbortSignal(), controller.signal);
      assert.equal(isInvocationAborted(), false);
    });
    assert.equal(getInvocationAbortSignal(), undefined);
  });

  it('treats AbortError and APIUserAbortError as abort errors', () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const userAbort = Object.assign(new Error('Request was aborted.'), {
      name: 'APIUserAbortError',
    });
    assert.equal(isInvocationAbortError(abortErr), true);
    assert.equal(isInvocationAbortError(userAbort), true);
    assert.equal(isInvocationAbortError(new Error('boom')), false);
  });

  it('treats any error as abort when the ALS signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    runWithAbortSignal(controller.signal, () => {
      assert.equal(isInvocationAborted(), true);
      assert.equal(isInvocationAbortError(new Error('Cancelled')), true);
    });
  });
});
