---
type: plan
status: active
domain: client
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# web-vitals 5 → 6

**Do not combine** with other majors. Owner: UI agent.

| | |
| --- | --- |
| Current | `web-vitals@^5.3.0` |
| Target | `web-vitals@^6` |
| Code | `src/client/utils/analytics.ts` (`onCLS`, `onINP`, `onLCP` → GA4) |

## Blockers

None. Confirm v6 still exports `onCLS` / `onINP` / `onLCP` (or map to new names) and metric payload shape (`name`, `value`, `id`, `delta`).

## Checklist

- [ ] Read web-vitals 6 changelog
- [ ] Bump only `web-vitals`; `npm install --no-workspaces`
- [ ] `npm run lint:all && npm run test && npm run test:component && npm run build`
- [ ] Smoke: client build; `initWebVitals` still no-ops without `gtag`
- [ ] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[03-explanation/analytics-ga4]]
- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
