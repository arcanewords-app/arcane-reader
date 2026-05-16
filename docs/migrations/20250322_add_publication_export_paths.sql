-- Add export storage paths to publications table
-- Required for unified publication export (Export + Publish) feature.
-- Run in Supabase Dashboard → SQL Editor, or: supabase db push

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS epub_storage_path text,
  ADD COLUMN IF NOT EXISTS fb2_storage_path text;

-- Optional: add to publications_list_with_counts view if you use it:
-- The view may need to include these columns for list APIs. If the view
-- uses SELECT * from publications, it will pick them up automatically.
