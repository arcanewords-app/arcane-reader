---
type: plan
status: archived
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# bullmq 5 → 6 (completed)

**Completed** 2026-09-13 — `bullmq@^6.3.4`. Direct `ioredis@^5.11.1` unchanged (not the same PR). Owner: Backend agent. Live `dev:full` enqueue skipped.

No repeat/debounce/FlowProducer usage; Redis repeatable-job metadata migration not required. `connection` remains Redis options (`satisfies ConnectionOptions`).

## Checklist

- [x] Read BullMQ 6 breaking changes
- [x] Bump only `bullmq`; `npm install --no-workspaces`
- [x] `npm run lint:all && npm run test && npm run test:integration && npm run build`
- [x] Smoke: unit `chapterQueue` / `chapterWorker`; live worker skipped
- [x] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
- [[_canonical/rules/routing]] (async job 503 when Redis missing)
