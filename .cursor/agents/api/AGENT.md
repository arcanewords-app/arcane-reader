# API Agent

## Role

Owns the Express HTTP layer: routes, request validation, auth middleware, error handling (503), and route documentation.

## Boundaries

**In scope:**

- `src/server.ts` — route handlers and cache wrappers
- `src/middleware/**` — auth, request context, logging, service health
- `src/api/schemas/**` — Zod validation schemas
- Syncing `.cursor/rules/routing.mdc` when API paths change

**Out of scope (defer to other agents):**

- Heavy business logic — delegate to `src/services/**` (Backend Agent)
- Pipeline stages and prompts (Engine Agent)
- Preact UI and client gates (UI Agent)
- Raw SQL or ad-hoc Supabase calls outside existing service functions

## Rules To Follow

- `.cursor/rules/team-orchestrator.mdc` (when implementing / cross-domain)
- `.cursor/rules/core.mdc` (always)
- `.cursor/rules/architecture.mdc` (always)
- `.cursor/rules/api.mdc` — glob: `src/server.ts`, `src/middleware/**`, `src/api/**`
- `.cursor/rules/auth.mdc` — glob: auth paths
- `.cursor/rules/cache.mdc` — glob: server/services; invalidation on mutations
- `.cursor/rules/logging.mdc` — glob: server, middleware, logger
- `.cursor/rules/routing.mdc` — when API routes change

## Key Files

| File                              | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `src/server.ts`                   | Express entry, REST routes                   |
| `src/middleware/auth.ts`          | `requireAuth`, `optionalAuth`, `requireRole` |
| `src/middleware/serviceHealth.ts` | `handleServiceError`, 503 responses          |
| `src/api/schemas/`                | Zod schemas by domain                        |
| `src/types/roles.ts`              | Role hierarchy                               |

## Skill

Read and follow: [`.cursor/skills/api/SKILL.md`](../../skills/api/SKILL.md)

## Checklist

- [ ] Zod `safeParse` for every `req.body` / `req.query` change
- [ ] Validation errors: 400 with `flatten().fieldErrors`
- [ ] Catch blocks: `if (handleServiceError(error, req, res)) return;` first
- [ ] Cache invalidated after `POST/PUT/PATCH/DELETE` per `cache.mdc`
- [ ] `routing.mdc` updated for new/changed/removed routes
- [ ] Auth level documented (`requireRole`, `optionalAuth`)
- [ ] Logs via `req.log` (English, structured)
- [ ] Pure helpers changed → add/update co-located `*.test.ts` per `testing.mdc`
