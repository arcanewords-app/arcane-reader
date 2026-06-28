# Dependency maintenance (human runbook)

Agent/skill SSOT: [`.cursor/skills/dependency-maintenance/SKILL.md`](../../.cursor/skills/dependency-maintenance/SKILL.md), utility agent [`.cursor/agents/dependency-audit.md`](../../.cursor/agents/dependency-audit.md).

No Dependabot/Renovate — triage via agent or manual cadence.

## Cadence

- **Monthly:** `npm run audit:prod`, `npm run deps:outdated`, batch P3 patch/minor
- **On advisory:** prod high/critical → within 1–3 days
- **After Node LTS change:** sync `.nvmrc`, `engines.node`, `@types/node`, Vercel Dashboard, worker host

## Quick commands

```bash
npm run audit:prod      # production vulnerabilities (P0)
npm run audit:all       # full tree including dev
npm run deps:outdated   # major vs minor
npm run lint:all        # gate before merge
npm run build
```

Avoid `npm audit fix --force` unless you accept breaking major jumps.

## Node version

| File                          | Current |
| ----------------------------- | ------- |
| `.nvmrc`                      | `24`    |
| `package.json` `engines.node` | `24.x`  |

See [run-locally.md](./run-locally.md) for `nvm use`.

## Express

Runtime **5.x** with route validation in `src/api/validateRoute.ts`. Migration archived: [`docs/05-plans/express-5-migration.md`](../05-plans/express-5-migration.md).

## Baseline

Before/after comparison: [dependency-audit-baseline.md](./dependency-audit-baseline.md) (2026-06-28).
