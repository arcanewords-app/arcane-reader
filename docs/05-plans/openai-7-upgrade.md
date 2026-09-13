---
type: plan
status: active
domain: engine
stale: false
created: 2026-09-13
updated: 2026-09-13
canonical: .cursor/skills/dependency-maintenance/SKILL.md
---

# openai 6 → 7

**Do not combine** with other majors. Owner: Engine agent.

| | |
| --- | --- |
| Current | `openai@^6.49.0` |
| Target | `openai@^7` (latest 7.x) |
| Code | `src/engine/providers/openai.ts`, `src/shared/openaiModelAdapter.ts` |

## Blockers

None on Node (SDK 7 requires Node 22+; we are on 24).

## Breaking notes (read before coding)

Upstream [MIGRATION.md](https://github.com/openai/openai-node/blob/master/MIGRATION.md):

- Web Fetch types: `withResponse` / `asResponse` bodies are Web `ReadableStream`; `APIError.headers` is Web `Headers`
- Named + URI-encoded path params
- `httpAgent` removed → `fetchOptions`
- Removed shims, deprecated helpers, beta chat namespace

7.0.0 changelog itself is mostly “require Node 22”; later 7.x may add more — re-read changelog at implement time.

## Checklist

- [ ] Read current `openai` MIGRATION.md vs our provider
- [ ] Bump only `openai` in `package.json`; `npm install --no-workspaces`
- [ ] `npm run lint:all && npm run test && npm run build`
- [ ] Smoke: one translate job (local, mocked unit + one live `@llm` only if asked)
- [ ] Archive this plan; update [[05-plans/dependency-major-backlog]]

## References

- [[02-how-to/dependency-audit-baseline]]
- [[05-plans/dependency-major-backlog]]
