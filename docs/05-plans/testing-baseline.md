---
status: active
created: 2026-07-12
updated: 2026-07-12
---

# Testing coverage baseline

Measured after **Wave 3 phased expansion** (sprints 3A–3H: shared, api, services, engine, client, middleware).

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

## Test suite (2026-07-12, post wave 3)

| Metric                           | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| Test files                       | **80** (77 fast + 3 slow)                                          |
| Tests                            | **400** (383 fast + 17 slow tiktoken)                              |
| Fast suite (`npm run test`)      | ~17 s                                                              |
| Slow suite (`npm run test:slow`) | ~100 s                                                             |
| Full suite (`npm run test:all`)  | ~117 s                                                             |
| CI                               | `npm run test:coverage` (fast suite; excludes tiktoken slow files) |

Component smoke: `happy-dom` + `@testing-library/preact` (RequireRole); Preact JSX aliases in `vitest.config.ts`.

## Inventory: tested vs untested

| Metric                         | Value                          |
| ------------------------------ | ------------------------------ |
| Source files in APP_SCOPE      | **281**                        |
| With co-located `*.test.ts(x)` | **75** (**27%**)               |
| **Without unit test**          | **205** (**73%**)              |
| Files at **0%** line coverage  | **144** (**51%** of APP_SCOPE) |

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
| Lines           | **16.84%** (was 11.42%) |
| Statements      | **16.50%** (was 11.16%) |
| Functions       | **20.47%** (was 13.35%) |
| Branches        | **14.15%** (was 9.46%)  |
| Uncovered lines | **13 371** (was 14 239) |

> APP_SCOPE includes routes, `server.ts`, `supabaseDatabase.ts`, and `client/**` — trend up after wave 3 sprints.

## By area (folder rollup)

| Area                      | Files | 0% files | With test | Lines % (approx.) |
| ------------------------- | ----- | -------- | --------- | ----------------- |
| `src/shared/`             | 40    | 9        | 31        | **~79%**          |
| `src/engine/`             | 68    | 15       | 22        | **~49%**          |
| `src/client/`             | 56    | 38       | 10        | **~16%**          |
| `src/api/`                | 28    | 20       | 4         | **~6%**           |
| `src/services/`           | 40    | 26       | 5         | **~5%**           |
| `src/middleware/`         | 5     | 4        | 1         | **~8%**           |
| `server.ts` + `worker.ts` | 2     | 2        | 0         | **0%**            |

### Top uncovered files (0% lines, by size)

| File                                         | Lines |
| -------------------------------------------- | ----- |
| `services/supabaseDatabase.ts`               | ~7400 |
| `api/routes/chapters.ts`                     | 1111  |
| `api/routes/publications.ts`                 | 625   |
| `client/api/client.ts`                       | 549   |
| `api/routes/admin.ts`                        | 373   |
| `api/routes/projects.ts`                     | 325   |
| `api/routes/glossary.ts`                     | 302   |
| `api/routes/user.ts`                         | 229   |
| `services/import/epub.ts`                    | 229   |
| `client/hooks/useBatchChapterTranslation.ts` | 188   |

**Q3 approach for large files:** extract pure helpers → unit test with mocks. **Q4:** live route/DB tests when test env exists.

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
