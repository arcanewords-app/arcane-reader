import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./debug/buffer.js', () => ({
  addDebugLogEntry: vi.fn(),
}));

const ORIGINAL_ENV = { ...process.env };

describe('logger', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe('getLoggingStatus', () => {
    it('reports stdout-only when shipping is disabled', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.LOG_SHIPPING;
      delete process.env.AXIOM_TOKEN;
      delete process.env.AXIOM_DATASET;

      const { getLoggingStatus } = await import('./logger.js');
      const status = getLoggingStatus();

      expect(status.shippingEnabled).toBe(false);
      expect(status.axiomConfigured).toBe(false);
      expect(status.transport).toBe('stdout-only');
      expect(status.dataset).toBeNull();
    });

    it('reports multistream when shipping is fully configured', async () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_SHIPPING = '1';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_DATASET = 'arcane-logs';

      const { getLoggingStatus } = await import('./logger.js');
      const status = getLoggingStatus();

      expect(status.shippingEnabled).toBe(true);
      expect(status.axiomConfigured).toBe(true);
      expect(status.transport).toBe('multistream-main-thread');
      expect(status.dataset).toBe('arcane-logs');
    });

    it('accepts LOG_SHIPPING=true as enabled flag', async () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_SHIPPING = 'true';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_DATASET = 'arcane-logs';

      const { getLoggingStatus } = await import('./logger.js');

      expect(getLoggingStatus().shippingEnabled).toBe(true);
    });

    it('tracks axiom url, edge, and region configuration', async () => {
      process.env.AXIOM_REGION = 'eu';
      process.env.AXIOM_URL = 'https://api.eu.axiom.co';
      process.env.AXIOM_EDGE = 'eu-central-1.aws.edge.axiom.co';

      const { getLoggingStatus } = await import('./logger.js');
      const status = getLoggingStatus();

      expect(status.axiomRegion).toBe('eu');
      expect(status.axiomUrlConfigured).toBe(true);
      expect(status.axiomEdgeConfigured).toBe(true);
    });
  });

  describe('createRequestLogger', () => {
    it('creates child logger with request bindings', async () => {
      process.env.NODE_ENV = 'development';
      const { createRequestLogger } = await import('./logger.js');

      const child = createRequestLogger({ requestId: 'req-abc', userId: 'user-1' });

      expect(child.bindings()).toMatchObject({
        requestId: 'req-abc',
        userId: 'user-1',
      });
    });
  });

  describe('flushLogs', () => {
    it('resolves without error when axiom client is not configured', async () => {
      process.env.NODE_ENV = 'development';
      const { flushLogs } = await import('./logger.js');

      await expect(flushLogs()).resolves.toBeUndefined();
    });
  });
});
