---
type: plan
status: archived
domain: api
stale: false
created: 2026-06-28
updated: 2026-06-28
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# Express 5 migration (completed)

## Status

**Completed** 2026-06-28 — runtime `express@5.x`, `@types/express@5`, types-first migration on modular routers.

## Done

- [x] `src/api/validateRoute.ts` boundary layer + tests
- [x] Routers extracted under `src/api/routes/`; `server.ts` ~964 lines
- [x] `@types/express@5`, pin script removed
- [x] `express@5` runtime; SPA fallback `app.get('/{*splat}')`
- [x] `Express.Request` augmentation in `src/types/express.d.ts` (global namespace)
- [x] `npm run typecheck && npm run build` green

## References

- Baseline: `docs/02-how-to/dependency-audit-baseline.md` (Express types trial summary)
- Helpers: `src/shared/expressRouteParams.ts`, `src/shared/multerCompat.ts`
