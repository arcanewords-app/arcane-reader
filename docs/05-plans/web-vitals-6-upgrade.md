---
type: plan
status: archived
domain: client
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# web-vitals 5 → 6 (completed)

**Completed** 2026-09-13 — `web-vitals@^6.2.1` in the same PR as [[05-plans/axiom-js-2-upgrade]] (unrelated surfaces). Owner: UI agent. Live GA4 not run. `reportSoftNavs` not enabled.

`onCLS` / `onINP` / `onLCP` still exported; callback uses SDK `Metric` type.

## Checklist

- [x] Read web-vitals 6 changelog
- [x] Bump `web-vitals`; `npm install --no-workspaces`
- [x] `npm run lint:all && npm run test && npm run test:component && npm run build`
- [x] Smoke: `analytics.test.ts` (`initWebVitals` registers handlers); live gtag skipped
- [x] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[03-explanation/analytics-ga4]]
- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
