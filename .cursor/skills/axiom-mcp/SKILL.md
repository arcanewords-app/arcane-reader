---
name: axiom-mcp
description: Query Arcane Reader prod/staging logs in Axiom via official MCP (traceId, jobId, requestId). Use for production incidents, not local /debug.
---

# Axiom MCP (prod/staging debug)

Query production and staging logs through the **official Axiom MCP Server** at `https://mcp.axiom.co/mcp`. Do not build or run a custom MCP server.

Setup: `@.cursor/agents/axiom-mcp-setup.md` and `@docs/02-how-to/axiom-mcp.md`.

## Prerequisites

1. Cursor MCP server `axiom` connected in `~/.cursor/mcp.json` (OAuth on first use, or see setup agent for `mcp-remote` fallback).
2. Axiom datasets exist: `arcane-prod`, `arcane-staging` (see `@docs/02-how-to/observability-axiom.md`).
3. **Query access** — ingest token on Vercel (`xaat-...`, Ingest only) does **not** work for MCP. Use OAuth or a separate API token with **Query** permission.

If MCP is unavailable, tell the user to run setup agent `axiom-mcp-setup` and reload Cursor (Settings → MCP).

## When to use

| Scenario                                      | Tool                                              |
| --------------------------------------------- | ------------------------------------------------- |
| Prod/staging incident, error spike            | Axiom MCP                                         |
| Find logs by `traceId`, `jobId`, `requestId`  | Axiom MCP                                         |
| Worker silent, HTTP 503, translation failures | Axiom MCP                                         |
| Local translation debug, LLM/HTTP capture     | `/debug` — `@docs/02-how-to/debug-translation.md` |

## MCP tools

- Cursor config key: `axiom` in `mcp.json`
- MCP invoke server id: `user-axiom` (see `mcps/user-axiom/` after connect)

Read tool schemas under `mcps/user-axiom/tools/*.json` before calling.

| Tool                                 | Use                                            |
| ------------------------------------ | ---------------------------------------------- |
| `queryApl`                           | **Primary** — run APL against a dataset        |
| `listDatasets`                       | Confirm `arcane-prod` / `arcane-staging` exist |
| `getDatasetSchema`                   | Discover fields when exploring unknown errors  |
| `getSavedQueries`                    | Reuse queries saved in Axiom Console           |
| `getMonitors` / `getMonitorsHistory` | Alert context during incidents                 |

Built-in MCP prompts (anomaly detection, monitor health, etc.) are optional — prefer Arcane-specific APL below when correlating by `traceId` / `jobId`.

## Datasets

| Environment              | Dataset          | `env` field in logs |
| ------------------------ | ---------------- | ------------------- |
| Production               | `arcane-prod`    | `production`        |
| Vercel Preview / staging | `arcane-staging` | `preview`           |

When unsure, ask the user or filter: `| where env == "production"` vs `| where env == "preview"`.

## Correlation fields

From `@.cursor/rules/logging.mdc` — use in APL `where` clauses:

| Field                    | Example                 | Notes                                 |
| ------------------------ | ----------------------- | ------------------------------------- |
| `traceId`                | UUID                    | Sync translate — in API response JSON |
| `jobId`                  | `trl_...`               | Async batch — in `202` response only  |
| `requestId`              | UUID                    | HTTP header `X-Request-Id`            |
| `chapterId`, `projectId` | UUID                    | When in context                       |
| `service`                | `api`, `worker`         | Cross-process correlation             |
| `event`                  | `translation.completed` | Structured events                     |
| `level`                  | `info`, `error`         | Pino level                            |

## Agent workflow

1. **Pick dataset** — prod vs staging (see table above).
2. **Get identifier** — from user, API response (`traceId` in sync JSON, `jobId` in async `202`), or `X-Request-Id`.
3. **Run `queryApl`** with `| sort by _time asc` for a timeline.
4. **Async jobs** — query by `jobId`; expect `service=api` (enqueue) and `service=worker` (execution) on the same id.
5. **Empty results** — widen time range in the tool if supported; verify dataset name; check logs are shipping (`LOG_SHIPPING=1` on deploy).

## Ready-made APL (replace dataset and id)

**By traceId (sync translate):**

```kusto
['arcane-prod']
| where traceId == "<uuid>"
| sort by _time asc
```

**By requestId:**

```kusto
['arcane-prod']
| where requestId == "<uuid>"
| sort by _time asc
```

**By async jobId:**

```kusto
['arcane-prod']
| where jobId == "<trl_...>"
| sort by _time asc
```

**Translation / pipeline errors:**

```kusto
['arcane-prod']
| where level == "error"
| where event startswith "translation" or event startswith "pipeline" or isnotempty(jobId)
| sort by _time desc
| take 100
```

**HTTP 503 (service health):**

```kusto
['arcane-prod']
| where event == "http.request" and statusCode == 503
| sort by _time desc
| take 50
```

**Worker activity:**

```kusto
['arcane-prod']
| where service == "worker"
| sort by _time desc
| take 100
```

For staging, replace `arcane-prod` with `arcane-staging`.

Full runbook and smoke tests: `@docs/02-how-to/observability-axiom.md`.

## Security

- Never commit Axiom tokens to the repo or vault notes.
- Ingest token (`AXIOM_TOKEN` on Vercel) ≠ query token for MCP.
- MCP tools are read-only; agents cannot modify datasets or monitors.

## Related

- Setup: `@.cursor/agents/axiom-mcp-setup.md`
- Human how-to: `@docs/02-how-to/axiom-mcp.md`
- Log shipping runbook: `@docs/02-how-to/observability-axiom.md`
- Local debug: `@docs/02-how-to/debug-translation.md`
- Official Axiom MCP docs: https://axiom.co/docs/console/intelligence/mcp-server
