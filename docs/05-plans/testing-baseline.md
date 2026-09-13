---
status: active
created: 2026-07-12
updated: 2026-09-14
---

# Testing coverage baseline

Measured **2026-09-13** (`npm run test:coverage` + `npm run test:gaps`; Wave 0 after Vitest 5). Component suite re-checked **2026-09-14**. Campaign log: [[05-plans/coverage-campaign-extracts]]. Strategy SSOT: [[05-plans/testing-strategy]]. August wave tables below are historical.

## APP_SCOPE (unified)

Single scope for unit tests, coverage, and Stryker `mutate`:

- **include:** `src/**/*.ts` (mutate does **not** include `.tsx` — Stryker dry-run uses the unit Vitest config)
- **exclude:** `*.test.ts`, `*.test.tsx`, `*.hook.test.ts`, `src/debug-app/**`, `src/prompt-lab-app/**`, `src/debug/**`, `src/prompt-lab/**`

Lab apps and dev-only debug/prompt-lab server code are not production app. SSOT: `vitest.config.ts`, `stryker.conf.json`.

## Strategy: mock-first (no test env)

Arcane Reader has **no dedicated test environment** (isolated Supabase / Redis / BullMQ for CI). Automated tests use **mocks** at external boundaries unless noted.

| Phase                 | Scope                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q3 2026** (current) | Unit + Component + mock-integration + contract (pre-push and GitHub Actions) + **local Playwright E2E** vs Docker stamp. Mutation on APP_SCOPE (manual). |
| **Q4 2026+** (future) | Dedicated CI live stack — live `tests/integration/supabase/`, Redis/worker, Playwright as merge gate. **Blocked** until test env exists.                 |

Policy SSOT: [[_canonical/rules/testing]]. Full pyramid: [[05-plans/testing-strategy]].

### Q4 prerequisite (live data only)

| Type             | Approach when test env exists          |
| ---------------- | -------------------------------------- |
| API routes       | supertest against test Supabase        |
| Worker / queues  | live Redis + test DB                   |
| Full-stack smoke | Playwright on CI test stack (not prod) |

Until a dedicated test environment is provisioned, **CI live** work is paused. Local Playwright vs stamp is unblocked (`npm run test:e2e`). Mock pyramid is in pre-push and GitHub Actions.

## Test suite (2026-08-03, post product shell wave)

| Metric                      | Value                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| Unit fast suite files       | covered by `npm run test` / `test:coverage`                                       |
| Component suite             | **128** files / **368** tests (`npm run test:component`, 2026-09-14; was 113 / 314 on 2026-09-13) |
| Mock-integration suite      | **20** files / **95** tests (`npm run test:integration`)                          |
| Contract suite              | **46** files / **75** tests (`npm run test:contract`)                             |
| Co-located `*.test.tsx`     | **111**                                                                           |
| Co-located `*.hook.test.ts` | **17**                                                                            |
| Pre-push                    | `lint:all` + `test` + `test:component` + `test:integration` + **`test:contract`** |

