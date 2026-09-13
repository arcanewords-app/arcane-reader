---
type: plan
status: archived
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# @axiomhq/js 1 → 2 (completed)

**Completed** 2026-09-13 — `@axiomhq/js@^2.0.0` in the same PR as [[05-plans/web-vitals-6-upgrade]] (unrelated surfaces). Owner: Backend (logging). Live Axiom shipping not run.

Ctor `token` / `url` / `edge` / `onError`, batched `ingest`, and `flush` are unchanged. APL query format default does not affect us.

## Checklist

- [x] Read `@axiomhq/js` 2 changelog (client ctor, ingest, flush, EU region)
- [x] Bump `@axiomhq/js`; `npm install --no-workspaces`
- [x] `npm run lint:all && npm run test && npm run build`
- [x] Smoke: unit `src/logger.test.ts`; live `LOG_SHIPPING=1` skipped
- [x] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/observability-axiom]]
- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
