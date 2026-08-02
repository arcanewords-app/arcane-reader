# Mock-integration tests

HTTP → middleware → handler → **mocked** DB/LLM/Redis wiring. No live Supabase, Redis, or LLM.

## Run

```bash
npm run test:integration
```

Uses `scripts/test-integration.mjs` (explicit file list — Vitest 4.0.8 + Windows directory/glob entry can fail with “No test suite found”).

Config: `vitest.integration.config.ts`. Live suite excluded: `tests/integration/supabase/**`.

## Layout

| Path                       | Role                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `setup.ts`                 | Strip Redis/Upstash env; dummy `SUPABASE_*` (imported by `createTestApp` / worker tests) |
| `helpers/mockAuth.ts`      | Bearer → `req.user`; role via `X-Test-Role`                                              |
| `helpers/mockSupabase.ts`  | Shared domain `vi.fn` stubs + `resetMocks()`                                             |
| `helpers/createTestApp.ts` | `bootTestApp()` / `getTestApp()` — one `createApp` per file                              |
| `helpers/appFetch.ts`      | Fetch API → supertest for client domain tests                                            |
| `api/`                     | Express route wiring                                                                     |
| `client/`                  | Client API domains against the same app                                                  |
| `worker/`                  | Direct `runTranslateJob` / `runAnalysisJob`                                              |
| `supabase/`                | **Blocked** live suite — see `supabase/README.md`                                        |

## Mock rules

1. `vi.mock` domain modules / auth / redis **before** `bootTestApp()`.
2. Prefer mocking `src/services/supabase/domains/*` (handlers import facade or domains).
3. Keep breaker healthy between tests (`markSupabaseHealthy` in `bootTestApp`).
4. Never call real OpenAI / Upstash / Supabase Auth.

Exemplar: `helpers/createTestApp.ts` + `api/publications.test.ts`.

## Pre-push

`npm run test:integration` runs after unit + component in `.husky/pre-push`.
