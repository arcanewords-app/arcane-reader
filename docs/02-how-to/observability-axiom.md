---
type: how-to
status: active
domain: meta
stale: false
created: 2026-06-06
updated: 2026-06-06
canonical: .cursor/rules/logging.mdc
---

# How to set up Axiom for production logs

Two-tier observability:

| Tier           | Tool             | When                                       |
| -------------- | ---------------- | ------------------------------------------ |
| Local dev      | `/debug` console | Translation debugging, LLM/HTTP capture    |
| Prod / staging | Axiom            | Incidents, retention, alerts, API + worker |

See [[debug-translation]] for local `/debug`. This guide covers Axiom setup and ops.

---

## 1. Axiom account (your action)

1. Sign up at [axiom.co](https://axiom.co) (free tier: ~500 GB/mo ingest, 30-day retention).
2. Create two datasets:
   - `arcane-prod` — production API + worker
   - `arcane-staging` — Vercel Preview deployments
3. Create an **API token** with **Ingest** permission on both datasets.
4. Store the token in your password manager — **never commit** to the repo.
5. Note your org **region** (EU vs US). EU datasets require `AXIOM_REGION=eu` on Vercel (see §2).

---

## 2. Vercel environment variables (your action)

Project Settings → Environment Variables:

| Variable        | Production     | Preview          | Development |
| --------------- | -------------- | ---------------- | ----------- |
| `LOG_SHIPPING`  | `1` or `true`  | `1` or `true`    | leave unset |
| `AXIOM_TOKEN`   | ingest token   | same or separate | leave unset |
| `AXIOM_DATASET` | `arcane-prod`  | `arcane-staging` | leave unset |
| `AXIOM_REGION`  | `eu` if EU org | same             | leave unset |
| `LOG_LEVEL`     | `info`         | `info`           | —           |

Optional overrides (instead of `AXIOM_REGION`):

| Variable     | Example                          |
| ------------ | -------------------------------- |
| `AXIOM_URL`  | `https://api.eu.axiom.co`        |
| `AXIOM_EDGE` | `eu-central-1.aws.edge.axiom.co` |

Both `LOG_SHIPPING=1` and `LOG_SHIPPING=true` are accepted. Redeploy after adding variables.

**Post-deploy check:** `GET /api/status` → `logging.shippingEnabled: true`, `logging.dataset`, `logging.transport: "multistream-main-thread"`.

---

## 3. Worker host (your action)

On Railway / Fly / VPS where `npm run start:worker` runs:

```bash
LOG_SHIPPING=1
AXIOM_TOKEN=xaat-...
AXIOM_DATASET=arcane-prod
AXIOM_REGION=eu          # if datasets are in EU
LOG_LEVEL=info
NODE_ENV=production
```

Worker logs include `service=worker` and `event=worker.started` on boot.

---

## 4. Smoke test (your action)

After Preview deploy with staging env:

1. Open Axiom → dataset `arcane-staging` → **Live tail**.
2. Hit `GET https://<preview-url>/api/health` — expect `http.request` with `service=api`, `env=preview`.
3. Run a translation and correlate logs:

   **Sync translate** (default single-chapter): response JSON includes `traceId`. Query:

   ```kusto
   ['arcane-staging']
   | where traceId == "<paste-trace-id>"
   | sort by _time asc
   ```

   **Async batch** (`?async=1` or `Prefer: respond-async`): `202` response includes **`jobId`** only (e.g. `trl_...`), not `traceId`. Query:

   ```kusto
   ['arcane-staging']
   | where jobId == "<paste-job-id>"
   | sort by _time asc
   ```

4. If async job + worker: worker lines share the same `jobId` / `traceId` with `service=worker`.

Repeat on production with `arcane-prod` before enabling monitors.

---

## 5. Testing shipping locally (optional)

Axiom shipping runs **only** when `NODE_ENV=production`. Local `npm run dev` with `LOG_SHIPPING=1` in `.env` does **not** ship to Axiom.

**Quick script** (uses `.env` for token):

```bash
AXIOM_REGION=eu npx tsx scripts/smoke-axiom-logger.ts
```

Then query Axiom for `event == "smoke.test"`.

**Full server:**

```bash
LOG_SHIPPING=1 AXIOM_TOKEN=... AXIOM_DATASET=arcane-staging AXIOM_REGION=eu NODE_ENV=production npm run start
```

Use a staging dataset, not prod. Hit `GET /api/health` and check Axiom Live tail.

---

## 6. Vercel serverless transport

Arcane uses **main-thread** `pino.multistream` + `@axiomhq/js` ingest (not `pino.transport` worker threads). This avoids bundling/resolution failures on Vercel.

- Stdout → Vercel Logs (fallback)
- Axiom stream → batched ingest; **`flushLogs()`** on each HTTP response (`finish`/`close`) so logs are not lost when the function freezes
- Boot line: `event=logger.initialized` confirms env + transport mode

---

## 7. Saved APL queries (your action)

Save these in Axiom Console for incident response:

**By traceId:**

```kusto
['arcane-prod']
| where traceId == "<uuid>"
| sort by _time asc
```

**By requestId (client header `X-Request-Id`):**

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

**Logger boot / smoke:**

```kusto
['arcane-prod']
| where event == "logger.initialized" or event == "http.request"
| sort by _time desc
| take 20
```

---

## Agent debugging (Cursor)

For AI-assisted prod/staging investigation in Cursor, connect the official Axiom MCP Server — see [[axiom-mcp]]. Agents use `@.cursor/skills/axiom-mcp/SKILL.md` with the same correlation fields and APL patterns as §7 above (`traceId`, `jobId`, `requestId`).

Setup: `.cursor/agents/axiom-mcp-setup.md`. Ingest token on Vercel is not sufficient for MCP — use OAuth or a Query-scoped token.

---

## 8. Monitors (optional v1, your action)

In Axiom → Monitors:

1. **Error spike:** `level == "error"` count > threshold in 5 minutes → Slack/email.
2. **Worker silent:** no logs where `service == "worker"` for 15+ minutes (adjust if worker is idle).

Start with one monitor; avoid alert fatigue.

---

## Log fields reference

Every log line includes base fields (dev and prod):

| Field                    | Example                                | Notes                        |
| ------------------------ | -------------------------------------- | ---------------------------- |
| `service`                | `api`, `worker`                        | Low cardinality              |
| `env`                    | `production`, `preview`, `development` | `VERCEL_ENV` or `ARCANE_ENV` |
| `version`                | `a1b2c3d` or `local`                   | Git sha on Vercel            |
| `requestId`              | UUID                                   | HTTP requests                |
| `traceId`                | UUID                                   | Translation runs             |
| `jobId`                  | `trl_...`                              | Async BullMQ jobs            |
| `chapterId`, `projectId` | UUID                                   | When in context              |
| `event`                  | `translation.completed`                | Structured events            |
| `level`                  | `info`, `error`                        | Pino level                   |

---

## What stays local only

Do **not** enable in production:

- `DEBUG_CAPTURE_LLM`, `DEBUG_CAPTURE_HTTP`
- `/debug` routes (disabled when `NODE_ENV=production`)
- `LOG_LEVEL=debug` as permanent setting

---

## Troubleshooting

| Symptom                              | Check                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| No logs in Axiom                     | `LOG_SHIPPING=1`, token, dataset; redeploy; `GET /api/status` → `logging`                                                         |
| Only Vercel Logs                     | Missing `AXIOM_TOKEN` or `AXIOM_DATASET` — app falls back to stdout                                                               |
| Region mismatch in Vercel Logs       | `[logger] Axiom ingest error: ingest is only allowed into datasets in the primary region` — add `AXIOM_REGION=eu` or `AXIOM_EDGE` |
| EU org, US default endpoint          | Set `AXIOM_REGION=eu` on Vercel **and** worker host                                                                               |
| Logs in dev `.env` not in Axiom      | Expected: shipping requires `NODE_ENV=production`                                                                                 |
| Preview logs in prod dataset         | Wrong `AXIOM_DATASET` on Preview env                                                                                              |
| Worker missing                       | Worker host env not set; check `service=worker` filter                                                                            |
| Transport error on Vercel            | Old `pino.transport` worker threads — use current `multistream-main-thread` build                                                 |
| Logs after response but not in Axiom | Missing flush before freeze — ensure latest `requestContext` with `flushLogs()`                                                   |

---

## Related

- ADR: [[../04-decisions/adr-observability-axiom]]
- Agent MCP setup: [[axiom-mcp]]
- Local debug: [[debug-translation]]
- Env vars: `env.example.txt`, `.cursor/rules/deployment.mdc`
- Smoke script: `scripts/smoke-axiom-logger.ts`
