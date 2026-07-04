---
type: how-to
status: active
domain: engine
stale: false
created: 2026-05-16
updated: 2026-06-29
canonical: .cursor/rules/engine.mdc
---

# How to debug translation issues

## Local dev vs production

| Environment               | Tool                         | Notes                                                       |
| ------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Local dev (`npm run dev`) | `/debug` console             | LLM/HTTP capture, trace waterfall, Copy for Cursor          |
| Production / staging      | [Axiom](observability-axiom) | Search by `traceId`, `jobId`, `requestId`; 30-day retention |

`/debug` is disabled when `NODE_ENV=production`. For prod incidents use [[observability-axiom]], not Vercel Logs alone.

All log lines (dev and prod) include base fields from `src/logger.ts`: `service` (`api` / `worker`), `env`, `version`. Dev `/debug` logs also show `process: worker` when Redis bridge is active.

## Debug log viewer (local dev)

Dev-only in-memory log UI (not available when `NODE_ENV=production`):

| URL                             | Description                                                          |
| ------------------------------- | -------------------------------------------------------------------- |
| `http://localhost:5174/debug/`  | Debug console (Preact app, primary dev URL)                          |
| `http://localhost:5173/debug`   | Same via main Vite proxy → `:5174`                                   |
| `http://localhost:3000/debug`   | Redirect to debug app (`:5174`)                                      |
| `GET /api/debug/logs`           | JSON log buffer (`?last=2h` default when unscoped; `?newestFirst=1`) |
| `GET /api/debug/query`          | Filtered query (`?kind=`, `?last=`, `?traceId=`, `?compact=1`)       |
| `GET /api/debug/jobs/:jobId`    | Async job aggregate (traces + logs + prompts + HTTP)                 |
| `GET /api/debug/traces`         | Trace summaries (`traceId` / `jobId` / `requestId`)                  |
| `GET /api/debug/traces/:id`     | Entries for one correlation id                                       |
| `GET /api/debug/export`         | Markdown/JSON export (`?format=cursor\|markdown\|json`, `?traceId=`) |
| `GET /api/debug/prompts`        | Opt-in LLM captures (`DEBUG_CAPTURE_LLM=1`)                          |
| `GET /api/debug/http`           | Opt-in HTTP request/response captures (`DEBUG_CAPTURE_HTTP=1`)       |
| `POST /api/debug/clear`         | Clear log buffer                                                     |
| `POST /api/debug/clear-prompts` | Clear prompt captures                                                |
| `POST /api/debug/clear-http`    | Clear HTTP captures                                                  |
| `GET /debug/clear*`             | Legacy redirects (same clears)                                       |

**Buffer:** default 2000 entries (`DEBUG_LOG_MAX_ENTRIES`). Older entries are overwritten (ring buffer).

**Worker logs (`npm run dev:full`):** async jobs run in a separate process. With `REDIS_URL` set, worker **logs, LLM captures, and HTTP captures** are merged into the API buffer with `process: worker` on logs. Without Redis, worker output appears only in the worker terminal. The debug Redis pub/sub bridge uses `ioredis` (a `devDependency`); local dev needs `npm install` with devDependencies, not `npm ci --omit=dev`.

**Correlation:** each translation run gets a `traceId` (UUID). Engine and pipeline logs inherit `traceId`, `projectId`, `chapterId`, and `jobId` (async jobs) via async context. HTTP routes also log `requestId` on `req.log`.

**Copy for Cursor:** use **Copy for Cursor** or **Copy trace** in the UI, or `GET /api/debug/export?format=cursor&traceId=...`.

**Filters:** level, `event`, `process`, `chapterId`, `projectId`, `traceId`, `requestId`, `jobId`, `last` (`30m`–`24h`), `since`/`until`, text search. Unscoped `/api/debug/query` and `/api/debug/logs` default to **last 2 hours**. Duplicate log lines from the worker bridge are deduplicated on ingest.

**Benchmark runs:** record metrics in [[../01-reference/translation-run-log]] — use `traceId` for single-chapter runs.

**HTTP tab:** set `DEBUG_CAPTURE_HTTP=1` in `.env` and restart. Captures truncated JSON request/response for `/api/*` (skips multipart uploads and `/api/debug/*`). Sensitive keys (`password`, `token`, etc.) are redacted. Translate responses include `traceId` for linking to Traces.

**Prompts tab:** set `DEBUG_CAPTURE_LLM=1` in `.env` and restart. Captures truncated system/user/response previews (not full chapter text).

