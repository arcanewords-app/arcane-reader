-- Add related_entry_ids and primary_location_id to glossary_entries
-- Run this migration if you use Supabase and want to support entity relationships.

ALTER TABLE glossary_entries
  ADD COLUMN IF NOT EXISTS related_entry_ids jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS primary_location_id uuid DEFAULT NULL;

COMMENT ON COLUMN glossary_entries.related_entry_ids IS 'IDs of related glossary entries (character-location, character-character, etc.)';
COMMENT ON COLUMN glossary_entries.primary_location_id IS 'For characters: primary location entry ID';
