# Testing Patterns (Arcane Reader)

Exemplar tests in this repo — match these patterns before inventing new ones.
Strategy: `@docs/05-plans/testing-strategy.md`.

## APP_SCOPE

Unit tests, coverage, and Stryker mutation share the same scope:

- `src/**/*.ts` minus `*.test.ts`, `src/debug-app/**`, `src/prompt-lab-app/**`, `src/debug/**`, `src/prompt-lab/**`
- Includes backend + client SPA

Inventory: `node scripts/gen-test-inventory.mjs` after `npm run test:coverage`.

## Engine — pure logic

**Exemplar:** `@src/engine/glossary/glossary-filter.test.ts`

- Local fixture factory: `makeGlossary(overrides)`
- `describe` per exported function
- Test behavior: "includes character when name appears in chunk"

**Pipeline resolver:** `@src/engine/pipeline/resolve-execution-options.test.ts`

- Matrix of `PipelineOptions` → resolved execution modes
- Cover flag combinations, not every permutation blindly

**Prompt structure (no live LLM):** `@src/engine/pipeline/stage-prompt-flow.test.ts`

- Assert prompt contains required fragments
- Use `resolvePrompts` / factory functions from production code

**LLM provider mock:** `@src/engine/providers/openai.completejson.test.ts`

```typescript
function providerWithMockCreate(create: () => Promise<MockResponse>): OpenAIProvider {
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4.1-mini' });
  (provider as unknown as { client: { chat: { completions: { create: typeof create } } } }).client =
    { chat: { completions: { create: async () => create() } } };
  return provider;
}
```

## Shared — business rules

**Exemplar:** `@src/shared/chapterTranslationCoverage.test.ts`

- SSOT for paragraph coverage rules used by server + client
- Use minimal paragraph fixtures with `id`, `type`, `translated`

**Paragraph sync:** `@src/shared/paragraphSync.test.ts`, `@src/shared/paragraphTranslationMap.test.ts`

- Edge cases: empty arrays, separator paragraphs, ID remapping

## API — validation helpers

**Exemplar:** `@src/api/validateRoute.test.ts`

- Test `normalizeQueryValue`, `normalizeQueryRecord`
- Middleware: `validateParams`, `validateQuery`, `parseParams`, `parseQuery` with mocked `req`/`res`/`next`
- Pair with Zod `safeParse` examples

**Route params:** `@src/shared/expressRouteParams.test.ts` — `parseRouteParam`, coerced query helpers.

**Zod schemas:** `@src/api/schemas/schemas.test.ts` — `common.ts`, `chapters.ts` valid/invalid payloads.

Do **not** spin up full Express app in unit tests — extract testable helpers first. For HTTP chains use mock-integration (`tests/integration/`).

## Engine — pipeline smoke (mocked LLM)

**Exemplar:** `@src/engine/pipeline/translation-pipeline.test.ts`

- `onlyEditing` path with mocked `ILLMProvider.complete`
- Assert `finalTranslation` and stage success without live LLM

**Stage-2 JSON fallback:** `@src/engine/stages/stage-2-translate.test.ts`

- `completeJSON` throws → `complete` returns paragraph JSON → unwrap via `tryParseTranslationParagraphsJson`

**Declension:** `@src/engine/glossary/declension-ru.test.ts` — nominative/genitive smoke for Russian names.

## Middleware — route classification

**Exemplar:** `@src/middleware/serviceHealth.test.ts`

- Pure functions: `isPublicReadRoute`, `isHealthExemptPath`
- Table-driven `assert.equal` / `expect` per route

## Client — pure utils (no DOM)

**URL builders:** `@src/client/utils/urlRoutes.test.ts`

- `buildCatalogUrl`, query serialization, defaults

**Hook helpers:** `@src/client/hooks/useUrlSync.test.ts`

- Test exported pure functions (`urlSyncStateEquals`), not Preact lifecycle

**Markdown:** `@src/client/utils/simpleMarkdown.test.ts`

## Client — component / hooks (Testing Library)

