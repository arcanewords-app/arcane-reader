-- Add mentioned_in_chapters to glossary_entries (chapters where this entry was mentioned).
-- Run in Supabase SQL Editor. Existing rows get mentioned_in_chapters = NULL (treated as [] in app).
-- first_appearance remains "first mention"; mentioned_in_chapters lists all chapters from analysis.

ALTER TABLE glossary_entries
ADD COLUMN IF NOT EXISTS mentioned_in_chapters integer[] DEFAULT '{}';

COMMENT ON COLUMN glossary_entries.mentioned_in_chapters IS 'Chapter numbers where this glossary entry was mentioned (from analysis). first_appearance is the first of these.';
