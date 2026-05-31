---
type: how-to
status: active
domain: engine
stale: false
created: 2026-05-16
updated: 2026-06-01
canonical: .cursor/rules/engine.mdc
---

# How to debug translation issues

## Debug log viewer (local dev)

Dev-only in-memory log UI (not available when `NODE_ENV=production`):

| URL                           | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `http://localhost:3000/debug` | Log viewer (also via Vite proxy: `http://localhost:5173/debug`)      |
| `GET /api/debug/logs`         | JSON log buffer (`?newestFirst=1`)                                   |
| `GET /api/debug/traces`       | Trace summaries (`traceId` / `jobId` / `requestId`)                  |
| `GET /api/debug/traces/:id`   | Entries for one correlation id                                       |
| `GET /api/debug/export`       | Markdown/JSON export (`?format=cursor\|markdown\|json`, `?traceId=`) |
| `GET /api/debug/prompts`      | Opt-in LLM captures (`DEBUG_CAPTURE_LLM=1`)                          |
| `GET /debug/clear`            | Clear log buffer                                                     |
| `GET /debug/clear-prompts`    | Clear prompt captures                                                |

**Buffer:** default 2000 entries (`DEBUG_LOG_MAX_ENTRIES`). Older entries are overwritten (ring buffer).

**Worker logs (`npm run dev:full`):** async jobs run in a separate process. With `REDIS_URL` set, worker logs are merged into the API viewer with `process: worker`. Without Redis, worker logs appear only in the worker terminal.

**Correlation:** each translation run gets a `traceId` (UUID). Engine and pipeline logs inherit `traceId`, `projectId`, `chapterId`, and `jobId` (async jobs) via async context. HTTP routes also log `requestId` on `req.log`.

**Copy for Cursor:** use **Copy for Cursor** or **Copy trace** in the UI, or `GET /api/debug/export?format=cursor&traceId=...`.

**Filters:** level, `event`, `process`, `chapterId`, `projectId`, `traceId`, `jobId`, text search, presets. Query params are synced to the URL for bookmarks, e.g. `/debug?chapterId=...&event=pipeline.start`.

**Prompts tab:** set `DEBUG_CAPTURE_LLM=1` in `.env` and restart. Captures truncated system/user/response previews (not full chapter text).

Implementation: `src/debug/` (buffer, routes, viewer, redis bridge).

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
