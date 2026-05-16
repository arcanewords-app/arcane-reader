---
type: reference
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/architecture.mdc
---

# Rules audit (2026-05-16)

## Summary

| Rule                | Status    | Notes                                                |
| ------------------- | --------- | ---------------------------------------------------- |
| `core.mdc`          | OK        | Matches repo layout                                  |
| `api.mdc`           | Updated   | Routes SSOT → `routing.mdc`                          |
| `cache.mdc`         | OK        | Aligns with `cacheContract.ts`                       |
| `engine.mdc`        | OK        | Matches pipeline in `src/engine/`                    |
| `client.mdc`        | Updated   | Icons/routes → rules, not stale docs                 |
| `design-system.mdc` | Updated   | Icon policy inlined                                  |
| `routing.mdc`       | Rewritten | Full route map from code + former ROUTES.md          |
| `architecture.mdc`  | **New**   | Module map + doc hierarchy                           |
| `auth.mdc`          | **New**   | Roles, middleware, gates                             |
| `deployment.mdc`    | **New**   | Env, Vercel, worker (verified vs code)               |
| `logging.mdc`       | **New**   | Pino policy from `logger.ts` + archive LOGGING_RULES |

## Gaps (future rules, not blocking)

| Topic         | Suggested file                   | Verify against                    |
| ------------- | -------------------------------- | --------------------------------- |
| Import/export | extend `api.mdc` or `engine.mdc` | `src/services/import/`, `export/` |

## Stale doc references removed from rules

- `docs/ROUTES.md` as SSOT → `routing.mdc`
- `docs/ICONS_PLAN.md` → `design-system.mdc` Icons section

## Principle

**Code + `.cursor/rules/` win** over `docs/archive/` legacy files.
