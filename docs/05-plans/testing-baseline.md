---
status: active
created: 2026-07-12
updated: 2026-07-12
---

# Testing coverage baseline

Measured after **Wave 5** (sprints 5A–5H), **55% all-metrics milestone** (2026-07-12).

## APP_SCOPE (unified)

Single scope for unit tests, coverage, and Stryker `mutate`:

- **include:** `src/**/*.ts`, `src/**/*.test.tsx`
- **exclude:** `*.test.ts`, `*.test.tsx`, `src/debug-app/**`, `src/prompt-lab-app/**`, `src/debug/**`, `src/prompt-lab/**`

Lab apps and dev-only debug/prompt-lab server code are not production app. SSOT: `vitest.config.ts`, `stryker.conf.json`.

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

## Test suite (2026-07-12, post Wave 5)

| Metric                           | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| Test files                       | **201** fast (+ 3 slow tiktoken)                                   |
| Tests                            | **1966** fast (+ 17 slow)                                          |
| Fast suite (`npm run test`)      | ~23 s                                                              |
| Slow suite (`npm run test:slow`) | ~100 s                                                             |
| Full suite (`npm run test:all`)  | ~120 s                                                             |
| CI                               | `npm run test:coverage` (fast suite; excludes tiktoken slow files) |

Component smoke: `happy-dom` + `@testing-library/preact` (RequireRole); Preact JSX aliases in `vitest.config.ts`.

## Inventory: tested vs untested

| Metric                         | Value                           |
| ------------------------------ | ------------------------------- |
| Source files in APP_SCOPE      | **329**                         |
| With co-located `*.test.ts(x)` | **195** (**~59%**)              |
| **Without unit test**          | **~161** (**~49%**)             |
| Files at **0%** line coverage  | **~77** (**~23%** of APP_SCOPE) |

Regenerate stats: `node scripts/gen-test-inventory.mjs` (after `npm run test:coverage`).

### Client breakdown

| Folder               | Source files | Co-located tests (approx.)                             |
| -------------------- | ------------ | ------------------------------------------------------ |
| `client/utils/`      | 19           | 14+                                                    |
| `client/hooks/`      | 9            | 1 (`useUrlSync` partial)                               |
| `client/components/` | 16+          | 3 (`chapterPickerShared`, bulk replace, `RequireRole`) |
| `client/pages/`      | 1            | **0**                                                  |
| `client/api/`        | 20+          | **20** (errors, cache, transport, domains)             |

## Overall coverage (v8, APP_SCOPE)

Command: `npm run test:coverage` → `coverage/coverage-summary.json`, `coverage/index.html`.

| Metric          | Coverage (Wave 4 → Wave 5) |
| --------------- | -------------------------- |
| Lines           | **65.39%** (was 41.80%)    |
| Statements      | **63.44%** (was 40.28%)    |
| Functions       | **67.62%** (was 41.73%)    |
| Branches        | **55.05%** (was 32.46%)    |
| Uncovered lines | **~5 205** (was ~9 537)    |

> **Wave 5 milestone:** all metrics **≥55%** via branch-first mock tests, handler extraction, and APP_SCOPE refinement (exclude `src/debug/**`, `src/prompt-lab/**` dev server code).

## By area (folder rollup)

| Area                      | Files | Lines % (approx.) | Notes                                   |
| ------------------------- | ----- | ----------------- | --------------------------------------- |
| `src/shared/`             | 40    | **~90%**          | near ceiling                            |
| `src/api/`                | 54+   | **~70%**          | handlers + chapterTranslation extracts  |
| `src/engine/`             | 68    | **~60%**          | stage mocks + openai provider tests     |
| `src/services/`           | 62+   | **~45%**          | domains, job stores, engine-integration |
| `src/client/`             | 77+   | **~40%**          | utils, api domains, authService         |
| `src/middleware/`         | 5     | **~80%**          | auth, tokenLimits, requestContext       |
| `server.ts` + `worker.ts` | 2     | **0%**            | entrypoints (deferred)                  |

### Top uncovered files (by remaining gap)

| File                                         | Lines % | Notes                         |
| -------------------------------------------- | ------- | ----------------------------- |
| `services/import/epub.ts`                    | ~1%     | binary parse (deferred)       |
| `client/hooks/useBatchChapterTranslation.ts` | 0%      | UI integration (Wave 6)       |
| `client/components/.../useProjectSearch.ts`  | ~2%     | UI integration (Wave 6)       |
| `services/jobs/runTranslateJob.ts`           | 0%      | worker entrypoints            |
| `server.ts` / `worker.ts`                    | 0%      | bootstrap (deferred)          |
| `api/routes/seo.ts`                          | 0%      | SSR glue; `seoHelpers` tested |

