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

**Hook exemplar:** `@src/client/hooks/useUserRole.hook.test.ts`, `useReadingHistory.hook.test.ts`

```typescript
// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/preact';
import { vi } from 'vitest';

vi.mock('../services/authService.js', () => ({
  authService: { getCachedUser: vi.fn(), getCurrentUser: vi.fn() },
  AUTH_CHANGED_EVENT: 'arcane:auth-changed',
  USER_UPDATED_EVENT: 'arcane:user-updated',
}));
```

Mock `fetch` for API-backed hooks:

```typescript
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [] }),
  })
);
```

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

**Exemplar:** `@tests/integration/api/status.test.ts`

- Use `createApp()` from `@src/createApp.ts` (no `listen`)
- Mock external boundaries **before** importing `createApp` when the route hits DB/Redis
- Prefer public routes (`/api/status`) or validation 400 paths for first smoke

```typescript
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/createApp.js';

describe('GET /api/status', () => {
  it('returns version and storage shape', async () => {
    const { app } = createApp();
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: '0.1.0', storage: 'supabase' });
  });
});
```

Live Supabase integration: `tests/integration/supabase/README.md` — blocked until test env.

## Contract (Wave 9 stub)

Fixtures under `tests/contracts/fixtures/` + Zod `safeParse` round-trips. See `tests/contracts/README.md`.

## Snapshot (Wave 8)

Vitest `toMatchSnapshot()` only for presentational components without dates/random. Review diffs in PR. Do not snapshot `ReadingMode` or async pages.

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
