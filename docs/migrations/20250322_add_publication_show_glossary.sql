-- Add show_glossary flag to publications table.
-- Author can hide glossary from readers even when entries exist (e.g. used only for translation).
-- Run in Supabase Dashboard → SQL Editor, or: supabase db push

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS show_glossary boolean DEFAULT true;
