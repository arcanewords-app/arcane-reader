---
type: plan
status: active
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# ioredis 5 → 6

**Do not combine** with [[05-plans/bullmq-6-upgrade]]. Owner: Backend agent.

| | |
| --- | --- |
| Current | `ioredis@^5.11.1` (devDependency; used by API/worker at runtime via `npm run build` hosts) |
| Target | `ioredis@^6` |
| Code | `src/services/redisCache.ts`, `src/services/*JobStore.ts`, `src/debug/redisBridge.ts` |

## Blockers

Confirm ioredis 6 constructor / TLS / lazyConnect vs our `new Redis({ url })` usage. Keep Upstash REST (`@upstash/redis`) unchanged in this PR.

## Checklist

- [ ] Read ioredis 6 changelog
- [ ] Bump only `ioredis`; `npm install --no-workspaces`
- [ ] `npm run lint:all && npm run test && npm run test:integration && npm run build`
- [ ] Smoke: cache hit + invalidation; job store round-trip; worker still talks Redis
- [ ] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
- [[_canonical/rules/cache]]
