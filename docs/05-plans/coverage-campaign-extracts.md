---
type: plan
status: active
domain: testing
stale: false
created: 2026-09-14
updated: 2026-09-14
---

# Coverage campaign — extracts + hang notes

Two-wave coverage campaign after the Vitest **5.0.0** / Stryker **10** / Zod **4.6** bump. Policy: [[_canonical/rules/testing]]. Baseline numbers: [[05-plans/testing-baseline]]. How-to: [[02-how-to/run-tests]].

Do **not** treat the 2026-09-13 canvas (Vitest 4 / Stryker 9: 78.21/65.68, 30 component gaps, glossary-filter 57.97%) as SSOT after the bump.

## Wave 0 — verified (2026-09-13, Vitest 5 + Stryker 10)

Pyramid green (`lint:all`, `test`, `test:component`, `test:integration`, `test:contract`). Floors **77/65** still hold.

| Check | Result |
| ----- | ------ |
| Unit coverage | **78.24%** lines / **65.81%** branches |
| Component `test:gaps` (pre-campaign) | CLIENT_SCOPE **163** / suites **113** / gaps **30** / deferred **6**; v8 **34.66% / 30.27%** |
| Contract | **39/72** fixtures, enum-sync **9/9** |
| Stryker 10 smoke `glossary-filter.ts` | **58.27%** (81 killed / 43 survived / 15 no cov / 7 errors) — not comparable to Stryker 9’s 57.97% |

Keep: Vitest wrappers, `tsconfig.json` in Stryker `ignorePatterns` ([stryker-js#6111](https://github.com/stryker-mutator/stryker-js/issues/6111)), floors 77/65.

## Wave 1 — in progress

### 1a layer (reverted for CI floors — 2026-09-14)

Renaming upload-queue / chrome / scroll-restore / navigation to `*.hook.test.ts` dropped them from the **unit** suite. `test:coverage` (CI floors) only executes `src/**/*.test.ts`. After the rename, CI #19 failed: **76.21% lines / 64.82% branches** vs floors **77 / 65**. Husky pre-push does not run coverage, so the push looked green.

Kept those four as unit `*.test.ts` with `// @vitest-environment happy-dom` (same tests, unit include). Other hooks stay `*.hook.test.ts`.

`scripts/gen-layer-gaps.mjs`: CLIENT_SCOPE `.ts` counts colocated `*.test.ts` **or** `*.hook.test.ts`. `.tsx` still needs `*.test.tsx`.

### 1b smokes (partial)

Shipped and included in the 2026-09-14 component run: ProjectCoverEditor, ProjectPublicationSection, ProjectEntitySection, ProjectActionsMenu, TranslationPanel, ParagraphList, BatchTranslationProgressModal, BatchStageOptions, UploadQueueModal, AdminNewsPage, AdminEntitiesPage, AdminProjectsPage.

**Not shipped:** `Reports/ReportsModal.tsx` — see hang log below. Glossary extracts still deferred.

### 1c / Wave 2

Zone mutation (`engine/glossary` + `shared`) and remaining contract fixtures: continue after this note. Contract files for login/register/refresh/profile-update/metadata-update are already in the tree.

## Component suite check (2026-09-14)

```bash
npm run test:component
```

**128 files / 368 tests passed** in 15.56s (re-run 00:22 local; earlier same night 15.29s). After restoring four unit hook files (2026-09-14 evening): component suite is **124 / 344** (those tests run under `test` / `test:coverage` instead). Vitest 5.0.0, `pool: 'forks'`, `maxWorkers: 2`, happy-dom 20.14.

Vite still warns that `__dirname` in `vitest.component.config.ts` is unsupported under future `configLoader: 'native'`. Out of campaign scope (same as the Vitest 5 upgrade note).

## Vitest 5 ignore paths (checked)

Campaign did **not** drop unit layer splits. What changed in **Vitest 5.0.0** itself:

- `defaultExclude` is only `**/node_modules/**` and `**/.git/**` — **no** `dist/**`.
- Custom `test.exclude` **replaces** defaults. Configs now spread `configDefaults.exclude` and add `**/dist/**`, `tests/e2e/**`, coverage dirs.
- Unit must keep `src/**/*.hook.test.ts` excluded: `*.hook.test.ts` matches `src/**/*.test.ts`.

SSOT: `vitest.config.ts`, `vitest.component.config.ts`, `vitest.integration.config.ts`.

## ReportsModal hang — what we proved

**Trigger is one file:** `ReportsModal.test.tsx` (now deleted). Not Project\*, TranslationPanel, ParagraphList, Sidebar batch/upload, admin pages, or renamed hooks — those passed in the same batch.

Symptoms:

1. Import never reaches the first `it` (no verbose lines for that file).
2. Worker then dies: `Worker exited unexpectedly with exit code 1`.
3. `vitest run` **does not exit** — the rest of the suite looks frozen.

Likely chain: mock specifier for `../../api/client` misses Vite’s resolved id → real `src/client/api/client.ts` loads → side-effect `new BroadcastChannel(...)` in `src/client/api/cache/invalidation.ts` + `fetch`. Combined with **`pool: 'threads'`** this matches Vitest’s documented hang ([vitest#3077](https://github.com/vitest-dev/vitest/issues/3077), “Failed to Terminate Worker”). A worker crash can leave the main process waiting ([vitest#10543](https://github.com/vitest-dev/vitest/pull/10543); hang-on-crash fix landed in 5.0.0-beta.5 but **`threads` + Node fetch is still unsupported**).

`pool: 'threads'` was set in Aug 2026 on Vitest **4** (then the default). Vitest **5** default is **`forks`**. Component config is back on `forks`.

### If you re-add ReportsModal smoke

1. Mock the **same specifier** the source uses (`from '../../api/client'` **and** `'../../api/client.js'` if needed).
2. Confirm `api/client` is **not** evaluated (no BroadcastChannel, no real `fetch`).
3. Run **only** that file first. If the worker dies, **delete the file** before `npm run test:component` — one bad file hangs the gate.
4. Keep `pool: 'forks'`. Do not switch component back to `threads`.

## Do not

- Full-mount `ProjectInfo`, `GlossaryModal`, `ReadingMode/index`, `ChapterList`, `ProcessChapters`, `SearchReplaceBar`, `ChapterView/index`.
- Lower floors 77/65.
- Full `npm run test:mutation` (zone CLI only).
- Treat Sept 13 mutation 57.97% as a Stryker 10 target.
- Move a unit `*.test.ts` (happy-dom pragma) to `*.hook.test.ts` without `npm run test:coverage` — pre-push will not catch the floor miss.

## CI Node 20 annotation vs job Node 24

The job runtime is **Node 24** (`.nvmrc` / `engines.node`). The GitHub annotation “Node.js 20 is deprecated… forced to run on Node.js 24” is the **action** runtime (`using: node20` in checkout/setup-node/upload-artifact v4), not `setup-node`’s version for `npm test`. Workflow uses `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v6` (`using: node24`).

## References

- [[05-plans/vitest-5-upgrade]]
- [[05-plans/testing-baseline]]
- [Vitest common errors — Failed to Terminate Worker](https://vitest.dev/guide/common-errors)
- [happy-dom BroadcastChannel](https://github.com/capricorn86/happy-dom/issues/1920)
- [Node 20 deprecation on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
