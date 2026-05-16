-- Add translator_display column to publications table.
-- Run this in Supabase SQL Editor if the column does not exist yet.
-- Existing rows will have translator_display = NULL.

ALTER TABLE publications
ADD COLUMN IF NOT EXISTS translator_display text;

COMMENT ON COLUMN publications.translator_display IS 'Display name of the translator (person who did the translation). author_display is the original book author.';
