---
status: active
created: 2026-07-12
updated: 2026-07-12
---

# Testing coverage baseline

Measured after **Wave 3** (sprints 3A–3H) and **supabaseDatabase decomposition** (phases 1–5).

## APP_SCOPE (unified)

Single scope for unit tests, coverage, and Stryker `mutate`:

- **include:** `src/**/*.ts`, `src/**/*.test.tsx`
- **exclude:** `*.test.ts`, `*.test.tsx`, `src/debug-app/**`, `src/prompt-lab-app/**`

Lab apps are dev tools, not production app. SSOT: `vitest.config.ts`, `stryker.conf.json`.

## Strategy: mock-first (no test env)

Arcane Reader has **no dedicated test environment** (isolated Supabase / Redis / BullMQ for CI). All automated tests use **mocks** at external boundaries.

| Quarter               | Scope                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Q3 2026** (current) | Mock-first unit tests + mutation on APP_SCOPE; phased waves by folder. No live DB/Redis/worker gates.                       |
| **Q4 2026+** (future) | **Live integration only** — real Supabase, Redis, worker against a dedicated test stack. **Blocked** until test env exists. |
| **Not planned**       | Mocked supertest, Playwright with API mocks as Q4 work                                                                      |

Policy SSOT: [[_canonical/rules/testing]].

### Q4 prerequisite (live data only)

| Type             | Approach when test env exists   |
| ---------------- | ------------------------------- |
| API routes       | supertest against test Supabase |
| Worker / queues  | live Redis + test DB            |
| Full-stack smoke | staging test stack (not prod)   |

Until dedicated test environment is provisioned, Q4 integration work is **paused**.

## Test suite (2026-07-12, post supabase split)

| Metric                           | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| Test files                       | **92** (89 fast + 3 slow)                                          |
| Tests                            | **430** (413 fast + 17 slow tiktoken)                              |
| Fast suite (`npm run test`)      | ~16 s                                                              |
| Slow suite (`npm run test:slow`) | ~100 s                                                             |
| Full suite (`npm run test:all`)  | ~117 s                                                             |
| CI                               | `npm run test:coverage` (fast suite; excludes tiktoken slow files) |

Component smoke: `happy-dom` + `@testing-library/preact` (RequireRole); Preact JSX aliases in `vitest.config.ts`.

## Inventory: tested vs untested

| Metric                         | Value                          |
| ------------------------------ | ------------------------------ |
| Source files in APP_SCOPE      | **303**                        |
| With co-located `*.test.ts(x)` | **87** (**29%**)               |
| **Without unit test**          | **216** (**71%**)              |
| Files at **0%** line coverage  | **151** (**50%** of APP_SCOPE) |

Regenerate stats: `node scripts/gen-test-inventory.mjs` (after `npm run test:coverage`).

### Client breakdown

| Folder               | Source files | Co-located tests (approx.)                             |
| -------------------- | ------------ | ------------------------------------------------------ |
| `client/utils/`      | 19           | 8 (+ `tokenLimitStatus`)                               |
| `client/hooks/`      | 9            | 1 (`useUrlSync` partial)                               |
| `client/components/` | 16+          | 3 (`chapterPickerShared`, bulk replace, `RequireRole`) |
| `client/pages/`      | 1            | **0**                                                  |
| `client/api/`        | 1            | **0**                                                  |

## Overall coverage (v8, APP_SCOPE)

Command: `npm run test:coverage` → `coverage/coverage-summary.json`, `coverage/index.html`.

| Metric          | Coverage (prev → now)   |
| --------------- | ----------------------- |
| Lines           | **17.71%** (was 16.84%) |
| Statements      | **17.35%** (was 16.50%) |
| Functions       | **21.57%** (was 20.47%) |
| Branches        | **15.36%** (was 14.15%) |
| Uncovered lines | **13 261** (was 13 371) |

> `supabaseDatabase.ts` is now a **20-line facade**; logic lives in `src/services/supabase/domains/*` with co-located mock tests.

