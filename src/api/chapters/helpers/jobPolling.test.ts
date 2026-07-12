import { describe, expect, it } from 'vitest';
import { isJobOwnedByUser, setJobPollingNoStoreHeaders } from './jobPolling.js';

describe('jobPolling', () => {
  it('isJobOwnedByUser matches user and project', () => {
    const job = { userId: 'u1', projectId: 'p1' };
    expect(isJobOwnedByUser(job, 'u1', 'p1')).toBe(true);
    expect(isJobOwnedByUser(job, 'u2', 'p1')).toBe(false);
    expect(isJobOwnedByUser(null, 'u1', 'p1')).toBe(false);
  });

  it('setJobPollingNoStoreHeaders sets cache headers', () => {
    const headers: Record<string, string> = {};
    setJobPollingNoStoreHeaders({
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as never);
    expect(headers['Cache-Control']).toContain('no-store');
    expect(headers.Pragma).toBe('no-cache');
  });
});
