-- Publications table: one publication per project, visible in public catalog when status = 'published'
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor)

-- Table
CREATE TABLE IF NOT EXISTS publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  title TEXT,
  description TEXT,
  cover_image_url TEXT,
  author_display TEXT,
  source_language TEXT,
  target_language TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

-- Indexes for list and public catalog
CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status);
CREATE INDEX IF NOT EXISTS idx_publications_user_id ON publications(user_id);
CREATE INDEX IF NOT EXISTS idx_publications_project_id ON publications(project_id);
CREATE INDEX IF NOT EXISTS idx_publications_published_at ON publications(published_at DESC NULLS LAST);

-- RLS
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

-- Anyone can read published publications (including anon)
CREATE POLICY "Public can read published publications"
  ON publications FOR SELECT
  USING (status = 'published');

-- Users can read their own publications (any status)
CREATE POLICY "Users can read own publications"
  ON publications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert own publication (user_id must match auth.uid())
CREATE POLICY "Users can insert own publications"
  ON publications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own publications
CREATE POLICY "Users can update own publications"
  ON publications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete own publications
CREATE POLICY "Users can delete own publications"
  ON publications FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION update_publications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS publications_updated_at ON publications;
CREATE TRIGGER publications_updated_at
  BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE PROCEDURE update_publications_updated_at();
