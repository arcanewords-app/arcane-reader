import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  isAnnouncementScheduledActive,
  resolveAlertMessage,
  truncateAlertMessage,
} from '../pure/announcements.js';
import type { AnnouncementAlertRow } from '../transforms/news.js';

function makeAlertRow(overrides: Partial<AnnouncementAlertRow> = {}): AnnouncementAlertRow {
  return {
    id: 'a1',
    news_post_id: null,
    message: '  Short message  ',
    cta_label: null,
    cta_url: null,
    variant: 'info',
    min_role: 'user',
    starts_at: null,
    ends_at: null,
    is_active: true,
    priority: 0,
    content_version: 1,
    dismissible: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('announcements pure helpers', () => {
  it('truncateAlertMessage adds ellipsis when over max', () => {
    const long = 'a'.repeat(200);
    const result = truncateAlertMessage(long, 160);
    assert.ok(result.endsWith('…'));
    assert.ok(result.length <= 160);
  });

  it('resolveAlertMessage prefers alert message over news summary', () => {
    assert.equal(resolveAlertMessage(makeAlertRow(), 'News summary'), 'Short message');
  });

  it('isAnnouncementScheduledActive respects window', () => {
    const now = new Date('2026-07-12T12:00:00Z');
    assert.equal(
      isAnnouncementScheduledActive(makeAlertRow({ starts_at: '2026-08-01T00:00:00Z' }), now),
      false
    );
    assert.equal(isAnnouncementScheduledActive(makeAlertRow(), now), true);
  });
});
