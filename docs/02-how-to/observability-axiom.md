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

---

## 2. Vercel environment variables (your action)

Project Settings → Environment Variables:

| Variable        | Production    | Preview          | Development |
| --------------- | ------------- | ---------------- | ----------- |
| `LOG_SHIPPING`  | `1`           | `1`              | leave unset |
| `AXIOM_TOKEN`   | ingest token  | same or separate | leave unset |
| `AXIOM_DATASET` | `arcane-prod` | `arcane-staging` | leave unset |
| `LOG_LEVEL`     | `info`        | `info`           | —           |

Redeploy after adding variables.

---

## 3. Worker host (your action)

On Railway / Fly / VPS where `npm run start:worker` runs:

```bash
LOG_SHIPPING=1
AXIOM_TOKEN=xaat-...
AXIOM_DATASET=arcane-prod
LOG_LEVEL=info
NODE_ENV=production
```

Worker logs include `service=worker` and `event=worker.started` on boot.

---

## 4. Smoke test (your action)

After Preview deploy with staging env:

1. Open Axiom → dataset `arcane-staging` → **Live tail**.
2. Hit `GET https://<preview-url>/api/health` — expect `http.request` with `service=api`, `env=preview`.
3. Run a translation — copy `traceId` from response or Vercel Logs.
4. In Axiom Query:

```kusto
['arcane-staging']
| where traceId == "<paste-trace-id>"
| sort by _time asc
```

5. If async job + worker: same `traceId` or `jobId` should appear with `service=worker`.

Repeat on production with `arcane-prod` before enabling monitors.

---

## 5. Saved APL queries (your action)

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

**Translation errors:**

```kusto
['arcane-prod']
| where level == "error" and (event startswith "pipeline" or event startswith "translation")
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

---

## 6. Monitors (optional v1, your action)

In Axiom → Monitors:

1. **Error spike:** `level == "error"` count > threshold in 5 minutes → Slack/email.
2. **Worker silent:** no logs where `service == "worker"` for 15+ minutes (adjust if worker is idle).

Start with one monitor; avoid alert fatigue.

---

## Log fields reference

Every production log line includes:

| Field                    | Example                 | Notes                             |
| ------------------------ | ----------------------- | --------------------------------- |
| `service`                | `api`, `worker`         | Low cardinality                   |
| `env`                    | `production`, `preview` | From `VERCEL_ENV` or `ARCANE_ENV` |
| `version`                | `a1b2c3d`               | Git sha on Vercel                 |
| `requestId`              | UUID                    | HTTP requests                     |
| `traceId`                | UUID                    | Translation runs                  |
| `jobId`                  | UUID                    | Async BullMQ jobs                 |
| `chapterId`, `projectId` | UUID                    | When in context                   |
| `event`                  | `translation.completed` | Structured events                 |
| `level`                  | `info`, `error`         | Pino level                        |

---

## What stays local only

Do **not** enable in production:

- `DEBUG_CAPTURE_LLM`, `DEBUG_CAPTURE_HTTP`
- `/debug` routes (disabled when `NODE_ENV=production`)
- `LOG_LEVEL=debug` as permanent setting

---

## Troubleshooting

| Symptom                      | Check                                                    |
| ---------------------------- | -------------------------------------------------------- |
| No logs in Axiom             | `LOG_SHIPPING=1`, token, dataset name; redeploy          |
| Only Vercel Logs             | Missing `AXIOM_TOKEN` — app falls back to stdout only    |
| Preview logs in prod dataset | Wrong `AXIOM_DATASET` on Preview env                     |
| Worker missing               | Worker host env not set; check `service=worker` filter   |
| Transport error on Vercel    | Ensure `@axiomhq/pino` in dependencies; check build logs |

---

## Related

- ADR: [[../04-decisions/adr-observability-axiom]]
- Local debug: [[debug-translation]]
- Env vars: `env.example.txt`, `.cursor/rules/deployment.mdc`