**Traces tab:** unified waterfall with payload, per-row copy, **Copy for Cursor** (logs + HTTP + LLM via `?format=trace`), Copy JSON, Filter logs, Expand all.

**HTTP tab:** per-exchange copy (response / request / all / requestId), **Copy visible**, Copy errors (4xx/5xx), presets (errors, slow >2s), auto-refresh, Open trace, Filter logs.

Implementation: `src/debug/` (buffer, routes, capture, redis bridge) + `src/debug-app/` (Preact UI).

## Query from Cursor agent

Use `@.cursor/skills/debug-local/SKILL.md` — **2-step workflow**:

```bash
curl -s "http://localhost:3000/api/debug/status"
# one chapter (preferred)
curl -s "http://localhost:3000/api/debug/agent/context?traceId=...&includePrompts=0"
# full async batch
curl -s "http://localhost:3000/api/debug/agent/context?jobId=trl_...&includePrompts=1"
# recent activity
curl -s "http://localhost:3000/api/debug/query?kind=logs&last=2h&compact=1&limit=50"
```

- `GET /api/debug/status` — buffer counts, `window` (last 2h stats), last error
- `GET /api/debug/agent/context` — markdown timeline (asc) + code hints; prefer `traceId` for one chapter
- `GET /api/debug/catalog` — translation events, time filter examples
- `GET /api/debug/query?format=agent&traceId=...` — same as agent/context

Async batch: `jobId` returns all chapters; use `traceId` from `translation.completed` for a single chapter.

## Sync vs async

| Mode  | Trigger                               | Where it runs                      |
| ----- | ------------------------------------- | ---------------------------------- |
| Sync  | Default batch/single translate        | API process (`server.ts` + engine) |
| Async | `?async=1` or `Prefer: respond-async` | BullMQ worker (`src/worker.ts`)    |

Async requires `REDIS_URL` + worker. Poll job endpoints listed in [[../_canonical/rules/routing]].

## Logs

```bash
LOG_LEVEL=debug npm run dev:full
```

- Routes: use `req.log` (includes `requestId`)
- Services (no `req`): `logger` from `src/logger.ts`
- Engine (`src/engine/**`): `log` from `src/engine/logger.js` (merges `traceId` from debug context)
- See [[../_canonical/rules/logging]]

## Common issues

### Translation stuck / no progress

- Check chapter status: `GET .../chapters/:id/status` (`chunksDone` / `totalChunks`)
- Async: poll `translate-jobs/:jobId`; confirm worker is running
- Redis/KV env missing → 503 or job never completes
- Open `/debug`, filter by `chapterId` or `jobId`, preset **Pipeline / stages**

### Chunk count mismatch after edit (Stage 3)

- Symptom: paragraphs out of sync after edit stage
- See plan: [[../05-plans/engine-pipeline-improvements]]
- Recovery: `POST .../translate/sync` (manual chunk → paragraph sync)

### Part of a paragraph missing after translate

- Symptom: one paragraph is much shorter than the source; chapter may show status `partial` despite `paragraphs.updated` success
- Debug: filter logs by `traceId`, look for `translation.duplicate_paragraph_ids`, `paragraph_sync.duplicate_ids_merged`, or `translation.truncated_suspect`
- Cause: LLM split one paragraph into multiple JSON rows with the same id (fixed by concat-at-sync) or truncated/wrong-id output (may need re-translate)
- Recovery: re-run translate on the chapter; manual `translate/sync` does not restore text already lost in saved paragraphs

### Cancel not stopping

- `POST .../translate/cancel` or job cancel endpoint
- Verify cancel flag in Redis (worker reads KV)

### Token limit / 402

- `src/middleware/tokenLimits.ts`
- Client: `useTokenLimitCheck`, `TokenUsageContext`

## Code map

- Pipeline: [[../03-explanation/engine-pipeline]]
- Integration / E2E: [[../03-explanation/engine-integration-boundary]]
- Source: `src/engine/pipeline/`, `src/engine/stages/`, `src/services/engine-integration.ts`
- Queues: `src/services/chapterQueue.ts`
- Debug module: `src/debug/`

## Legacy logs

`docs/archive/LOG_ANALYSIS_TRANSLATION_FLOW.md` — historical; verify against current code.

## Production incidents

See [[observability-axiom]] — correlate sync runs by `traceId`, async batch jobs by `jobId` (`trl_...`).
