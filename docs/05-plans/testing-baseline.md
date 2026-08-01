---
status: active
created: 2026-07-12
updated: 2026-08-02
---

# Testing coverage baseline

Measured **2026-08-02** (post Wave 5; strategy doc added). Strategy SSOT: [[05-plans/testing-strategy]].

## APP_SCOPE (unified)

Single scope for unit tests, coverage, and Stryker `mutate`:

- **include:** `src/**/*.ts`, `src/**/*.test.tsx`
- **exclude:** `*.test.ts`, `*.test.tsx`, `src/debug-app/**`, `src/prompt-lab-app/**`, `src/debug/**`, `src/prompt-lab/**`

Lab apps and dev-only debug/prompt-lab server code are not production app. SSOT: `vitest.config.ts`, `stryker.conf.json`.

## Strategy: mock-first (no test env)

Arcane Reader has **no dedicated test environment** (isolated Supabase / Redis / BullMQ for CI). Automated tests use **mocks** at external boundaries unless noted.

| Phase                 | Scope                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Q3 2026** (current) | Unit + Component + **mock-integration** (supertest with mocked services). Mutation on APP_SCOPE.                        |
| **Q4 2026+** (future) | **Live integration + E2E** — real Supabase, Redis, worker on a dedicated test stack. **Blocked** until test env exists. |

Policy SSOT: [[_canonical/rules/testing]]. Full pyramid: [[05-plans/testing-strategy]].

### Q4 prerequisite (live data only)

| Type             | Approach when test env exists       |
| ---------------- | ----------------------------------- |
| API routes       | supertest against test Supabase     |
| Worker / queues  | live Redis + test DB                |
| Full-stack smoke | Playwright on test stack (not prod) |

Until dedicated test environment is provisioned, Q4 live work is **paused**. Mock-integration (Wave 7) proceeds without it.

## Test suite (2026-08-02)

| Metric                           | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| Test files (fast suite)          | **210** (+ 3 slow tiktoken excluded from fast)                     |
| Co-located `*.test.ts` / `.tsx`  | **212** / **1**                                                    |
| Tests (fast)                     | **2010**                                                           |
| Fast suite (`npm run test`)      | ~90 s (coverage run)                                               |
| Slow suite (`npm run test:slow`) | ~100 s                                                             |
| CI                               | `npm run test:coverage` (fast suite; excludes tiktoken slow files) |

Component smoke: `happy-dom` + `@testing-library/preact` (`RequireRole`, gates); Preact JSX aliases in `vitest.config.ts`. See `npm run test:component`.

## Inventory: tested vs untested

| Metric                        | Value                              |
| ----------------------------- | ---------------------------------- |
| Source files in coverage map  | **339**                            |
| With co-located `*.test.ts`   | **203** (**~55%** of walked `.ts`) |
| Without co-located unit test  | **163**                            |
| Files at **0%** line coverage | **79** (**~23%**)                  |

Regenerate stats: `node scripts/gen-test-inventory.mjs` (after `npm run test:coverage`).

### Client breakdown

| Folder               | Coverage notes                             |
| -------------------- | ------------------------------------------ |
| `client/utils/`      | Strong co-located unit coverage            |
| `client/hooks/`      | Partial — Wave 6 priority                  |
| `client/components/` | Mostly untested — Wave 6 component tests   |
| `client/pages/`      | **0** co-located — Wave 6 P3 smoke         |
| `client/api/`        | Domains / cache / transport mostly covered |

## Overall coverage (v8, APP_SCOPE)

Command: `npm run test:coverage` → `coverage/coverage-summary.json`, `coverage/index.html`.

| Metric     | Coverage (2026-08-02)    |
| ---------- | ------------------------ |
| Lines      | **64.73%** (10157/15691) |
| Statements | **62.73%** (10803/17221) |
| Functions  | **67.13%** (1757/2617)   |
| Branches   | **54.53%** (6625/12148)  |

> Wave 5 milestone (2026-07-12): all metrics ≥55%. Current lines remain ~65%; branches slightly below 55% after new code.

## By area (folder rollup, lines %)

| Area                      | Files | Lines %  | Notes                                      |
| ------------------------- | ----- | -------- | ------------------------------------------ |
| `src/shared/`             | 42    | **~92%** | near ceiling                               |
| `src/storage/`            | 3     | **100%** | text-utils                                 |
| `src/api/`                | 60    | **~75%** | handlers + schemas                         |
| `src/middleware/`         | 5     | **~76%** | auth, tokenLimits, requestContext          |
| `src/engine/`             | 69    | **~74%** | stage mocks + openai provider tests        |
| `src/services/`           | 64    | **~56%** | domains OK; jobs/import weak               |
| `src/client/`             | 83    | **~47%** | utils/api OK; components/hooks gap         |
| `server.ts` + `worker.ts` | 2     | **0%**   | entrypoints (createApp extract for Wave 7) |

### Top uncovered files (by remaining gap)

| File                                         | Notes                         |
| -------------------------------------------- | ----------------------------- |
| `client/hooks/useBatchChapterTranslation.ts` | Wave 6                        |
| `services/import/fb2.ts` / `epub.ts`         | binary parse (deferred)       |
| `services/jobs/runTranslateJob.ts`           | Wave 7 worker integration     |
| `services/jobs/runAnalysisJob.ts`            | Wave 7 worker integration     |
| `api/routes/seo.ts`                          | SSR glue; `seoHelpers` tested |
| `server.ts` / `worker.ts`                    | bootstrap                     |

## Wave completion

| Wave                     | Status         | Deliverables                                                        |
| ------------------------ | -------------- | ------------------------------------------------------------------- |
| 0–5                      | Done           | Unit APP_SCOPE, 55%+ milestone, handler extracts, domain mocks      |
| **6 — Component**        | **Infra**      | `vitest.component.config.ts`, Testing Library gates/hooks exemplars |
| **7 — Mock integration** | **Infra**      | `createApp()`, `vitest.integration.config.ts`, supertest smoke      |
| 8 — Snapshot             | Planned        | See [[05-plans/testing-strategy]]                                   |
| 9 — Contract             | Stub           | `tests/contracts/README.md`                                         |
| 10 — Live + E2E          | **Blocked Q4** | requires dedicated test environment; `tests/e2e/README.md`          |

## Mutation testing (Stryker)

Config: `stryker.conf.json` — APP_SCOPE mutate, manual/nightly only (not CI).

```bash
npm run test:mutation
npx stryker run --mutate "src/shared/**/*.ts"
```

## Policy

- No CI thresholds yet — track trend only
- Re-run baseline after major test additions; update this note
- See [[02-how-to/run-tests]] and `.cursor/rules/testing.mdc`
