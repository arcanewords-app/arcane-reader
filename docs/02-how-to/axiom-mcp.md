# Axiom MCP for Cursor (prod debug)

Connect the [official Axiom MCP Server](https://axiom.co/docs/console/intelligence/mcp-server) so agents can query production and staging logs without hand-copying APL — by `traceId`, `jobId`, or `requestId`.

Prerequisite: log shipping to Axiom is configured — see [[observability-axiom]].

## Why

| Tier           | Tool                                     |
| -------------- | ---------------------------------------- |
| Local dev      | `/debug` console — [[debug-translation]] |
| Prod / staging | Axiom Console or **Axiom MCP** in Cursor |

MCP gives AI agents read-only access to the same datasets (`arcane-prod`, `arcane-staging`) with Arcane-specific query patterns in the agent skill.

## Setup

1. Ensure datasets and log shipping exist — [[observability-axiom]] §1–4.
2. Edit `%USERPROFILE%\.cursor\mcp.json` (merge with existing servers — keep `obsidian` / `trello` if present).
3. Copy the `axiom` block from [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example):

   ```json
   "axiom": {
     "url": "https://mcp.axiom.co/mcp"
   }
   ```

4. Reload Cursor → **Settings → MCP** — complete browser OAuth when prompted.

### Fallback (OAuth issues)

If the remote URL fails, use `mcp-remote`:

```json
"axiom": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://mcp.axiom.co/mcp"]
}
```

See [Axiom MCP Server docs](https://axiom.co/docs/console/intelligence/mcp-server) for header-based auth (PAT + org ID).

### Tokens

- **Vercel `AXIOM_TOKEN`** (ingest, `xaat-...`) ships logs only — it does **not** authorize MCP queries.
- MCP uses OAuth or a separate token with **Query** permission on your datasets.

## Verify

In Cursor chat, ask the agent to:

1. Run `listDatasets` — see `arcane-prod` / `arcane-staging`.
2. Run `queryApl`:

   ```kusto
   ['arcane-staging']
   | where event == "http.request"
   | take 5
   ```

Or trigger a staging health check ([[observability-axiom]] §4) and query by `traceId` / `jobId`.

## Agents

- Setup checklist: `.cursor/agents/axiom-mcp-setup.md`
- Tool reference and Arcane APL: `.cursor/skills/axiom-mcp/SKILL.md`

## Terminal alternative (optional)

For manual queries outside Cursor, install the [Axiom CLI](https://axiom.co/docs/reference/cli):

```bash
axiom query "['arcane-prod'] | where traceId == \"<uuid>\" | sort by _time asc" --start-time -1h
```

No npm wrappers in this repo — use the official CLI directly.

## Security

- Do not commit API tokens to git.
- MCP tools are read-only; revoke OAuth or tokens in Axiom Console if exposed.

## Related

- [[observability-axiom]] — shipping, smoke tests, saved queries
- [[debug-translation]] — local `/debug` only
