/**
 * Announcement alert message helpers — extracted from supabaseDatabase for unit testing.
 */

import type { AnnouncementAlertRow } from '../transforms/news.js';

export function truncateAlertMessage(text: string, max = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + '…';
}

export function resolveAlertMessage(
  alert: AnnouncementAlertRow,
  newsSummary?: string | null
): string {
  const raw = alert.message?.trim() || newsSummary?.trim() || '';
  return truncateAlertMessage(raw);
}

export function isAnnouncementScheduledActive(
  row: AnnouncementAlertRow,
  now = new Date()
): boolean {
  if (!row.is_active) return false;
  const ts = now.getTime();
  if (row.starts_at && new Date(row.starts_at).getTime() > ts) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() < ts) return false;
  return true;
}
