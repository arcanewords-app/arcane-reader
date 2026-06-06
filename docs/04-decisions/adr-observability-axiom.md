---
type: adr
status: accepted
domain: meta
stale: false
created: 2026-06-06
updated: 2026-06-06
canonical: .cursor/rules/logging.mdc
supersedes: docs/05-plans/observability-loki.md
---

# ADR: Production observability — Axiom + local /debug

## Status

Accepted (2026-06-06)

## Context

- **Local dev:** `/debug` console (`src/debug/`, `src/debug-app/`) provides translation-specific debugging: trace waterfall, opt-in LLM/HTTP capture, Copy for Cursor. Dev-only, ring buffer, no retention.
- **Production:** API on Vercel; worker on long-lived host. Logs to stdout (Vercel Logs fallback); optional Axiom when `LOG_SHIPPING=1`. Need cross-process search by `traceId` / `requestId` / `jobId`, 30-day retention, optional alerts.
- **Prior plan:** Self-hosted Grafana + Loki on VPS ([[05-plans/observability-loki]]) — higher ops cost for a small team.
- **Stack ready:** Pino JSON logs, `requestContext`, engine `traceId` via `src/debug/context.ts`.

## Decision

1. **Keep `/debug` unchanged** for local development — not replaced in v1.
2. **Production/staging log shipping:** [Axiom](https://axiom.co) via `@axiomhq/js` main-thread multistream in `src/logger.ts`, gated by `LOG_SHIPPING=1`.
3. **Datasets:** `arcane-prod` (production + worker), `arcane-staging` (Vercel Preview).
4. **No Vercel Log Drains** — push from application code (works on Hobby plan).
5. **No self-hosted Loki/Grafana** for v1 — archive prior plan.

## Transport behavior

| Environment                                 | Remote shipping              |
| ------------------------------------------- | ---------------------------- |
| `NODE_ENV !== production`                   | Off — stdout + `/debug` only |
| Production + `LOG_SHIPPING` unset           | stdout → Vercel Logs         |
| Production + `LOG_SHIPPING=1` + Axiom creds | stdout + Axiom async         |

Base log fields: `service` (`api` \| `worker`), `env`, `version`. Correlation: `requestId`, `traceId`, `jobId`, `chapterId`, `projectId` as JSON fields.

## Data policy

**Ship:** structured events, HTTP metadata (`http.request`), errors (no stack in prod), correlation IDs, `userId` (not email).

**Never ship:** LLM/chapter text, `DEBUG_CAPTURE_*` payloads, secrets, `LOG_LEVEL=debug` as default in prod.

## Consequences

- Minimal code change (logger transport only).
- Free tier (~500 GB/mo, 30-day retention) sufficient for current scale.
- Grafana/LogQL dashboards replaced by Axiom APL + monitors (manual setup in console).
- Loki epic Trello cards (#56–#63) superseded; ADR card (#55) resolved.

## See also

- [[02-how-to/observability-axiom]]
- [[02-how-to/debug-translation]]
- `.cursor/rules/logging.mdc`, `.cursor/rules/deployment.mdc`
