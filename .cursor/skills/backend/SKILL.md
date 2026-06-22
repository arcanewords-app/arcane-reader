---
name: backend-agent
description: Services, Supabase, Redis cache, BullMQ worker, import/export. Use when acting as Backend Agent or editing src/services, storage, worker.
---

# Backend Agent Skill

## When To Use

- `src/services/**` — DB, cache, import/export, auth helpers
- `src/storage/database.ts` types
- `src/worker.ts` and async analyze/translate jobs
- `src/shared/cacheContract.ts`
- Supabase migrations, RLS, RPC, grants — also read `@.cursor/skills/security/SKILL.md`

## Domain Knowledge

- **DB:** `@supabase/supabase-js` via `supabaseDatabase.ts`; columns **snake_case**
- **Cache:** keys/TTL in `cacheContract.ts`; helpers in `redisCache.ts`
- **Invalidation:** `invalidateProjectAndRelatedCaches(userId, projectId, token)` after project writes
- **Worker:** BullMQ + `REDIS_URL`; without Redis, async endpoints return 503 (sync paths may still work)
- **Supabase docs:** use `.cursor/skills/supabase-docs/SKILL.md` for RLS, auth, migrations

## Patterns

- Add DB operations as functions in `supabaseDatabase.ts` — typed with `database.ts`
- New cache prefix → extend `cacheContract.ts` first, then use in `redisCache.ts`
- Import/export: follow existing epub/fb2/csv/txt service modules
- Worker jobs: align with API enqueue/cancel flags in `server.ts`

## Anti-patterns

- Ad-hoc Redis keys outside `cacheContract.ts`
- Mutations without cache invalidation
- Duplicating types that already exist in `database.ts`
- Service-role key usage from client-facing code paths
- Logging secrets or full row dumps
- `SECURITY DEFINER` without `search_path = ''` and schema-qualified names — see `@.cursor/skills/security/SKILL.md`

## Planned extensions

_Add: import/export flow diagrams, worker job lifecycle, migration checklist._
