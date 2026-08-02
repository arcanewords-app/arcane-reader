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

## Test suite (2026-08-03, post product shell wave)

| Metric                      | Value                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| Unit fast suite files       | covered by `npm run test` / `test:coverage`                                       |
| Component suite             | **108** files / **288** tests (`npm run test:component`)                          |
| Mock-integration suite      | **20** files / **95** tests (`npm run test:integration`)                          |
| Contract suite              | **46** files / **75** tests (`npm run test:contract`)                             |
| Co-located `*.test.tsx`     | **97**                                                                            |
| Co-located `*.hook.test.ts` | **11**                                                                            |
| Pre-push                    | `lint:all` + `test` + `test:component` + `test:integration` + **`test:contract`** |

Component suite: `happy-dom` + `@testing-library/preact`; `vitest.component.config.ts` uses `pool: 'threads'` (Windows fork-runner stability). Unit coverage command does **not** execute `*.test.tsx` (separate config). Integration suite is mock-first (no live Supabase/Redis/LLM).

## Inventory: tested vs untested

| Metric                        | Value   |
| ----------------------------- | ------- |
| Source files in coverage map  | **364** |
| With co-located `*.test.ts`   | **206** |
| Without co-located unit test  | **165** |
| Files at **0%** line coverage | **81**  |

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

| Metric     | Coverage (post large campaign, 2026-08-02) |
| ---------- | ------------------------------------------ |
| Lines      | **77.76%**                                 |
| Statements | **75.72%**                                 |
| Functions  | **80.43%**                                 |
| Branches   | **65.49%**                                 |

### Coverage floors (active)

Enforced only by `npm run test:coverage` (not pre-push), in `vitest.config.ts`:

| Metric   | Floor  |
| -------- | ------ |
| Lines    | **77** |
| Branches | **65** |

> Floors from Coverage campaign Phases A–C (measured integers). Soft ceiling ~78% without un-deferring binary fb2/epub. Unit suite excludes `*.test.tsx` / `*.hook.test.ts`. Never silent lower.

## By area (folder rollup, lines %)

| Area                      | Files | Lines %  | Notes                                        |
| ------------------------- | ----- | -------- | -------------------------------------------- |
| `src/shared/`             | 42+   | **~90%** | near ceiling                                 |
| `src/storage/`            | 3     | **100%** | text-utils                                   |
| `src/api/`                | 60+   | **~75%** | handlers + schemas                           |
| `src/middleware/`         | 5     | **~76%** | auth, tokenLimits, requestContext            |
| `src/engine/`             | 69+   | **~74%** | stage mocks + openai provider tests          |
| `src/services/`           | 64+   | raised   | jobs unit + engine-integration + domains     |
| `src/client/`             | 106+  | raised   | pure extracts + utils; UI via test:component |
| `server.ts` + `worker.ts` | 2     | **0%**   | entrypoints (deferred)                       |

### Top uncovered files (by remaining gap)

| File                                 | Notes                               |
| ------------------------------------ | ----------------------------------- |
| `services/import/fb2.ts` / `epub.ts` | binary parse (deferred)             |
| `services/export` epub/fb2 writers   | binary (deferred)                   |
| `ReadingMode/index.tsx`              | helpers extracted; full UI deferred |
| `server.ts` / `worker.ts`            | bootstrap                           |

## Wave completion

| Wave                     | Status         | Deliverables                                                                     |
| ------------------------ | -------------- | -------------------------------------------------------------------------------- |
| 0–5                      | Done           | Unit APP_SCOPE, 55%+ milestone, handler extracts, domain mocks                   |
| **6 — Component**        | **Done**       | Hooks P0, gates/SettingsModal, UI smoke, publication filters, page smokes        |
| **7 — Mock integration** | **Done**       | `createApp` harness, ~9 files / ~44 tests, pre-push gate, Vitest 4.0.8 wrappers  |
| **8 — Snapshot**         | **Done**       | Presentational `toMatchSnapshot` for ui/* + EntityCard/TagChip; 15 snaps         |
| **9 — Contract Phase 1** | **Done**       | Zod fixtures + enum sync; deepen → 22 files / 32 tests; pre-push `test:contract` |
| 10 — Live + E2E          | **Blocked Q4** | requires dedicated test environment; `tests/e2e/README.md`                       |

## Mutation testing (Stryker)

Config: `stryker.conf.json` — APP_SCOPE mutate, manual/nightly only (not CI).

```bash
npm run test:mutation
npx stryker run --mutate "src/shared/**/*.ts"
```

Stryker `thresholds`: `high: 80`, `low: 60`, **`break: null`** — advisory bands / trend only (not a merge gate). Distinct from Vitest coverage floors above.

## Vitest pin

Exact **`vitest@4.0.8`** + `@vitest/coverage-v8@4.0.8`. Do not bump to 4.1.x without Windows + Node 24 re-validation (`vi.mock`, forks, glob/dir entry).

## Coverage campaign (post–Wave 9)

| Phase          | Target                                                      | Status                                                 |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| A → ~70% lines | jobs + engine-integration + middleware/csv + client pure    | **Done**                                               |
| B → ~75% lines | handlers/domains/seo/export/client api                      | **Done**                                               |
| C → ~78% lines | SearchReplace/pageMeta/batch/selection extracts + inventory | **Done** (~77.7% lines; soft ceiling without binaries) |

Unit floors ≠ component/integration coverage. Deferred: bootstrap entrypoints, ReadingMode full UI, binary fb2/epub parsers, Wave 10.

## Layer gaps (component + contract)

Unit inventory (`gen-test-inventory.mjs`) does not see `*.test.tsx` execution. For UI / wire-shape blind spots:

```bash
npm run test:gaps                 # component coverage + schema/enum inventory → reports/layer-gaps.json
npm run test:gaps -- --reuse      # skip re-run if coverage-component/ exists
npm run test:component:coverage   # CLIENT_SCOPE html/json only
npm run test:contract:coverage    # advisory Zod schema v8 only
```

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

## Policy

- Coverage floors active on `test:coverage` only; pre-push = lint + unit + component + integration + contract
- Layer gaps (`test:gaps`) are advisory — not a merge gate
- Re-run baseline after major test additions; update this note (and floors if measured drift is intentional)
- See [[02-how-to/run-tests]] and `.cursor/rules/testing.mdc`
