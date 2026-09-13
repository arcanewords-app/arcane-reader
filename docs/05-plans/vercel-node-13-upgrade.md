---
type: plan
status: active
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# @vercel/node 5 → 13

**Do not combine** with other majors. **Vercel preview required.** Never `npm audit fix --force` (historically downgrades this package).

| | |
| --- | --- |
| Current | `@vercel/node@^5.10.2` |
| Target | `@vercel/node@^13` |
| Code | `api/index.ts`, `api/robots.ts`, `api/sitemap.ts` (`VercelRequest` / `VercelResponse`) |

## Blockers

Revisit scoped `overrides` in `package.json`:

- `@vercel/node.undici`
- `@vercel/node.path-to-regexp` (must stay **6.x** on the Vercel helper; Express 5 keeps `path-to-regexp@8` via `router`)
- `@vercel/python-analysis` / `@vercel/static-config` chains (`js-yaml`, `smol-toml`, `ajv`, `minimatch`)

Drop overrides only when the new tree is clean on `npm run audit:all` without pulling Express 4 / `path-to-regexp@6` into the API.

## Checklist

- [ ] Read Vercel Node 13 serverless / types changelog
- [ ] Bump `@vercel/node` only; retune overrides; `npm install --no-workspaces`
- [ ] `npm run lint:all && npm run test && npm run build`
- [ ] `npm run audit:prod` still 0; document remaining `audit:all`
- [ ] Smoke: Vercel **preview** — `GET /`, `/catalog`, `/api/health`, `/robots.txt`, `/sitemap.xml`
- [ ] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
- [[_canonical/rules/deployment]]
