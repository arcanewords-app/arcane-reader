---
type: plan
status: archived
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# ioredis 5 → 6 (completed)

**Completed** 2026-09-13 — `ioredis@^6.0.0`. Owner: Backend agent. Live `dev:full` debug-bridge smoke skipped.

Direct consumer is **only** `src/debug/redisBridge.ts` (`new Redis(url, { maxRetriesPerRequest: null })`). Cache and job stores stay on Upstash REST (`@upstash/redis`). BullMQ was not bumped; its optional peer `ioredis >=5` now resolves to the same 6.0.0 (no nested 5.x copy). Defaults kept: RESP3 + legacy reply shapes; HELLO 3 falls back to RESP2.

## Checklist

- [x] Read ioredis 6 changelog / v5→v6 wiki
- [x] Bump only `ioredis`; `npm install --no-workspaces --engine-strict=false`
- [x] `npm run lint:all && npm run test && npm run test:integration && npm run build`
- [x] Smoke: unit + integration; live worker/debug bridge skipped
- [x] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
- [[_canonical/rules/cache]]
