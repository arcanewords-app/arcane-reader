---
type: plan
status: active
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# @types/node 24 → 26 (P4, blocked)

**Blocked** until Node **26 LTS** is the runtime. Do not bump `@types/node` alone.

| | |
| --- | --- |
| Current | `@types/node@^24.13.4`, `.nvmrc` `24`, `engines.node` `24.x` |
| Target | Node 26 + `@types/node@^26` |

## SSOT trio (one PR)

When the major changes, update **all** in the same PR:

1. `.nvmrc`
2. `package.json` `engines.node`
3. `@types/node`

Also sync: [[02-how-to/run-locally]], `.cursor/skills/local-dev/SKILL.md`, [[_canonical/rules/deployment]], Vercel Dashboard Node version, worker host.

**Blocker:** `.nvmrc` major ≠ `engines.node` major.

## Checklist (when Node 26 LTS exists)

- [ ] Confirm Node 26 is LTS and Vercel supports it
- [ ] Update trio + docs + Vercel + worker
- [ ] `npm run lint:all && npm run test && npm run build`
- [ ] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