## By area (folder rollup)

| Area                      | Files | 0% files | With test | Lines % (approx.) |
| ------------------------- | ----- | -------- | --------- | ----------------- |
| `src/shared/`             | 40    | 9        | 31        | **~79%**          |
| `src/engine/`             | 68    | 15       | 22        | **~49%**          |
| `src/client/`             | 56    | 38       | 10        | **~16%**          |
| `src/api/`                | 28    | 20       | 4         | **~6%**           |
| `src/services/`           | 52+   | ~35      | 12+       | **~8%**           |
| `src/middleware/`         | 5     | 4        | 1         | **~8%**           |
| `server.ts` + `worker.ts` | 2     | 2        | 0         | **0%**            |

### Top uncovered files (0% lines, by size)

| File                                        | Lines |
| ------------------------------------------- | ----- |
| `services/supabase/domains/projects.ts`     | ~1628 |
| `services/supabase/domains/publications.ts` | ~1066 |
| `api/routes/chapters.ts`                    | 1111  |
| `services/supabase/domains/chapters.ts`     | ~816  |
| `services/supabase/domains/catalogBoard.ts` | ~687  |
| `api/routes/publications.ts`                | 625   |
| `client/api/client.ts`                      | 549   |

**Q3 approach:** extract + domain split + mock unit tests. See [supabase-database-split.md](supabase-database-split.md). **Q4:** live integration (`tests/integration/supabase/`).

## Wave 3 deliverables (completed 2026-07-12)

| Sprint | Deliverables                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------- |
| **3A** | shared quick wins: chunkErrors, chapterTitle, evaluation-normalize, critic-fingerprint, cacheContract, … |
| **3B** | routeParams, routeHelpers pure, chapterTranslation sync                                                  |
| **3C** | `supabaseTransforms` extract + tests; glossaryImportExport, authErrors                                   |
| **3D** | engine: language, edit-chunking, chunker-core, declension, registry, text-blocks                         |
| **3E** | projectSearch, client utils, chapterPickerShared, bulkReplaceChunked                                     |
| **3F** | isSupabaseError, `seoHtml` extract, cacheInvalidation                                                    |
| **3G** | stage-1/3 LLM mocks; `tokenLimitStatus`, `parseChapterBound` extract                                     |
| **3H** | RequireRole component smoke (happy-dom)                                                                  |

## supabaseDatabase split (completed 2026-07-12)

| Phase | Deliverables                                                   |
| ----- | -------------------------------------------------------------- |
| 1–3   | transforms, pure helpers, db infra (`src/services/supabase/`)  |
| 4     | 10 domain modules + `loaders.ts`; facade `supabaseDatabase.ts` |
| 5     | mock domain tests (search, import, announcements)              |
| 6     | Q4 blocked — `tests/integration/supabase/README.md`            |

Status note: [supabase-database-split.md](supabase-database-split.md)

## Mutation testing (Stryker)

Config: `stryker.conf.json` — APP_SCOPE mutate, manual/nightly only (not CI).

```bash
npm run test:mutation
npx stryker run --mutate "src/shared/**/*.ts"
```

## Wave completion (Q3)

| Wave                 | Status         | Deliverables                                                                       |
| -------------------- | -------------- | ---------------------------------------------------------------------------------- |
| 0 — Infra            | Done           | APP_SCOPE, CI coverage, `test:slow` / `test:all`, Stryker config, inventory script |
| 1 — Shared + API     | Done           | validateRoute, paragraphSync, glossary-manager, etc.                               |
| 2 — Engine smoke     | Done           | translation-pipeline mock, stage-2, Zod schemas                                    |
| 3 — Phased expansion | **Done**       | sprints 3A–3H (this baseline)                                                      |
| 4 — Live integration | **Blocked Q4** | requires dedicated test environment                                                |

## Policy

- No CI thresholds yet — track trend only
- Re-run baseline after major test additions; update this note
- See [[02-how-to/run-tests]] and `.cursor/rules/testing.mdc`
