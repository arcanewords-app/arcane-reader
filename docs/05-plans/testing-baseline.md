---
status: active
created: 2026-07-12
updated: 2026-07-12
---

# Testing coverage baseline

Measured after **APP_SCOPE expansion** (backend + client SPA; waves 0–2 complete).

## APP_SCOPE (unified)

Single scope for unit tests, coverage, and Stryker `mutate`:

- **include:** `src/**/*.ts`
- **exclude:** `*.test.ts`, `src/debug-app/**`, `src/prompt-lab-app/**`

Lab apps are dev tools, not production app. SSOT: `vitest.config.ts`, `stryker.conf.json`.

## Strategy: mock-first (no test env)

Arcane Reader has **no dedicated test environment** (isolated Supabase / Redis / BullMQ for CI). All automated tests use **mocks** at external boundaries.

| Quarter               | Scope                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Q3 2026** (current) | Mock-first unit tests + mutation on APP_SCOPE; phased waves by folder. No live DB/Redis/worker gates.                       |
| **Q4 2026+** (future) | **Live integration only** — real Supabase, Redis, worker against a dedicated test stack. **Blocked** until test env exists. |
| **Not planned**       | Mocked supertest, Testing Library gates, Playwright with API mocks as Q4 work                                               |

Detailed wave plan: `.cursor/plans/coverage_improvement_plan_926cfce7.plan.md`. Policy SSOT: [[_canonical/rules/testing]].

### Q4 prerequisite (live data only)

| Type             | Approach when test env exists   |
| ---------------- | ------------------------------- |
| API routes       | supertest against test Supabase |
| Worker / queues  | live Redis + test DB            |
| Full-stack smoke | staging test stack (not prod)   |

Until dedicated test environment is provisioned, Q4 integration work is **paused**.

## Test suite (2026-07-12)

| Metric                           | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| Test files                       | **45** (42 fast + 3 slow)                                          |
| Tests                            | **275** (258 fast + 17 slow tiktoken)                              |
| Fast suite (`npm run test`)      | ~12 s                                                              |
| Slow suite (`npm run test:slow`) | ~100 s                                                             |
| Full suite (`npm run test:all`)  | ~112 s                                                             |
| CI                               | `npm run test:coverage` (fast suite; excludes tiktoken slow files) |

**CI install:** GitHub Actions runs `npm ci` on the standalone repo. After adding Vitest/Stryker deps, regenerate [`package-lock.json`](../package-lock.json) with `npm install --no-workspaces` inside `arcane-reader/` (not monorepo root). See [dependency-audit-baseline.md](../02-how-to/dependency-audit-baseline.md).

## Inventory: tested vs untested

| Metric                        | Value                          |
| ----------------------------- | ------------------------------ |
| Source files in APP_SCOPE     | **277**                        |
| With co-located `*.test.ts`   | **38** (**14%**)               |
| **Without unit test**         | **239** (**86%**)              |
| Files at **0%** line coverage | **179** (**65%** of APP_SCOPE) |

Regenerate stats: `node scripts/gen-test-inventory.mjs` (after `npm run test:coverage`).

### Client breakdown

| Folder               | Source files | Co-located tests                  |
| -------------------- | ------------ | --------------------------------- |
| `client/utils/`      | 18           | 2 (`urlRoutes`, `simpleMarkdown`) |
| `client/hooks/`      | 9            | 1 (`useUrlSync`)                  |
| `client/components/` | 16           | **0**                             |
| `client/pages/`      | 1            | **0**                             |
| `client/api/`        | 1            | **0**                             |

## Overall coverage (v8, APP_SCOPE)

Command: `npm run test:coverage` → `coverage/coverage-summary.json`, `coverage/index.html`.

| Metric          | Coverage                  |
| --------------- | ------------------------- |
| Lines           | **11.42%** (1837 / 16076) |
| Statements      | **11.16%** (1977 / 17710) |
| Functions       | **13.35%** (363 / 2719)   |
| Branches        | **9.46%** (1258 / 13297)  |
| Uncovered lines | **14 239**                |

> **Note:** Pre–wave-0 baseline (~35% lines) counted only files reachable by test imports. APP_SCOPE includes routes, `server.ts`, `supabaseDatabase.ts`, and `client/**` — lower % but no blind zones.

## By area (folder rollup)

