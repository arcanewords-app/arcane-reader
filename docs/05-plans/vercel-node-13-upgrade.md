---
type: plan
status: archived
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# @vercel/node 5 → 13 (completed)

**Completed** 2026-09-13 — `@vercel/node@^13.0.0` + `@vercel/functions@^3.9.7`. Owner: API Agent (primary), Engine Agent (secondary). Live Vercel **preview** not run from this session (no CLI auth).

## What landed

- Scoped overrides kept: `@vercel/node` `undici@6.28.1`, `path-to-regexp@6.3.0`. Express 5 still uses nested `path-to-regexp@8.4.2`. Root TypeScript **7.0.2**.
- `api/robots.ts` / `api/sitemap.ts` write via `statusCode` + `setHeader` + `end` (no `res.send`).
- `waitUntil(flushLogs())` when `VERCEL` is set; local still fire-and-forget.
- `supportsCancellation` only on `api/index.ts`. AbortSignal ALS (`src/shared/invocationAbort.ts`) → OpenAI `create(..., { signal })`. HTTP abort is not a 500 (`499` if headers not sent).

## Checklist

- [x] Read Vercel Node 13 serverless / types changelog
- [x] Bump `@vercel/node` + add `@vercel/functions`; retune overrides; `npm install --no-workspaces --engine-strict=false`
- [x] `npm run lint:all && npm run test && npm run test:integration && npm run build`
- [x] `npm run audit:prod` still 0; `audit:all` still 8 (dev tree)
- [ ] Smoke: Vercel **preview** — `GET /`, `/catalog`, `/api/health`, `/robots.txt`, `/sitemap.xml` (do on first preview after merge)
- [x] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
- [[_canonical/rules/deployment]]
