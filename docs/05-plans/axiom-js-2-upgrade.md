---
type: plan
status: active
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# @axiomhq/js 1 → 2

**Do not combine** with other majors. Owner: Backend (logging).

| | |
| --- | --- |
| Current | `@axiomhq/js@^1.7` (installed 1.8.x) |
| Target | `@axiomhq/js@^2` |
| Code | `src/logger.ts` (`Axiom` client, ingest + flush) |

## Blockers

Must not change local `/debug` ring-buffer behaviour. Shipping only when `NODE_ENV=production` and `LOG_SHIPPING=1`.

## Checklist

- [ ] Read `@axiomhq/js` 2 changelog (client ctor, ingest, flush, EU region)
- [ ] Bump only `@axiomhq/js`; `npm install --no-workspaces`
- [ ] `npm run lint:all && npm run test && npm run build`
- [ ] Smoke: local logs still stdout; staging/preview with `LOG_SHIPPING=1` — `GET /api/status` logging block
- [ ] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/observability-axiom]]
- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