| Area                      | Files | 0% files | With test | Lines % (approx.) |
| ------------------------- | ----- | -------- | --------- | ----------------- |
| `src/shared/`             | 39    | 17       | 19        | **62%**           |
| `src/engine/`             | 68    | 20       | 12        | **40%**           |
| `src/client/`             | 54    | 47       | 3         | **9%**            |
| `src/api/`                | 28    | 24       | 1         | **2%**            |
| `src/services/`           | 39    | 32       | 1         | **1%**            |
| `src/middleware/`         | 5     | 5        | 1         | **0%**            |
| `server.ts` + `worker.ts` | 2     | 2        | 0         | **0%**            |

### Top uncovered files (0% lines, by size)

| File                                                  | Lines |
| ----------------------------------------------------- | ----- |
| `services/supabaseDatabase.ts`                        | 2264  |
| `api/routes/chapters.ts`                              | 1111  |
| `api/routes/publications.ts`                          | 625   |
| `client/api/client.ts`                                | 549   |
| `api/chapterTranslation.ts`                           | 457   |
| `api/routes/admin.ts`                                 | 373   |
| `api/routes/projects.ts`                              | 325   |
| `api/routes/glossary.ts`                              | 302   |
| `api/routes/user.ts`                                  | 229   |
| `services/import/epub.ts`                             | 229   |
| `client/components/SearchReplace/useProjectSearch.ts` | 216   |
| `client/hooks/useBatchChapterTranslation.ts`          | 188   |

**Q3 approach for large files:** extract pure helpers → unit test with mocks. **Q4:** live route/DB tests when test env exists.

## Phased unit-test waves (Q3)

| Wave  | Zone                                               | Focus                                                      | Target                             |
| ----- | -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| **1** | `engine/`, `shared/`, `client/utils` + `hooks`     | pure logic, co-located tests                               | ≥ 80 files with tests (~30% scope) |
| **2** | `api/` helpers, `middleware/`, `services/` extract | Zod, validateRoute, extracted DB helpers                   | services helpers ≥ 25% lines       |
| **3** | `client/components/`                               | jsdom + Testing Library + mocked `fetch` (mock-first)      | component smoke on critical flows  |
| **4** | `api/routes/`, `server.ts`, `worker.ts`            | extract validation/rules → unit; live tests deferred to Q4 | route helpers covered              |

## Mutation testing (Stryker)

Config: `stryker.conf.json` — APP_SCOPE mutate, `vitest.related: false`, `incremental: true`, manual/nightly only (not CI).

Commands:

```bash
npm run test:mutation   # full APP_SCOPE (hours; use incremental)
npx stryker run --mutate src/engine/glossary/glossary-filter.ts   # smoke
npx stryker run --mutate "src/shared/**/*.ts"   # per-zone
```

Report: `reports/mutation/mutation.html` (gitignored). Sandbox: `.stryker-tmp/` (gitignored).

### Baseline scores

| Run              | Scope                                   | Mutation score (total) | Covered code        | Killed / survived / no cov                                                 |
| ---------------- | --------------------------------------- | ---------------------- | ------------------- | -------------------------------------------------------------------------- |
| 2026-07-12 smoke | `glossary-filter.ts`                    | **57.93%**             | **65.12%**          | 84 / 45 / 16                                                               |
| 2026-07-12 zone  | `src/shared/**` (3261 mutants, ~29 min) | **38.18%** (shared)    | **54.41%** (shared) | 1222 / 1043 / 973                                                          |
| Full APP_SCOPE   | `npm run test:mutation`                 | —                      | —                   | manual/nightly; expect low total % (many NoCoverage on 239 untested files) |

> Full APP_SCOPE first run expects **low total score** (many NoCoverage on untested files). Track **mutation score (covered code)** per zone. Zone runs: `npx stryker run --mutate "src/engine/**/*.ts"`, etc.

`stryker.conf.json` ignores `docs/**`, `.cursor/**` (Windows sandbox EPERM fix).

## Wave completion (Q3)

| Wave                 | Status         | Deliverables                                                                       |
| -------------------- | -------------- | ---------------------------------------------------------------------------------- |
| 0 — Infra            | Done           | APP_SCOPE, CI coverage, `test:slow` / `test:all`, Stryker config, inventory script |
| 1 — Shared + API     | Done           | validateRoute, paragraphSync, glossary-manager, etc.                               |
| 2 — Engine smoke     | Done           | translation-pipeline mock, stage-2, Zod schemas                                    |
| 3 — Phased expansion | **Active**     | waves 1–4 above; client in coverage                                                |
| 4 — Live integration | **Blocked Q4** | requires dedicated test environment                                                |

## Policy

- No CI thresholds yet — track trend only
- Re-run baseline after major test additions; update this note
- See [[02-how-to/run-tests]] and `.cursor/rules/testing.mdc`
