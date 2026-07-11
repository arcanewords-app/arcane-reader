---
status: active
created: 2026-07-12
updated: 2026-07-12
---

# Testing coverage baseline

Measured after **coverage improvement plan waves 0–2** (Q3 2026).

## Strategy: mock-first (no test env)

Arcane Reader has **no dedicated test environment** (isolated Supabase / Redis / BullMQ for CI). All automated tests use **mocks** at external boundaries — including integration, component, and system tests.

| Quarter                 | Scope                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| **Q3 2026** (current)   | Waves 0–2: unit + mocked engine/API smoke. No live DB, Playwright gates.                |
| **Q4 2026+** (future)   | Expanded mocked integration: supertest, Testing Library, Playwright — still mock-first. |
| **Future prerequisite** | Dedicated test environment — only then revisit live integration; **not in Q3**.         |

Detailed wave plan: `.cursor/plans/coverage_improvement_plan_926cfce7.plan.md`. Policy SSOT: [[_canonical/rules/testing]].

### Future directions (Q4 2026+, all mocked)

| Type                  | Approach                                               |
| --------------------- | ------------------------------------------------------ |
| API routes            | supertest + `vi.mock` on `supabaseDatabase` / services |
| UI hooks / components | Testing Library + mocked `fetch`                       |
| Browser smoke         | Playwright + `page.route()` API interception           |

Live full-stack E2E against staging/prod: blocked until test environment exists.

## Test suite (2026-07-12)

| Metric                           | Value                                                  |
| -------------------------------- | ------------------------------------------------------ |
| Test files                       | **45** (42 fast + 3 slow)                              |
| Tests                            | **275** (258 fast + 17 slow tiktoken)                  |
| Fast suite (`npm run test`)      | ~12 s                                                  |
| Slow suite (`npm run test:slow`) | ~100 s                                                 |
| Full suite (`npm run test:all`)  | ~112 s                                                 |
| CI                               | `npm run test:coverage` only (no duplicate `npm test`) |

## Overall coverage (v8, `coverage.include`)

Config in `vitest.config.ts`:

- **include:** `src/**/*.ts`
- **exclude:** `*.test.ts`, `src/client/**`, `src/debug-app/**`, `src/prompt-lab-app/**`

This reports **honest repo-wide %** for server/engine/shared (UI excluded until Q4+ component tests).

| Metric     | Coverage                  |
| ---------- | ------------------------- |
| Lines      | **12.38%** (1733 / 13994) |
| Statements | **12.08%** (1855 / 15347) |
| Functions  | **15.08%** (335 / 2221)   |
| Branches   | **10.05%** (1193 / 11860) |

Command: `npm run test:coverage` → `coverage/coverage-summary.json`, `coverage/index.html`.

> **Note:** Pre–wave-0 baseline (~35% lines) counted only files **reachable by test imports** (~109 files). After `coverage.include`, totals include routes, `server.ts`, `supabaseDatabase.ts`, etc. — lower % but no blind zones.

## By area (folder rollup, post wave 2)

| Area                   | Lines (approx.) | Branches (approx.) | Notes                                                                  |
| ---------------------- | --------------- | ------------------ | ---------------------------------------------------------------------- |
| `src/shared/`          | **62%**         | **52%**            | `validateRoute` helpers via `expressRouteParams`; `paragraphSync` ~85% |
| `src/engine/glossary/` | **51%**         | **43%**            | `glossary-manager` ~59%; `declension-ru` smoke ~24%                    |
| `src/engine/pipeline/` | **44%**         | **40%**            | `translation-pipeline` smoke ~35% (editing-only path)                  |
| `src/api/` (all)       | **2%**          | **1%**             | `validateRoute.ts` **100%**; schemas `common`/`chapters` **100%**      |
| `src/services/`        | **1%**          | **1%**             | `getAgentForProject` cache covered; `engine-integration` still low     |
| `src/api/routes/`      | 0%              | —                  | Q4+ mocked supertest                                                   |

### Key module highlights

| Module                    | Lines %             |
| ------------------------- | ------------------- |
| `validateRoute.ts`        | 100%                |
| `expressRouteParams.ts`   | 100%                |
| `paragraphSync.ts`        | ~85%                |
| `glossary-manager.ts`     | ~59%                |
| `translation-pipeline.ts` | ~35%                |
| `glossary-filter.ts`      | high (see mutation) |

## Mutation testing (Stryker smoke)

First run on `glossary-filter.ts` (2026-07-12):

| Metric                        | Score        |
| ----------------------------- | ------------ |
| Mutation score (total)        | **57.93%**   |
| Mutation score (covered code) | **65.12%**   |
| Killed / survived / no cov    | 84 / 45 / 16 |

Command: `npm run test:mutation` (full config) or `npx stryker run --mutate src/engine/glossary/glossary-filter.ts` for smoke.

`stryker.conf.json` ignores `docs/**`, `.cursor/**` (Windows sandbox EPERM fix).

## Wave completion (Q3)

| Wave                   | Status           | Deliverables                                                                                                                              |
| ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Infra              | Done             | `coverage.include`, CI single coverage run, `test:slow` / `test:all`, Stryker baseline                                                    |
| 1 — Shared + API       | Done             | `expressRouteParams`, `validateRoute` middleware, `paragraphSync`, `declension-ru`, `glossary-manager` CRUD, `chapterTranslationCoverage` |
| 2 — Engine smoke       | Done             | `translation-pipeline` mock, `stage-2-translate` JSON fallback, `getAgentForProject` cache, Zod `common`/`chapters`                       |
| 3 — Mocked integration | **Deferred Q4+** | supertest, Testing Library, Playwright                                                                                                    |

## Policy

- No CI thresholds yet — track trend only
- Re-run baseline after major test additions; update this note
- See [[02-how-to/run-tests]] and `.cursor/rules/testing.mdc`
