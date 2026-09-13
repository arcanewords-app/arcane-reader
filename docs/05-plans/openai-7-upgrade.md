---
type: plan
status: archived
domain: engine
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# openai 6 → 7 (completed)

**Completed** 2026-09-13 — `openai@^7.15.0`. Chat Completions params are `ChatCompletionCreateParamsNonStreaming` (no `Record<string, unknown>` / `as unknown as`). Live `@llm` not run.

## What landed

- Provider calls `chat.completions.create(buildChatCompletionParams(...))` without a cast; return type is `ChatCompletion`.
- `completionText` joins `message.content` string | text parts; 429 uses `APIError` (`status === 429`).
- Capabilities stay in `src/shared/openaiModelCapabilities.ts` (no SDK import) so the client model list does not pull OpenAI types into oxlint.

## Checklist

- [x] Read current `openai` MIGRATION.md vs our provider
- [x] Bump only `openai` in `package.json`; `npm install --no-workspaces`
- [x] `npm run lint:all && npm run test && npm run build`
- [x] Smoke: mocked unit (`openai*.test.ts`, `openaiModelAdapter.test.ts`); live `@llm` skipped
- [x] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
