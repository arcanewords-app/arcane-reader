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
| [[05-plans/openai-7-upgrade]] | `openai` 6 → 7 | engine | P2 |
| [[05-plans/bullmq-6-upgrade]] | `bullmq` 5 → 6 | backend | P2 |
| [[05-plans/ioredis-6-upgrade]] | `ioredis` 5 → 6 | backend | P2 — **not** same PR as BullMQ 6 |
| [[05-plans/axiom-js-2-upgrade]] | `@axiomhq/js` 1 → 2 | infra | P2 |
| [[05-plans/vercel-node-13-upgrade]] | `@vercel/node` 5 → 13 | infra | P2 |
| [[05-plans/vitest-5-upgrade]] | `vitest` 4.0.8 → 5 | testing | P2 (pin; optional 4.1.11 first) |
| [[05-plans/web-vitals-6-upgrade]] | `web-vitals` 5 → 6 | client | P2 |
| [[05-plans/types-node-26-upgrade]] | `@types/node` 24 → 26 | infra | **P4 blocked** until Node 26 LTS |

Not majors (leave in monthly outdated triage): `@playwright/test` 1.63, `supabase` CLI 2.117.

Stryker 9 → 10 shipped 2026-09-13 (`@stryker-mutator/core` + `vitest-runner` 10). Keep `tsconfig.json` in `stryker.conf.json` `ignorePatterns` until [stryker-js#6111](https://github.com/stryker-mutator/stryker-js/issues/6111).

## References

- Baseline: [[02-how-to/dependency-audit-baseline]]
- Human runbook: [[02-how-to/dependency-maintenance]]
