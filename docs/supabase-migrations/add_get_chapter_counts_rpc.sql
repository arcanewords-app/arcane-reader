-- get_chapter_counts_by_projects: returns exact counts per project (bypasses PostgREST 1000 row limit)
-- Run this migration if you use Supabase and have projects with more than 1000 chapters.

CREATE OR REPLACE FUNCTION get_chapter_counts_by_projects(p_project_ids uuid[])
RETURNS TABLE(project_id uuid, total_count bigint, translated_count bigint) AS $$
  SELECT
    c.project_id,
    count(*)::bigint,
    count(*) FILTER (WHERE c.status = 'completed')::bigint
  FROM chapters c
  WHERE c.project_id = ANY(p_project_ids)
  GROUP BY c.project_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_chapter_counts_by_projects(uuid[]) IS 'Returns chapter counts per project; bypasses PostgREST 1000 row limit for getAllProjectsLightweight and similar';

-- get_chapters_summary_batch: returns chapter summaries with paragraph counts for pagination (max 1000 per call)
CREATE OR REPLACE FUNCTION get_chapters_summary_batch(
  p_project_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 1000
)
RETURNS TABLE(
  id uuid,
  number int,
  title text,
  status text,
  translation_meta jsonb,
  paragraph_count bigint,
  translated_paragraph_count bigint
) AS $$
  SELECT
    c.id,
    c.number,
    c.title,
    c.status,
    c.translation_meta,
    (SELECT count(*)::bigint FROM paragraphs p WHERE p.chapter_id = c.id),
    (SELECT count(*)::bigint FROM paragraphs p WHERE p.chapter_id = c.id AND p.translated_text IS NOT NULL)
  FROM chapters c
  WHERE c.project_id = p_project_id
  ORDER BY c.number
  OFFSET p_offset LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_chapters_summary_batch(uuid, int, int) IS 'Returns chapter summaries with paragraph counts; use with pagination (offset/limit) for projects with >1000 chapters';
