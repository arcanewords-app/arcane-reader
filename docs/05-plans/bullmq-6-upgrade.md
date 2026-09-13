---
type: plan
status: active
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# bullmq 5 → 6

**Do not combine** with [[05-plans/ioredis-6-upgrade]] (separate PR). Owner: Backend agent.

| | |
| --- | --- |
| Current | `bullmq@^5.81.5` |
| Target | `bullmq@^6` |
| Code | `src/services/chapterQueue.ts`, `src/services/chapterWorker.ts`, `src/worker.ts` |

## Blockers

None known. Re-read BullMQ 6 migration notes at implement time (queue options, job types, Redis connection shape).

## Checklist

- [ ] Read BullMQ 6 breaking changes
- [ ] Bump only `bullmq`; `npm install --no-workspaces`
- [ ] `npm run lint:all && npm run test && npm run test:integration && npm run build`
- [ ] Smoke: `npm run dev:full` — enqueue analysis + translate job, worker completes
- [ ] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
- [[_canonical/rules/routing]] (async job 503 when Redis missing)
