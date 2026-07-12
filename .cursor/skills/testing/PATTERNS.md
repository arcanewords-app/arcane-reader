# Testing Patterns (Arcane Reader)

Exemplar tests in this repo — match these patterns before inventing new ones.

## APP_SCOPE

Unit tests, coverage, and Stryker mutation share the same scope:

- `src/**/*.ts` minus `*.test.ts`, `src/debug-app/**`, `src/prompt-lab-app/**`
- Includes backend + client SPA (~277 source files)

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

Do **not** spin up full Express app in unit tests — extract testable helpers first.

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

## Services — language pair

**Exemplar:** `@src/services/languagePair.test.ts`

- `mockProject()` factory
- `getAgentForProject` cache key includes language pair (`clearAgentCache` in `afterEach`)
- `isProjectLanguagePairLocked` rules

## Editing prompts

**Exemplar:** `@src/engine/prompts/editing-prompt-combos.test.ts`

- Assert system prompt structure per preset/focus combo
- No `console.log` in committed tests — use assertions only

## Naming convention

```typescript
describe('filterGlossaryForChunk', () => {
  it('excludes location when name is absent from chunk text', () => { ... });
});
```

Bad: `it('test1')`, `it('works')`, `it('filterGlossaryForChunk')`

## When adding a new test file

1. Place next to source module
2. Pick closest exemplar from table above
3. Run `npx vitest run path/to/new.test.ts`
4. Ensure `npm run test` passes before push

## Future (Q4 2026+): mocked integration patterns

**Not in Q3 scope.** No exemplar files yet — add when first implemented in Q4. All patterns remain mock-first until dedicated test environment exists.

### Mocked supertest routes

```typescript
import { vi } from 'vitest';

vi.mock('../services/supabaseDatabase.js', () => ({
  getChapter: vi.fn().mockResolvedValue({ id: 'ch-1', title: 'Test' }),
}));

// import app after mocks; use supertest against Express app with mocked services
```

### Testing Library + mocked API

```typescript
import { vi } from 'vitest';

vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ chapters: [] }),
  })
);

// render hook/component with @testing-library/preact + jsdom
```

### Playwright with API interception

```typescript
await page.route('**/api/**', (route) =>
  route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) })
);
```

**Future prerequisite:** dedicated test environment — only then consider live full-stack E2E; document decision in `testing-baseline.md`.