Component suite: `happy-dom` + `@testing-library/preact`; `vitest.component.config.ts` uses `pool: 'forks'` (Vitest 5 default). Do **not** set `threads` — Node `fetch` in worker_threads can hang the run ([vitest#3077](https://github.com/vitest-dev/vitest/issues/3077)). Unit coverage command does **not** execute `*.test.tsx` (separate config). Integration suite is mock-first (no live Supabase/Redis/LLM).

## Inventory: tested vs untested

| Metric                        | Value (2026-08) | Value (2026-09-13) |
| ----------------------------- | --------------- | ------------------ |
| Source files in coverage map  | 364             | **368**            |
| With co-located `*.test.ts`   | 206             | **245**            |
| Without co-located unit test  | 165             | **151**            |
| Files at **0%** line coverage | 81              | **73**             |

Regenerate stats: `node scripts/gen-test-inventory.mjs` (after `npm run test:coverage`).

### Client breakdown

| Folder               | Coverage notes                                                                  |
| -------------------- | ------------------------------------------------------------------------------- |
| `client/utils/`      | Strong + `publicationChapterFilters`                                            |
| `client/hooks/`      | Wave 6 P0: translation / token / history hooks                                  |
| `client/components/` | Product shell: Header/Jobs/ChapterHeader + large page smokes; monsters deferred |
| `client/pages/`      | About / Privacy / Terms / Projects smokes                                       |
| `client/api/`        | Domains / cache / transport mostly covered                                      |

## Overall coverage (v8, APP_SCOPE — unit suite)

Command: `npm run test:coverage` → `coverage/coverage-summary.json`, `coverage/index.html`.

| Metric     | 2026-08-16 | 2026-09-13 (pre-bump canvas) | Wave 0 Vitest 5 (2026-09-13) |
| ---------- | ---------- | ---------------------------- | ---------------------------- |
| Lines      | 78.21%     | 78.21%                       | **78.24%**                   |
| Statements | 76.09%     | 76.10%                       | —                            |
| Functions  | 80.42%     | 80.35%                       | —                            |
| Branches   | 65.67%     | 65.68%                       | **65.81%**                   |

### Coverage floors (active)

Enforced only by `npm run test:coverage` (not pre-push), in `vitest.config.ts`:

| Metric   | Floor  |
| -------- | ------ |
| Lines    | **77** |
| Branches | **65** |

> Floors from Coverage campaign Phases A–C (measured integers). Soft ceiling ~78% without un-deferring binary fb2/epub. Unit suite excludes `*.test.tsx` / `*.hook.test.ts`. Never silent lower.

## By area (folder rollup, lines %)

| Area                      | Files | Lines % (2026-09-13) | Notes                                                     |
| ------------------------- | ----- | -------------------- | --------------------------------------------------------- |
| `src/shared/`             | 42    | **92.2%**            | near ceiling                                              |
| `src/storage/`            | 3     | **100%**             | text-utils (types/database are 0-line)                    |
| `src/middleware/`         | 5     | **91.3%**            | auth, tokenLimits, requestContext                         |
| `src/api/`                | 60    | **84.4%**            | handlers + schemas                                        |
| `src/services/`           | 65    | **78.0%**            | hugs floor; binary import/export still 0%                 |
| `src/engine/`             | 69    | **77.6%**            | hugs floor; preview files live in `test:slow`             |
| `src/client/`             | 108   | **67.8%**            | unit v8 only; UI/hooks via `test:component`               |
| `server.ts` + `worker.ts` | 2     | **0%**               | entrypoints (deferred)                                    |

### Top uncovered files (by remaining gap, unit v8)

| File                                       | Lines | Notes                                  |
| ------------------------------------------ | ----- | -------------------------------------- |
| `SearchReplace/useProjectSearch.ts`        | 186   | Hook suite only — not a unit-floor gap |
| `services/import/fb2.ts` / `export/fb2.ts` | 156+98 | binary parse/write (deferred)         |
| `hooks/useReadingTextSelection.ts` etc.    | 19–67 | Hook suite only                        |
| `createApp.ts`                             | 54    | mock-integration, not unit             |
| `export/epub.ts`                           | 31    | binary (deferred)                      |
| `*-execution-preview.ts`                   | 22–24 | `test:slow`                            |
| `server.ts` / `worker.ts`                  | 21+16 | bootstrap                              |

## Wave completion

| Wave                     | Status                          | Deliverables                                                                     |
| ------------------------ | ------------------------------- | -------------------------------------------------------------------------------- |
| 0–5                      | Done                            | Unit APP_SCOPE, 55%+ milestone, handler extracts, domain mocks                   |
| **6 — Component**        | **Done**                        | Hooks P0, gates/SettingsModal, UI smoke, publication filters, page smokes        |
| **7 — Mock integration** | **Done**                        | `createApp` harness, ~9 files / ~44 tests, pre-push gate, Vitest wrappers  |
| **8 — Snapshot**         | **Done**                        | Presentational `toMatchSnapshot` for ui/* + EntityCard/TagChip; 15 snaps         |
| **9 — Contract Phase 1** | **Done**                        | Zod fixtures + enum sync; deepen → 22 files / 32 tests; pre-push `test:contract` |
| 10 — Live + E2E          | **Local unblocked; CI blocked** | Playwright vs stamp; `tests/e2e/README.md`                                       |

## Mutation testing (Stryker)

Config: `stryker.conf.json` — APP_SCOPE mutate, manual/nightly only (not CI).

TypeScript 7: keep `tsconfig.json` in `ignorePatterns` until Stryker replaces `TSConfigPreprocessor`'s `parseConfigFileTextToJson` call ([stryker-js#6111](https://github.com/stryker-mutator/stryker-js/issues/6111)). Vitest compiles via esbuild; the project tsconfig is flat (no `extends` / `references` / `paths`).

Mutate excludes `*.hook.test.ts` (those files match `src/**/*.ts`). `.tsx` components are **not** in mutate — Stryker dry-run uses the unit Vitest config. JSON report: `reports/mutation/mutation.json`. `related: false` is intentional for nightly coverage maps; smoke still pays a full unit dry-run.

```bash
npm run test:mutation
npx stryker run --mutate "src/shared/**/*.ts"
```

Stryker `thresholds`: `high: 80`, `low: 60`, **`break: null`** — advisory bands / trend only (not a merge gate). Distinct from Vitest coverage floors above.

Smoke (2026-09-13, Stryker **10**): `glossary-filter.ts` **58.27%** (81 killed / 43 survived / 15 no cov / 7 errors). Not comparable to Stryker 9’s 57.97%. Zone re-run after extra glossary tests is still pending — [[05-plans/coverage-campaign-extracts]]. Babel 8 wants Node >=24.11; local 24.10 uses `npm install --engine-strict=false`.

## Vitest pin

Exact **`vitest@5.0.0`** + `@vitest/coverage-v8@5.0.0`. Keep Windows wrappers (`scripts/test-*.mjs`, explicit file lists, `maxWorkers: 2`, no integration `setupFiles`) until Windows + Node 24 proof that glob/dir entry and `setupFiles` work on 5.x. Vitest 5 `defaultExclude` is only `node_modules` + `.git` — configs spread `configDefaults.exclude` and add `**/dist/**`, `tests/e2e/**`. Extract campaign + ReportsModal hang log: [[05-plans/coverage-campaign-extracts]].

## Coverage campaign (post–Wave 9)

| Phase              | Target                                                                       | Status                                                        |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A → ~70% lines     | jobs + engine-integration + middleware/csv + client pure                     | **Done**                                                      |
| B → ~75% lines     | handlers/domains/seo/export/client api                                       | **Done**                                                      |
| C → ~78% lines     | SearchReplace/pageMeta/batch/selection extracts + inventory                  | **Done** (~77.7% lines; soft ceiling without binaries)        |
| D → restore floors | ReadingMode/Sidebar/SearchReplace extract cores + happy-dom unit hook suites | **Done** (2026-08-16: **78.21%** lines / **65.67%** branches) |

Unit floors ≠ component/integration coverage. Deferred: bootstrap entrypoints, ReadingMode full UI, binary fb2/epub parsers, CI live E2E. Local Playwright vs stamp is unblocked (`npm run test:e2e`).

## Layer gaps (component + contract)

Unit inventory (`gen-test-inventory.mjs`) does not see `*.test.tsx` execution. For UI / wire-shape blind spots:

```bash
npm run test:gaps                 # component coverage + schema/enum inventory → reports/layer-gaps.json
npm run test:gaps -- --reuse      # skip re-run if coverage-component/ exists
npm run test:component:coverage   # CLIENT_SCOPE html/json only
npm run test:contract:coverage    # advisory Zod schema v8 only
```

### Refresh (`test:gaps`, 2026-09-13)

| Layer     | Metric                                      | 2026-08-03 product shell | 2026-09-13              |
| --------- | ------------------------------------------- | ------------------------ | ----------------------- |
| Component | CLIENT_SCOPE / with suite / gaps / deferred | 130 / 108 / 9 / 7        | **163 / 113 / 30 / 6**  |
| Component | v8 lines / branches (advisory)              | ~36.92%                  | **37.69% / 33.04%**     |
| Contract  | schemas with fixtures / total               | 39 / 72                  | **39 / 72**             |
| Contract  | enum-sync covered / targets                 | 9 / 9                    | **9 / 9**               |
| Unit      | lines / branches (floors 77/65)             | 78.21 / 65.67            | **78.21 / 65.68**       |

CLIENT_SCOPE grew (extracts from ProjectInfo / Glossary / ReadingMode / Sidebar). Suites +5; gap count 30 is mostly new modules without their own suites, not lost tests. Top component gaps: `ProjectInfo.tsx`, `ChapterView/*`, admin pages, upload-queue hook. Contract still selective — remaining 33 are list/query and auth bodies. Map: canvas `coverage-gaps`.

### Extract campaign (2026-09-14)

Component suite **128 / 368** green after extract + admin smokes and hook renames. `test:gaps` **not** re-run after those suites — expect suites >113 and gaps <30; `ReportsModal.tsx` stays a gap (hang — do not re-add smoke until the api mock blocks `BroadcastChannel`). Details: [[05-plans/coverage-campaign-extracts]].

### Post deepen wave (`test:gaps`, 2026-08-02)

| Layer     | Metric                                      | Before deepen     | After deepen          |
| --------- | ------------------------------------------- | ----------------- | --------------------- |
| Component | CLIENT_SCOPE / with suite / gaps / deferred | 130 / 26 / 95 / 7 | **130 / 36 / 85 / 7** |
| Component | v8 lines (advisory, component suite)        | —                 | **~7.14%**            |
| Contract  | schemas with fixtures / total               | 8 / 72            | **15 / 72**           |
| Contract  | enum-sync covered / targets                 | 4 / 9             | **9 / 9**             |

### Post further coverage wave (`test:gaps`, 2026-08-02)

| Layer       | Metric                                      | After deepen      | After further wave    |
| ----------- | ------------------------------------------- | ----------------- | --------------------- |
| Component   | CLIENT_SCOPE / with suite / gaps / deferred | 130 / 36 / 85 / 7 | **130 / 41 / 80 / 7** |
| Component   | v8 lines (advisory, component suite)        | ~7.14%            | **~8.38%**            |
| Contract    | schemas with fixtures / total               | 15 / 72           | **21 / 72**           |
| Contract    | enum-sync covered / targets                 | 9 / 9             | **9 / 9**             |
| Unit        | lines / branches (floors 77/65)             | 77.69 / 65.28     | **77.69 / 65.33**     |
| Integration | suite files / tests                         | 9 / 44            | **11 / 54**           |

Further wave: ReplacePreviewModal, ChapterStatusSelect, AnnouncementBanner, ReadingHistorySection, CriticUpgradeModal; +6 API contract fixtures; unit branch edges (`publication-rating`, `seoHtml`, `importCoverPath`); mock-integration glossary + rating/read-progress. Still **advisory** for layers — do **not** fold into unit floors 77/65 or husky.

### Post large coverage campaign (`test:gaps`, 2026-08-02)

| Layer       | Metric                                      | After further wave | After large campaign  |
| ----------- | ------------------------------------------- | ------------------ | --------------------- |
| Component   | CLIENT_SCOPE / with suite / gaps / deferred | 130 / 41 / 80 / 7  | **130 / 71 / 50 / 7** |
| Component   | v8 lines (advisory, component suite)        | ~8.38%             | **~15.96%**           |
| Contract    | schemas with fixtures / total               | 21 / 72            | **39 / 72**           |
| Contract    | enum-sync covered / targets                 | 9 / 9              | **9 / 9**             |
| Unit        | lines / branches (floors 77/65)             | 77.69 / 65.33      | **77.76 / 65.49**     |
| Integration | suite files / tests                         | 11 / 54            | **20 / 95**           |

Large campaign: +30 component suites (Batches A–C), +18 contract schemas (chapters/glossary/projects/report), +9 mock-integration routes, unit buffer (`critic`, `text-block-presets`, chapterPicker/bulkReplace). Layers remain **advisory** — no floors / husky for `test:gaps`.

### Post component focus wave (`test:gaps`, 2026-08-02)

| Layer     | Metric                                      | After large campaign | After component focus   |
| --------- | ------------------------------------------- | -------------------- | ----------------------- |
| Component | CLIENT_SCOPE / with suite / gaps / deferred | 130 / 71 / 50 / 7    | **130 / 96 / 24 / 7**   |
| Component | v8 lines (advisory, component suite)        | ~15.96%              | **~23.32%**             |
| Contract  | schemas with fixtures / total               | 39 / 72              | **39 / 72** (unchanged) |
| Contract  | enum-sync                                   | 9 / 9                | **9 / 9**               |

Component-only wave (+25 suites): Dashboard, CopyChaptersModal, ProjectList, SupportMenu, ChapterTocModal, Cabinet/Profile/Project/AccountTiers/ReadingMode pages, News/Contact, ReportsModal, Sidebar chrome, admin thin (form fields, photo, publications/users smokes, section/tabs/redirect), Suspense; hooks `useReadingTextSelection`, `useStaticPageMeta`. No new contract fixtures. Layers remain **advisory**.

### Post product shell wave (`test:gaps`, 2026-08-03)

| Layer     | Metric                                      | After component focus | After product shell     |
| --------- | ------------------------------------------- | --------------------- | ----------------------- |
| Component | CLIENT_SCOPE / with suite / gaps / deferred | 130 / 96 / 24 / 7     | **130 / 108 / 9 / 7**   |
| Component | v8 lines (advisory, component suite)        | ~23.32%               | **~36.92%**             |
| Contract  | schemas with fixtures / total               | 39 / 72               | **39 / 72** (unchanged) |

P0 (+12 suites): ChapterHeader, Header, JobsPanel, TranslatorPseudonymsSection, ChapterPage, PublicationGlossaryModal, ChapterPickerPanel, HomePage, PublicationPage, PublicationReadingPage, TranslationRequestsPage, `useProjectSearch.hook`. P1 editor chrome **skipped** (gaps already ≤12). Leftover gaps: ProjectInfo + ChapterView stack + 3 admin pages + 2 unit-only pure modules. Layers remain **advisory**.

### Deferred monsters extract wave (2026-08-03)

UI extract/reuse (not a coverage campaign). Deferred list in `scripts/gen-layer-gaps.mjs` → **6** (EntityPickerModal removed after smoke suite).

| Target              | Before → after (approx LOC) | Extract                                                              |
| ------------------- | --------------------------- | -------------------------------------------------------------------- |
| `GlossaryModal`     | 2347 → ~1248                | nested modals, `glossaryImportParse`, shared `GlossaryTypeFilterBar` |
| `ProjectInfo`       | 2288 → ~1481                | Cover / Entity / Publication / Actions panels under `Project/`       |
| `ReadingMode/index` | 1851 → ~1243                | navigation / scroll / chrome hooks                                   |
| `ChapterList`       | 1679 → ~1126                | `useChapterUploadQueue` + `UploadQueueModal`                         |
| `ProcessChapters`   | 1254 → ~571                 | `BatchTranslationProgressModal` + `BatchStageOptions`                |
| `SearchReplaceBar`  | 368 → ~213                  | `useChapterSearchReplace`                                            |
| `EntityPickerModal` | 231                         | smoke tests; **out of** `COMPONENT_DEFERRED`                         |

Full shells of Glossary / ReadingMode / ChapterList / ProcessChapters remain deferred from component mount. Prefer extract + unit/hook tests. Layers remain **advisory**.

## Policy

- Coverage floors active on `test:coverage` (GitHub Actions merge gate); pre-push = lint + unit + component + integration + contract (no floors)
- Local E2E is not a merge gate
- Layer gaps (`test:gaps`) are advisory — not a merge gate
- Re-run baseline after major test additions; update this note (and floors if measured drift is intentional)
- See [[02-how-to/run-tests]] and `.cursor/rules/testing.mdc`
