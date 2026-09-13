---
type: plan
status: active
domain: infra
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# Dependency major-upgrade backlog

Index of deferred **major** npm bumps. Patch/minor land in the monthly P3 wave. **One major per PR** — see [`.cursor/skills/dependency-maintenance/SKILL.md`](../../.cursor/skills/dependency-maintenance/SKILL.md).

Do **not** run `npm audit fix --force` (it may downgrade `@vercel/node`).

## Rule

| Rule | Why |
| ---- | --- |
| One major per PR | Isolates rollback |
| Domain smoke after P2 | Engine / API / Backend / UI / Deploy table in the skill |
| Node SSOT trio | `.nvmrc` + `engines.node` + `@types/node` stay the same major |

## Deferred majors

| Plan | Current → target | Domain | Priority |
| ---- | ---------------- | ------ | -------- |
| [[05-plans/vitest-5-upgrade]] | `vitest` 4.0.8 → 5 | testing | P2 (pin; optional 4.1.11 first) |
| [[05-plans/types-node-26-upgrade]] | `@types/node` 24 → 26 | infra | **P4 blocked** until Node 26 LTS |

Not majors (leave in monthly outdated triage): `@playwright/test` 1.63, `supabase` CLI 2.117.

`@vercel/node` 5 → 13 shipped 2026-09-13 (`@vercel/node@^13.0.0`, `@vercel/functions@^3.9.7`; waitUntil + `supportsCancellation` on `api/index.ts`). Preview smoke still needed after merge. Archived: [[05-plans/vercel-node-13-upgrade]].

ioredis 5 → 6 shipped 2026-09-13 (`ioredis@^6.0.0`; debug Redis bridge only). Archived: [[05-plans/ioredis-6-upgrade]].

BullMQ 5 → 6 shipped 2026-09-13 (`bullmq@^6.3.4`). Archived: [[05-plans/bullmq-6-upgrade]].

`@axiomhq/js` 1 → 2 + `web-vitals` 5 → 6 shipped together 2026-09-13 (unrelated surfaces). Archived: [[05-plans/axiom-js-2-upgrade]], [[05-plans/web-vitals-6-upgrade]].

OpenAI 6 → 7 shipped 2026-09-13 (`openai@^7.15.0`). Archived: [[05-plans/openai-7-upgrade]].

Stryker 9 → 10 shipped 2026-09-13 (`@stryker-mutator/core` + `vitest-runner` 10). Keep `tsconfig.json` in `stryker.conf.json` `ignorePatterns` until [stryker-js#6111](https://github.com/stryker-mutator/stryker-js/issues/6111).

## References

- Baseline: [[02-how-to/dependency-audit-baseline]]
- Human runbook: [[02-how-to/dependency-maintenance]]
