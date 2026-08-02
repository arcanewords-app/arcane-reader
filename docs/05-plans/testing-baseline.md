---
status: active
created: 2026-07-12
updated: 2026-08-02
---

# Testing coverage baseline

Measured **2026-08-02** (post Wave 7 mock-integration rollout). Strategy SSOT: [[05-plans/testing-strategy]].

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

Until dedicated test environment is provisioned, Q4 live work is **paused**. Mock-integration (Wave 7) is in pre-push.

## Test suite (2026-08-02, post Wave 9)

| Metric                      | Value                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| Unit fast suite files       | covered by `npm run test` / `test:coverage`                                       |
| Component suite             | **26** files / **64** tests (`npm run test:component`; +15 snaps)                 |
| Mock-integration suite      | **9** files / **44** tests (`npm run test:integration`)                           |
| Contract suite              | **13** files / **18** tests (`npm run test:contract`)                             |
| Co-located `*.test.tsx`     | **21**                                                                            |
| Co-located `*.hook.test.ts` | **5**                                                                             |
| Pre-push                    | `lint:all` + `test` + `test:component` + `test:integration` + **`test:contract`** |

Component suite: `happy-dom` + `@testing-library/preact`. Unit coverage command does **not** execute `*.test.tsx` (separate config) — client % below understates Wave 6 component coverage. Integration suite is mock-first (no live Supabase/Redis/LLM).

## Inventory: tested vs untested

| Metric                        | Value   |
| ----------------------------- | ------- |
| Source files in coverage map  | **364** |
| With co-located `*.test.ts`   | **206** |
| Without co-located unit test  | **165** |
| Files at **0%** line coverage | **81**  |

Regenerate stats: `node scripts/gen-test-inventory.mjs` (after `npm run test:coverage`).

### Client breakdown

| Folder               | Coverage notes                                     |
| -------------------- | -------------------------------------------------- |
| `client/utils/`      | Strong + `publicationChapterFilters`               |
| `client/hooks/`      | Wave 6 P0: translation / token / history hooks     |
| `client/components/` | Gates, SettingsModal smoke, UI primitives, toolbar |
| `client/pages/`      | About / Privacy / Terms / Projects smokes          |
| `client/api/`        | Domains / cache / transport mostly covered         |

## Overall coverage (v8, APP_SCOPE — unit suite)

Command: `npm run test:coverage` → `coverage/coverage-summary.json`, `coverage/index.html`.

| Metric     | Coverage (stabilize 2026-08-02) |
| ---------- | ------------------------------- |
| Lines      | **64.67%**                      |
| Statements | **62.70%**                      |
| Functions  | **66.95%**                      |
| Branches   | **54.68%**                      |

### Coverage floors (active)

Enforced only by `npm run test:coverage` (not pre-push), in `vitest.config.ts`:

| Metric   | Floor  |
| -------- | ------ |
| Lines    | **64** |
| Branches | **54** |

> Floors are measured integers from the stabilize pass (unit suite excludes `*.test.tsx` / `*.hook.test.ts`). Raise deliberately with coverage gains; never silent lower. Client folder understates Wave 6 component coverage (separate suite).

## By area (folder rollup, lines %)

| Area                      | Files | Lines %  | Notes                                       |
| ------------------------- | ----- | -------- | ------------------------------------------- |
| `src/shared/`             | 42+   | **~90%** | near ceiling                                |
| `src/storage/`            | 3     | **100%** | text-utils                                  |
| `src/api/`                | 60+   | **~75%** | handlers + schemas                          |
| `src/middleware/`         | 5     | **~76%** | auth, tokenLimits, requestContext           |
| `src/engine/`             | 69+   | **~74%** | stage mocks + openai provider tests         |
| `src/services/`           | 64+   | **~56%** | domains OK; jobs/import weak                |
| `src/client/`             | 106   | **~53%** | Wave 6 hooks/helpers; UI via test:component |
| `server.ts` + `worker.ts` | 2     | **0%**   | entrypoints                                 |

### Top uncovered files (by remaining gap)

| File                                 | Notes                               |
| ------------------------------------ | ----------------------------------- |
| `services/import/fb2.ts` / `epub.ts` | binary parse (deferred)             |
| `services/jobs/runTranslateJob.ts`   | Wave 7 worker integration           |
| `services/jobs/runAnalysisJob.ts`    | Wave 7 worker integration           |
| `api/routes/seo.ts`                  | SSR glue; `seoHelpers` tested       |
| `ReadingMode/index.tsx`              | helpers extracted; full UI deferred |
| `server.ts` / `worker.ts`            | bootstrap                           |

## Wave completion

| Wave                     | Status         | Deliverables                                                                    |
| ------------------------ | -------------- | ------------------------------------------------------------------------------- |
| 0–5                      | Done           | Unit APP_SCOPE, 55%+ milestone, handler extracts, domain mocks                  |
| **6 — Component**        | **Done**       | Hooks P0, gates/SettingsModal, UI smoke, publication filters, page smokes       |
| **7 — Mock integration** | **Done**       | `createApp` harness, ~9 files / ~44 tests, pre-push gate, Vitest 4.0.8 wrappers |
| **8 — Snapshot**         | **Done**       | Presentational `toMatchSnapshot` for ui/* + EntityCard/TagChip; 15 snaps        |
| **9 — Contract Phase 1** | **Done**       | Zod fixtures + enum sync; 13 files / 18 tests; pre-push `test:contract`         |
| 10 — Live + E2E          | **Blocked Q4** | requires dedicated test environment; `tests/e2e/README.md`                      |

## Mutation testing (Stryker)

Config: `stryker.conf.json` — APP_SCOPE mutate, manual/nightly only (not CI).

```bash
npm run test:mutation
npx stryker run --mutate "src/shared/**/*.ts"
```

Stryker `thresholds`: `high: 80`, `low: 60`, **`break: null`** — advisory bands / trend only (not a merge gate). Distinct from Vitest coverage floors above.

## Vitest pin

Exact **`vitest@4.0.8`** + `@vitest/coverage-v8@4.0.8`. Do not bump to 4.1.x without Windows + Node 24 re-validation (`vi.mock`, forks, glob/dir entry).

## Policy

- Coverage floors active on `test:coverage` only; pre-push = lint + unit + component + integration + contract
- Re-run baseline after major test additions; update this note (and floors if measured drift is intentional)
- See [[02-how-to/run-tests]] and `.cursor/rules/testing.mdc`
