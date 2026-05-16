-- Add 'analyzed' to chapters.status check constraint.
-- Required after adding ChapterStatus 'analyzed' (analysis-only flow).
-- Run this in Supabase SQL Editor if you get: chapters_status_check violation.

ALTER TABLE chapters
  DROP CONSTRAINT IF EXISTS chapters_status_check;

ALTER TABLE chapters
  ADD CONSTRAINT chapters_status_check
  CHECK (status IN ('pending', 'translating', 'analyzed', 'completed', 'error'));
