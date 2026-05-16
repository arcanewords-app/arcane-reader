---
stale: true
status: archived
domain: meta
---

# Logging rules (Arcane Reader)

All backend log messages must be in **English**. Logging is local-first (stdout) with structure ready for cloud (e.g. Axiom, Datadog) later.

---

## 1. Where to log

| Place                                      | What to log                                                                              | Level                       | Use       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------- | --------- |
| **API route handlers**                     | Errors, business outcome (e.g. "chapter translated", "export started")                   | error / info                | `req.log` |
| **Services** (DB, export, engine, storage) | Errors, important state changes (e.g. project created, chapter deleted)                  | error / warn / info         | `logger`  |
| **Engine / pipeline**                      | Errors always; progress (stage done, tokens) at **info**; per-chunk/details at **debug** | error / warn / info / debug | `logger`  |
| **Middleware**                             | Errors (e.g. auth failed, token increment failed)                                        | error                       | `logger`  |
| **Startup**                                | Server started, config summary                                                           | info                        | `logger`  |

- **Errors**: always log (with `err` or message). Use `logger.error({ err }, 'message')` or `req.log.error({ err }, 'message')`.
- **Business events**: e.g. `translation.started`, `translation.completed`, `export.completed`, `project.created`. Prefer structured: `log.info({ event: '...', projectId, chapterId }, 'Message')`.
- **Recoverable issues**: e.g. "no paragraphs to translate", "validation failed but continuing" в†’ **warn**.

---

## 2. Where not to log

- **Secrets**: API keys, tokens, passwords вЂ” never in logs (only "present" / "missing" or length if needed).
- **Full request/response bodies** (can be huge or contain PII). Log IDs, counts, and short summaries only.
- **Redundant success**: if HTTP request logging already logs status 200, avoid a second "Success" line unless it adds context (e.g. "Translation completed in 45s").
- **Per-item in tight loops**: e.g. one log per paragraph. Prefer one summary (e.g. "Updated 50 paragraphs") or use **debug** for verbose.
- **Client (browser)**: no verbose logging in UI. Keep `console.error` in catch blocks for dev, or later send to Sentry/backend; do not add noisy logs.

---

## 3. Levels

| Level     | Use                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------- |
| **error** | Operation failed (user- or system-facing). Include error and context (ids, no secrets).           |
| **warn**  | Recoverable problem or unexpected but handled case (e.g. missing optional data, fallback used).   |
| **info**  | Normal business events and important steps (translation done, export done, project created).      |
| **debug** | Detailed progress (pipeline stage, chunk index, file paths). Only visible when `LOG_LEVEL=debug`. |

In **production** default is `info`; set `LOG_LEVEL=debug` temporarily for troubleshooting.

---

## 4. Backend: `req.log` vs `logger`

- **Inside Express route handlers** when you have `req`: use **`req.log`** so every log line gets `requestId` (and `userId` if authenticated). Example: `req.log.info({ event: 'translation.started', chapterId }, 'Translation started');`
- **Everywhere else** (services, engine, helpers without `req`): use **`logger`**. Example: `logger.error({ err }, 'Failed to save chapter');`
- Helpers called from a route can keep using `logger` (request is still correlated via HTTP request log and any `req.log` lines at the start of the handler).

---

## 5. Message style

- **English only.**
- Prefer short, consistent phrasing: "Translation completed", "Failed to add chapter", "No paragraphs to translate".
- For structured logs, put context in the object and a short message: `log.info({ event: 'export.completed', format, projectId }, 'Export completed');`

---

## 6. Summary

- **Log**: errors, business events, important state changes; use **debug** for verbose pipeline/details.
- **Do not log**: secrets, full bodies, redundant success, per-item in loops (unless debug).
- **Backend**: `req.log` in route handlers, `logger` elsewhere; all messages in English.

---

## 7. Migration status and audit

### Done (logger / req.log, English)

- `server.ts` вЂ” except startup banner (see below).
- `supabaseDatabase.ts`, `engine-integration.ts`, `glossaryMergeSuggestions.ts`, `export/epub.ts`, `export/fb2.ts`, `middleware/auth.ts`, `middleware/tokenLimits.ts`, `storage/database.ts`.

### Left as-is (intentional or follow-up)

- **server.ts (line ~3743)** вЂ” one `console.log`: ASCII-art startup banner in terminal. Kept on purpose for dev UX; structured `logger.info('server.started', ...)` is right after it. No change needed unless you want to remove the banner.
- **Engine** вЂ” uses a single helper **`src/engine/logger.ts`** that forwards to the app logger. All engine code uses `import { log } from '../logger.js'` and `log.debug()` / `log.info()` / `log.warn()` / `log.error()` (messages in English). To migrate to another logging system: change only `src/engine/logger.ts` (e.g. no-op or another backend); engine call sites stay unchanged.
- **Client** вЂ” `src/client/**`: all `console.error` / `console.warn` / `console.log` (e.g. in catch, or вЂњExport completedвЂќ in ProjectInfo) stay as-is. No backend logger in browser; optional later: Sentry or report-to-backend.

### No `.catch(console.error)` left

- All such patterns were replaced with `logger.error` or `req.log?.error`.
