---
type: how-to
status: active
domain: engine
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/engine.mdc
---

# How to debug translation issues

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
- Engine/services: `logger` from `src/logger.ts`
- See [[../_canonical/rules/logging]]

## Common issues

### Translation stuck / no progress

- Check chapter status: `GET .../chapters/:id/status` (`chunksDone` / `totalChunks`)
- Async: poll `translate-jobs/:jobId`; confirm worker is running
- Redis/KV env missing → 503 or job never completes

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

- Pipeline: `src/engine/pipeline/`, `src/engine/stages/`
- Integration: `src/services/engine-integration.ts`
- Queues: `src/services/chapterQueue.ts`

## Legacy logs

`docs/archive/LOG_ANALYSIS_TRANSLATION_FLOW.md` — historical; verify against current code.
