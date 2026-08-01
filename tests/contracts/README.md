# Contract tests (Wave 9)

**Status:** stub infrastructure. Phase 1 uses Zod fixtures inside the monolith; no Pact broker yet.

## Goal

Freeze request/response and shared-type boundaries so a future service split does not silently break the SPA ↔ API contract.

## Phase 1 (monolith)

| Contract             | Mechanism                                                             | Location                                           |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| API request/response | Zod schemas as SSOT + fixture `safeParse`                             | `tests/contracts/api/*.contract.test.ts`           |
| Shared types         | Round-trip fixtures for `src/shared/**` shapes                        | `tests/contracts/shared/*.contract.test.ts`        |
| Client ↔ server      | Shared JSON fixtures parsed by client domain types and server schemas | `tests/contracts/client-server/*.contract.test.ts` |

Fixtures: `tests/contracts/fixtures/*.json`.

## Phase 2 (after service split)

- OpenAPI generated from Zod (or hand-maintained `docs/01-reference/openapi.yaml`)
- Optional Pact / schema diff in CI

## Run

```bash
npm run test:contract
```

## Policy

- Prefer fixtures that match production Zod schemas in `src/api/schemas/`
- Do not hit live Supabase or OpenAI
- See [docs/05-plans/testing-strategy.md](../../docs/05-plans/testing-strategy.md)