**Setup:** `src/test/setup-component.ts` (i18n + cleanup). Run via `npm run test:component` or file pragma `// @vitest-environment happy-dom`.

**Gate exemplar:** `@src/client/components/Auth/RequireRole.test.tsx`, `AuthorGate.test.tsx`, `AdminGate.test.tsx`

Mock heavy children (`UpgradeScreen`, `../ui`) and `react-i18next` so Vite does not load `react` from `react-i18next` (workspace has Preact only). Match import specifiers **without** `.js` when the source imports that way (`./UpgradeScreen`, `../ui`).

```typescript
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useUserRole.js', () => ({ useUserRole: vi.fn() }));
vi.mock('./UpgradeScreen', () => ({ UpgradeScreen: () => 'Upgrade screen' }));
vi.mock('../ui', () => ({ LoadingSpinner: () => 'Loading' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useUserRole } from '../../hooks/useUserRole.js';
import { AuthorGate } from './AuthorGate.js';
```

**Hook exemplars:**

| Hook        | File                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| Role        | `useUserRole.hook.test.ts`                                                      |
| Token limit | `useTokenLimitCheck.hook.test.ts`                                               |
| Translate   | `useChapterTranslation.hook.test.ts`                                            |
| Batch       | `useBatchChapterTranslation.hook.test.ts` + pure `batchTranslationPoll.test.ts` |
| History     | `useReadingHistory.hook.test.ts`                                                |

```typescript
// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/preact';
import { vi } from 'vitest';

vi.mock('./useTokenLimitCheck.js', () => ({
  useTokenLimitCheck: () => ({
    checkBeforeTranslate: (_n: number, onProceed: () => void) => {
      onProceed();
      return 'ok';
    },
    // ...
  }),
}));
```

**SettingsModal smoke:** `@src/client/components/Sidebar/SettingsModal.test.tsx` — mock `react-i18next`, `ProjectLanguagePairFields`, assert title/close/Escape.

**Catalog toolbar / chips:** `@src/client/components/Home/CatalogFilterToolbar.test.tsx` — chip toggle + clear; mock i18n; do not mount `HomePage`.

**Presentational + snap:** `@src/client/components/Home/PublicationStatusBadge.test.tsx`, `@src/client/components/Publication/PublicationRatingStars.test.tsx`.

**Auth / upgrade / health:** `LoginForm.test.tsx`, `UpgradeScreen.test.tsx`, `AiReplaceUpgradeModal.test.tsx`, `ServiceStatusBanner.test.tsx` — mock auth / `useUserRole` / `ServiceHealthContext`.

**Publication filters (pure):** `@src/client/utils/publicationChapterFilters.test.ts` — prefer extract over mounting `PublicationPage`.

**Page smoke:** `@src/client/pages/AboutPage.test.tsx` — mock `useStaticPageMeta` + i18n; assert `heading` level 1.

## Services — language pair

**Exemplar:** `@src/services/languagePair.test.ts`

- `mockProject()` factory
- `getAgentForProject` cache key includes language pair (`clearAgentCache` in `afterEach`)
- `isProjectLanguagePairLocked` rules

## Editing prompts

**Exemplar:** `@src/engine/prompts/editing-prompt-combos.test.ts`

- Assert system prompt structure per preset/focus combo
- No `console.log` in committed tests — use assertions only

## Integration — mock-first (supertest)

**Exemplar:** `@tests/integration/helpers/createTestApp.ts` (+ `@tests/integration/api/publications.test.ts`)

- `bootTestApp()` after `vi.mock` of auth / redis / supabase domains
- Auth stub: Bearer + optional `X-Test-Role` (`helpers/mockAuth.ts`)
- Domain stubs: `helpers/mockSupabase.ts` → `resetMocks()` in `beforeEach`
- Client chains: `helpers/appFetch.ts` + real `publicationsApi`
- Worker: call `runTranslateJob` / `runAnalysisJob` directly with mocked DB/LLM
- Env isolation: import `@tests/integration/setup.ts` via helpers (not Vitest `setupFiles`)
- Run via `npm run test:integration` (`scripts/test-integration.mjs`)

