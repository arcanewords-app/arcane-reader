---
name: vercel
description: Vercel limits for Arcane Reader — 4.5 MB function bodies, 300s duration, waitUntil, signed Storage URLs. Use when editing vercel.json, uploads, downloads, or work after the HTTP response.
---

# Vercel (Arcane Reader)

Official limits: [Functions](https://vercel.com/docs/functions/limitations), [account limits](https://vercel.com/docs/limits). Do not copy those pages here. This skill is only what bites this repo.

Config: `@vercel.json`. API entry: `api/index.ts` (`maxDuration: 300`, `supportsCancellation: true`). Deploy notes: `@.cursor/rules/deployment.mdc`.

## Hard limits

| Limit                     | Value here                                                                                              | What to do                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Request and response body | 4.5 MB. Not configurable. 413 `FUNCTION_PAYLOAD_TOO_LARGE` or 500 `FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE` | Files go through Supabase Storage signed URLs. Do not `multipart` a large file into the function and do not `res.send` a file buffer. |
| Duration                  | 300s on `api/index.ts` (Hobby max, Pro default)                                                         | Long translate/analyze stays on the BullMQ worker (`REDIS_URL`). Do not raise `maxDuration` without a separate decision.              |
| Memory                    | 2 GB / 1 vCPU default                                                                                   | Cannot be set in `vercel.json`.                                                                                                       |
| Work after `res.end`      | Frozen unless scheduled                                                                                 | Use `waitUntil` from `@vercel/functions` (`scheduleAfterResponse`). Local and tests keep `setImmediate`.                              |

## Patterns already in the repo

- Chapter upload over 4 MB: signed upload to the private `imports` bucket, then a small JSON start (`src/shared/uploadLimits.ts`).
- EPUB/FB2 download: `createSignedUrl('exports', path)` and a small JSON `{ url, filename }`. The browser opens that URL. Do not `fetch` the Storage host from the page (CORS).
- Logs after the response: `waitUntil(flushLogs())` in `requestContext.ts`.
- `GET /api/projects/:id` does not include paragraph text.

## Do not

- Proxy a book, cover archive, or export through the function "so the download has our auth header".
- Run the import or a translation to completion inside the function after the client already got `202`, without `waitUntil`.
- Treat a 413/payload error as a string. Vercel nests `{ error: { code, message } }`. Parse it in `src/client/api/errors.ts`.