**Q3 approach:** extract + domain split + mock unit tests. **Wave 4:** route handlers. **Wave 5:** branch-first expansion + `translationRequestBoard` handler extract. **Q4:** live integration (`tests/integration/supabase/`).

## Route handler extraction (completed Wave 4–5)

Thin route registration files; logic in testable handlers:

| Route file                          | Handler module                             | Handlers | Test coverage (lines, approx.) |
| ----------------------------------- | ------------------------------------------ | -------- | ------------------------------ |
| `routes/projects.ts`                | `handlers/projectRouteHandlers`            | 15       | ~69%                           |
| `routes/publications.ts`            | `handlers/publicationRouteHandlers`        | 27       | ~79%                           |
| `routes/chapters.ts`                | `handlers/chapterRouteHandlers`            | 25       | ~90%                           |
| `routes/user.ts`                    | `handlers/userRouteHandlers`               | 14       | ~70%                           |
| `routes/glossary.ts`                | `handlers/glossaryRouteHandlers`           | 12       | ~71%                           |
| `routes/admin.ts`                   | `handlers/adminRouteHandlers`              | 26       | ~77%                           |
| `routes/auth.ts`                    | `handlers/authHandlers`                    | 8        | ~78%                           |
| `routes/chapterImport.ts`           | `handlers/chapterImportRouteHandlers`      | 4        | ~50%                           |
| `routes/chapterReports.ts`          | `handlers/chapterReportsHandlers`          | 4        | ~85%                           |
| `routes/seo.ts`                     | `handlers/seoHelpers` (pure)               | 9        | ~63%                           |
| `routes/translationRequestBoard.ts` | `handlers/translationRequestBoardHandlers` | 4        | ~80% (Wave 5C)                 |

Also: `handlers/translatorPseudonymErrorResponse`, `routes/helpers/interestErrorResponse`.

## Wave 5 deliverables (completed 2026-07-12)

| Sprint | Deliverables                                                                                |
| ------ | ------------------------------------------------------------------------------------------- |
| **5A** | admin, news, translationReports, readerProgress, paragraphs, loaders — branch-first domains |
| **5B** | projects/chapters/catalogBoard/publications domain CRUD error branches                      |
| **5C** | chapterImportRouteHandlers; extract `translationRequestBoardHandlers`                       |
| **5D** | chapterTranslation helper extracts; handler error paths (chapterReports critical)           |
| **5E** | engine stage-1/2/3, pipeline, novel-agent, glossary-manager — LLM mocks                     |
| **5F** | job stores, export/common, chapter-critic, authService, storage                             |
| **5G** | middleware, client pure utils, client api domains (fetch mocks)                             |
| **5H** | projectSearch, logger, Zod invalid cases, cache invalidation                                |

Supporting: `engine-integration` pure exports, `openai.test.ts`, `mock-llm-provider.ts`, APP_SCOPE excludes `src/debug/**` + `src/prompt-lab/**`.

## Wave 4 deliverables (completed 2026-07-12)

| Sprint | Deliverables                                                                                 |
| ------ | -------------------------------------------------------------------------------------------- |
| **4A** | translationReports, glossaryCopy, shared 0% files, routeHelpers invalidate*                  |
| **4B** | projects domain mock tests (assertCanAddProject, CRUD, reader settings, clone, bulk)         |
| **4C** | publications + catalogBoard domain tests                                                     |
| **4D** | admin, glossary, readerProgress domain tests                                                 |
| **4E** | loaders + expand chapters/paragraphs/news partial tests                                      |
| **4F** | novel-agent, concurrency, leading-context, title-translate, editor normalize                 |
| **4G** | client utils (11 files), middleware auth/tokenLimits extracts                                |
| **4H** | chapterTranslation extract, Zod schema packs, route handler extraction (projects → chapters) |

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

## Wave completion (Q3 + Q4)

| Wave                  | Status         | Deliverables                                                                       |
| --------------------- | -------------- | ---------------------------------------------------------------------------------- |
| 0 — Infra             | Done           | APP_SCOPE, CI coverage, `test:slow` / `test:all`, Stryker config, inventory script |
| 1 — Shared + API      | Done           | validateRoute, paragraphSync, glossary-manager, etc.                               |
| 2 — Engine smoke      | Done           | translation-pipeline mock, stage-2, Zod schemas                                    |
| 3 — Phased expansion  | Done           | sprints 3A–3H                                                                      |
| 4 — 40% milestone     | Done           | sprints 4A–4H; line coverage **41.8%**                                             |
| **5 — 55% milestone** | **Done**       | sprints 5A–5H; all metrics **≥55%** (branches **55.05%**)                          |
| 6 — Live integration  | **Blocked Q4** | requires dedicated test environment                                                |

## Policy

- No CI thresholds yet — track trend only
- Re-run baseline after major test additions; update this note
- See [[02-how-to/run-tests]] and `.cursor/rules/testing.mdc`
