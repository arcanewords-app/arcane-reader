---
name: backend-agent
description: Services, Supabase, Redis cache, BullMQ worker, import/export. Use when acting as Backend Agent or editing src/services, storage, worker.
---

# Backend Agent Skill

## When To Use

- `src/services/**` — DB, cache, import/export, auth helpers
- `src/storage/types.ts` — domain types (projects, chapters, glossary)
- `src/storage/text-utils.ts` — `parseTextToParagraphs`, `mergeParagraphsToText`, reader settings helpers
- `src/worker.ts` and async analyze/translate jobs
- `src/shared/cacheContract.ts`
- Supabase migrations, RLS, RPC, grants — also read `@.cursor/skills/security/SKILL.md`

## Domain Knowledge

- **DB:** `@supabase/supabase-js` via `supabaseDatabase.ts`; columns **snake_case**
- **Cache:** keys/TTL in `cacheContract.ts`; helpers in `redisCache.ts`
- **Invalidation:** `invalidateProjectAndRelatedCaches(userId, projectId, token)` after project writes
- **Worker:** BullMQ + `REDIS_URL`; without Redis, async endpoints return 503 (sync paths may still work)
- **Supabase docs:** use `.cursor/skills/supabase-docs/SKILL.md` for RLS, auth, migrations
- **DB size / schema:** see **Database size and schema cleanup** below. Do not apply DDL to production without an explicit request.

## Patterns

- Add DB operations as functions in `supabaseDatabase.ts` — typed with `types.ts`
- New cache prefix → extend `cacheContract.ts` first, then use in `redisCache.ts`
- Import/export: follow existing epub/fb2/csv/txt service modules
- Worker jobs: align with API enqueue/cancel flags in `server.ts`

## Anti-patterns

- Ad-hoc Redis keys outside `cacheContract.ts`
- Mutations without cache invalidation
- Duplicating types that already exist in `types.ts`
- Service-role key usage from client-facing code paths
- Logging secrets or full row dumps
- `SECURITY DEFINER` without `search_path = ''` and schema-qualified names — see `@.cursor/skills/security/SKILL.md`
- `await Promise.resolve(syncFn())` (or `await syncFn()`) to silence oxlint `await-thenable`. If the function returns a value, not a Promise (e.g. `getAgentForProject`), call it without `await`. Fix tests that used `mockResolvedValue` — they should `mockReturnValue`. See `@.cursor/skills/testing/SKILL.md` § Mocking.

## Database size and schema cleanup

Paragraphs are the text SSOT. `chapters.translated_text` is a catalog/export cache. `translated_chunks` and chapter `original_text` are legacy (almost always empty original; chunks duplicate translated_text for auto-recovery).

**Reads:** use `@src/services/supabase/chapterColumns.ts` (`core` / `recovery` / `full`). Do not `.select('*')` on `chapters` in bulk loaders. Editor (`getChapter`), clone, and transfer keep `full`.

**Measure (read-only MCP `execute_sql` / `get_advisors`):** `pg_total_relation_size`, `pg_stat_user_indexes`. Prod snapshot (2026-08-29): `paragraphs` ~198 MB (heap ~115 MB, indexes ~83 MB after dropping unused GIN trgm); `chapters` ~71 MB mostly TOAST.

**New indexes:** do not add GIN/GiST/`pg_trgm` on `paragraphs` / `chapters` text unless `EXPLAIN (ANALYZE, BUFFERS)` on the **same** SQL the app runs (RPC + RLS) shows Index Scan / Bitmap Index Scan. After `CREATE INDEX`, check `idx_scan`; `idx_scan = 0` + advisor `unused_index` → DROP, not “for later”. Do not add btree already covered by UNIQUE/PK (unique `(chapter_id, index)` covers `chapter_id`). `ILIKE '%q%'` ≠ trgm — either `%` / `similarity` (then GIN can help) or seq scan by `project_id` / `chapter_id`. Plugin `query-index-types` is a type catalog; **do not default GIN on book text**. Find in chapter is in-memory; project find is RPC `search_paragraphs_in_project` (ILIKE seq scan).

**RLS InitPlan:** wrap `auth.uid()` as `(select auth.uid())` — plugin `supabase-postgres-best-practices` → `security-rls-performance`. Remaining index/RLS DDL: `docs/05-plans/db-schema-cleanup.md` (not prod until asked).

**Do not:** partition `paragraphs` (~195k rows, far below 100M); store book text as JSONB on the chapter; GIN-index `settings` / `translation_meta` without containment queries; recreate dropped `paragraphs_*_text_trgm_idx` without EXPLAIN proof; `ALTER ROLE authenticated` timeout (see `supabase/README.md`).

**Migrations:** Arcane SSOT is `@.cursor/rules/supabase.mdc` (gitignored `supabase/migrations/` + row in `supabase/README.md`; index rules there). Official supabase skill prefers `execute_sql` iteration then `db pull` — do **not** `apply_migration` on prod `arcane` unless the user explicitly asks. Read-only `execute_sql` and `get_advisors` are fine.

## Planned extensions

_Add: import/export flow diagrams, worker job lifecycle, migration checklist._
