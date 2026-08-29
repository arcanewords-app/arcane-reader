---
type: plan
status: draft
domain: infra
stale: false
created: 2026-08-30
updated: 2026-08-30
---

# Plan: DB schema cleanup (not production)

Future DDL for remaining index/RLS/chapter-cache work. **Do not** `apply_migration` on prod `arcane` (`ugcnqejiiybaatcqxmgn`) until an explicit go-ahead. Apply on local/staging first, then MCP `get_advisors`, then prod.

**Done on prod (2026-08-29):** dropped unused GIN `paragraphs_original_text_trgm_idx` and `paragraphs_translated_text_trgm_idx` (~237 MB, `idx_scan = 0`). Search RPC `search_paragraphs_in_project` unchanged (ILIKE seq scan). Do **not** rewrite to `%` / `similarity` unless EXPLAIN proves GIN would be used and the size is justified.

Agent policy: [`.cursor/skills/backend/SKILL.md`](../../.cursor/skills/backend/SKILL.md) (Database size and schema cleanup). Migrations: [`.cursor/rules/supabase.mdc`](../../.cursor/rules/supabase.mdc). RLS: [`.cursor/skills/security/SKILL.md`](../../.cursor/skills/security/SKILL.md).

**Already done in app code (no schema change):** bulk chapter reads use `src/services/supabase/chapterColumns.ts` (`core` / `recovery` / `full`) so PostgREST does not pull unused TOAST.

## Baseline (prod, 2026-08-29 after GIN drop)

- 7 projects, ~2045 chapters, ~195k paragraphs
- `paragraphs`: ~198 MB (heap ~115 MB, **indexes ~83 MB**)
- `chapters`: ~71 MB (mostly TOAST)
- Chapter `original_text` empty on 2026/2045 rows
- `translated_chunks` ≈ duplicate of `translated_text` (~16 MB)
- Duplicate btree: `idx_paragraphs_index` (used) + unique `(chapter_id, index)` (unused); `idx_chapters_number` + unique `(project_id, number)`
- Advisor WARN `auth_rls_initplan` on `paragraphs`, `chapters`, `projects`, `glossary_entries`, and more

Catalog reads live `chapters.translated_text` (no publication snapshot). `deleteProject` / `deleteProjectAdmin` already `DELETE FROM projects` with FK cascade. After a large delete on staging: `VACUUM (ANALYZE)` on `paragraphs` / `chapters` — not in app code.

## Phase A — indexes and RLS

1. Rewrite hot RLS policies: `auth.uid()` → `(select auth.uid())` on `paragraphs`, `chapters`, `projects`, `glossary_entries`, then remaining InitPlan WARNs (plugin `security-rls-performance`).
2. Drop duplicate btree only after confirming planner can use the unique twins: `idx_paragraphs_index` (~38k scans — **do not drop while it is the chosen btree**), `idx_paragraphs_chapter_id` (used), `idx_chapters_number` (used). Unique duplicates with `idx_scan = 0` are the safer DROP candidates.
3. **Done (2026-08-29):** `DROP INDEX` unused GIN trgm. Do not recreate without EXPLAIN on the live RPC + RLS. `pg_trgm` extension kept.

Expected remaining: smaller btree if unused uniques are dropped; faster RLS after InitPlan fix.

## Phase B — chapter as cache

- Keep `chapters.translated_text` for catalog and EPUB/FB2 export.
- Stop writing `translated_chunks`; recover from `translated_text` or paragraphs; then `DROP COLUMN translated_chunks`.
- Stop writing empty `chapters.original_text`; then drop the column.
- One cache sync (`syncChapterTranslatedTextFromDb` / bulk RPC).

Expected: roughly half of `chapters` TOAST.

## Phase C — optional immutable catalog

Snapshot `publication_chapters (publication_id, number, title, translated_text)` on publish. Separate ADR. Only if published books must not follow live author edits.

## How to apply (when asked)

1. SQL file in gitignored `supabase/migrations/YYYYMMDDHHMMSS_*.sql`
2. Local or staging first — **not** prod `apply_migration` until confirmed
3. Re-run `get_advisors` (performance + security)
4. Row in `supabase/README.md`
5. Align `types.ts` / transforms if columns drop

## Do not

- Partition `paragraphs`
- Store paragraphs as JSONB on the chapter
- GIN on `translation_meta` / `settings` without containment queries
- Recreate `paragraphs_*_text_trgm_idx` without EXPLAIN proof
- Raise `authenticated` `statement_timeout` globally
