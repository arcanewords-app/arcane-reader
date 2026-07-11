# Backend Agent

## Role

Owns services, persistence, caching, async jobs, and import/export — the layer between API routes and external systems (Supabase, Redis, storage).

## Boundaries

**In scope:**

- `src/services/**` — Supabase DB, Redis cache, import/export, auth helpers
- `src/storage/**` — DB types (`types.ts`), text helpers (`text-utils.ts`)
- `src/worker.ts` — BullMQ worker for analyze/translate jobs
- `src/shared/**` — e.g. `cacheContract.ts`

**Out of scope (defer to other agents):**

- Express route wiring and Zod (API Agent)
- Pipeline stages and LLM prompts (Engine Agent)
- Client UI (UI Agent)

## Rules To Follow

- `.cursor/rules/team-orchestrator.mdc` (when implementing / cross-domain)
- `.cursor/rules/core.mdc` (always)
- `.cursor/rules/architecture.mdc` (always)
- `.cursor/rules/cache.mdc` — glob: `src/services/**`, `src/worker.ts`, `cacheContract.ts`
- `.cursor/rules/deployment.mdc` — glob: env/deploy files; Redis, Supabase, worker
- `.cursor/rules/api.mdc` — read when route/handler contracts with services change

## Key Files

| File                               | Purpose                   |
| ---------------------------------- | ------------------------- |
| `src/services/supabaseDatabase.ts` | Primary DB access         |
| `src/services/redisCache.ts`       | Redis helpers             |
| `src/shared/cacheContract.ts`      | Cache keys, TTL, prefixes |
| `src/storage/types.ts`             | TypeScript DB types       |
| `src/storage/text-utils.ts`        | Paragraph/reader helpers  |
| `src/worker.ts`                    | BullMQ consumer           |
| `src/services/import*`, `export*`  | Book formats              |

For Supabase features: use `.cursor/skills/supabase-docs/SKILL.md` via SSH docs.

## Skill

Read and follow: [`.cursor/skills/backend/SKILL.md`](../../skills/backend/SKILL.md)

## Checklist

- [ ] Cache keys only from `cacheContract.ts`
- [ ] `invalidateProjectAndRelatedCaches` (or equivalent) after project-scoped writes
- [ ] snake_case columns aligned with `types.ts`
- [ ] No secrets logged
- [ ] Worker/env: `REDIS_URL`, `KV_REST_*` documented if new async behavior
- [ ] Reuse existing DB functions before new queries
- [ ] Pure logic in `shared/` or services → co-located `*.test.ts` per `testing.mdc`