**Windows wrappers:** unit/component/integration scripts resolve hoisted `vitest.mjs` and set cwd via `realpathSync.native` (drive-letter casing). Prefer `npm run test*` over raw `npx vitest` on this machine.

```typescript
vi.mock('../../../src/middleware/auth.js', () => installAuthMocks());
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/publications.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...createPublicationsDomainOverlay() };
});

describe('GET /api/publications', () => {
  let app: Application;
  beforeAll(async () => {
    app = await bootTestApp();
  });
  it('lists publications', async () => {
    getSupabaseMock('listPublicationsPublic').mockResolvedValue([]);
    const res = await request(app).get('/api/publications');
    expect(res.status).toBe(200);
  });
});
```

Live Supabase integration: `tests/integration/supabase/README.md` — blocked until test env.

## Contract (Wave 9 Phase 1)

**Exemplars:** `@tests/contracts/api/news-create.contract.test.ts`, `@tests/contracts/api/glossary-create.contract.test.ts`, `@tests/contracts/client-server/news-enums.contract.test.ts`, `@tests/contracts/client-server/chapter-status.contract.test.ts`

```typescript
import { newsCreateSchema } from '../../../src/api/schemas/news.js';
import { loadFixture } from '../helpers/loadFixture.js';

it('accepts a valid create body fixture', () => {
  const parsed = newsCreateSchema.safeParse(loadFixture('news-create.valid.json'));
  expect(parsed.success).toBe(true);
});
```

**Client ↔ server enums:** freeze arrays in `fixtures/*.json`, assert equal to Zod `as const` exports and client union literals. Enum-sync targets (9/9) are listed in `scripts/gen-layer-gaps.mjs` `ENUM_SYNC_TARGETS` — inventory via `npm run test:gaps`.

- Fixtures: `tests/contracts/fixtures/*.json` via `loadFixture`
- Happy path + 1–2 reject fixtures — do not duplicate full schema unit suites
- No Pact / live HTTP (Phase 2 after service split)
- Run: `npm run test:contract` (also in pre-push)
- See `tests/contracts/README.md`

## Snapshot (Wave 8)

Vitest `toMatchSnapshot()` for **stable presentational** markup only (`ui/*`, `EntityCard`, `TagChip`, status badges, rating stars). Co-located `__snapshots__/` next to the test. Single happy-dom viewport — no breakpoint matrix.

**Exemplar:** `@src/client/components/ui/Button.test.tsx`, `@src/client/components/EntityCard/EntityCard.test.tsx`, `@src/client/components/Home/PublicationStatusBadge.test.tsx`

```typescript
it('matches snapshot for primary button', () => {
  const { container } = render(<Button>Save</Button>);
  expect(container.firstChild).toMatchSnapshot();
});
```

- Snapshot a stable root (`container.firstChild` or `.modal-overlay` for portals) — not `document.body`
- Pin i18n via `vi.mock('react-i18next')` with fixed `t` keys (see `Badge.test.tsx`, `AlertModal.test.tsx`)
- Keep behavioral Testing Library assertions; snapshots complement them
- Review `.snap` diffs in the PR; update snaps intentionally with the UI change
- Do **not** snapshot: full pages, `ReadingMode/**`, Auth gates, async loaders (`EntityPickerModal`), dates/random

## Naming convention

```typescript
describe('filterGlossaryForChunk', () => {
  it('excludes location when name is absent from chunk text', () => { ... });
});
```

Bad: `it('test1')`, `it('works')`, `it('filterGlossaryForChunk')`

## When adding a new test file

1. Place next to source module (or under `tests/` for integration/contract/e2e)
2. Pick closest exemplar from table above
3. Run focused vitest / `npm run test:component` / `npm run test:integration`
4. Ensure `npm run test` passes before push

## E2E (Wave 10 — blocked)

Playwright with API interception (mock) or live test stack:

```typescript
await page.route('**/api/**', (route) =>
  route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) })
);
```

Prerequisite: dedicated test environment. See `tests/e2e/README.md` and `@docs/05-plans/testing-strategy.md`.
