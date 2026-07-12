import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import { asUploadMiddleware } from './multerCompat.js';

describe('asUploadMiddleware', () => {
  it('casts unknown middleware to RequestHandler', () => {
    const fn = vi.fn();
    const handler = asUploadMiddleware(fn);
    assert.equal(handler, fn);
  });
});
