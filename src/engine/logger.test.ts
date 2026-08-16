import { afterEach, describe, expect, it, vi } from 'vitest';

const { debug, info, warn, error } = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { debug, info, warn, error },
}));

vi.mock('../debug/context.js', () => ({
  mergeDebugContext: (data: Record<string, unknown>) => ({ ...data, merged: true }),
}));

import { log } from './logger.js';

describe('engine log', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('forwards debug/info with optional data', () => {
    log.debug('d');
    log.info('i', { a: 1 });
    expect(debug).toHaveBeenCalledWith(expect.objectContaining({ merged: true }), 'd');
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ a: 1, merged: true }), 'i');
  });

  it('serializes Error for warn and error', () => {
    const err = new Error('boom');
    (err as { type?: string }).type = 'RateLimit';
    log.warn('w', err);
    log.error('e', err);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ errMessage: 'boom', errType: 'RateLimit', merged: true }),
      'w'
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ errMessage: 'boom', merged: true }),
      'e'
    );
  });
});
