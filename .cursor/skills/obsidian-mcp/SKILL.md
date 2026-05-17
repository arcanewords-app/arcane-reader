---
name: obsidian-mcp
description: Read and edit the Obsidian vault (docs/) via Local REST API MCP. Use for plans, ADR, frontmatter, vault search when Obsidian is running.
---

# Obsidian MCP

Interact with the documentation vault through the **built-in MCP server** of the [Local REST API](https://coddingtonbear.github.io/obsidian-local-rest-api/) plugin (v4+).

## Prerequisites

1. **Obsidian Desktop** running with vault root = repo folder `docs/` (not the repo root).
2. Plugin **Local REST API & MCP Server** enabled.
3. Cursor MCP server `obsidian` connected (copy [`.cursor/mcp.json.example`](../../mcp.json.example) to `~/.cursor/mcp.json` and set your API key from Obsidian settings).

If MCP is unavailable, fall back to ripgrep per [local-dev SKILL.md](../local-dev/SKILL.md) §C and warn the user to start Obsidian.

**Path trap:** MCP uses vault-relative paths (`05-plans/foo.md`). Shell `rg` uses `docs/05-plans/foo.md`. See local-dev skill **§G**.

## Path conventions

- MCP paths are **vault-relative** — no `docs/` prefix.
- Examples: `project-status.md`, `05-plans/engine-refactor.md`, `ROADMAP.md`
- Wikilinks in notes omit `docs/` (e.g. `[[ROADMAP]]`).

## Truth hierarchy

1. `src/` — behavior SSOT
2. `.cursor/rules/` — agent policies
3. `docs/` vault — plans, ADR, how-to
4. `docs/archive/` — legacy; verify against code before trusting

See `@docs/AGENTS.md` for vault structure.

## MCP tools (server: `obsidian`)

Read tool schemas under `mcps/user-obsidian/tools/*.json` before calling.

| Task                              | Tool                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| List folder                       | `vault_list` — optional `path`; directories end with `/`                                  |
| Read note / section / frontmatter | `vault_read` — use `targetType` + `target` for headings, blocks, frontmatter keys         |
| Document structure before patch   | `vault_get_document_map`                                                                  |
| Surgical edit (preferred)         | `vault_patch` — heading, block, or frontmatter; operations `append`, `prepend`, `replace` |
| Create or overwrite file          | `vault_write`                                                                             |
| Append to file end                | `vault_append`                                                                            |
| Delete file                       | `vault_delete`                                                                            |
| Full-text search                  | `search_simple`                                                                           |
| Metadata search (JsonLogic)       | `search_query`                                                                            |
| Active file path                  | `active_file_get_path`                                                                    |
| Periodic note path                | `periodic_note_get_path`                                                                  |
| Tags with counts                  | `tag_list`                                                                                |
| Command palette                   | `command_list`, `command_execute`                                                         |
| Open in Obsidian UI               | `open_file`                                                                               |

### Common queries

**Active plans:**

```json
{
  "query": {
    "and": [
      { "glob": ["05-plans/*.md", { "var": "path" }] },
      { "==": [{ "var": "frontmatter.status" }, "active"] }
    ]
  }
}
```

**Plans mentioning a topic:** use `search_simple` with your keywords.

## Workflows

### Read context for a task

1. `vault_read` on `project-status.md` and relevant `05-plans/*.md`
2. Or `search_query` for `status: active` under `05-plans/`

### Complete a plan

1. `vault_read` the plan note
2. `vault_patch` — `targetType: frontmatter`, `target: status`, `operation: replace`, content `"archived"` (JSON content type if needed)
3. `vault_patch` — `target: updated`, same pattern with today's date `YYYY-MM-DD`
4. Update `project-status.md` via `vault_patch` or `vault_read` + targeted patches
5. Do **not** duplicate route tables — link to `_canonical/rules/routing` in vault or `.cursor/rules/routing.mdc`

### New plan note

1. Follow frontmatter in `@docs/_meta/conventions.md`
2. `vault_write` under `05-plans/<slug>.md`

### Patch a section under a heading

1. `vault_get_document_map` on the file
2. `vault_patch` with `targetType: heading`, nested headings joined by `::` (default delimiter)

Use `rejectIfContentPreexists: true` on append for idempotent retries.

## REST fallback (no MCP)

From repo root, with API key and HTTP port 27123:

```bash
curl.exe -H "Authorization: Bearer YOUR_API_KEY" http://127.0.0.1:27123/vault/
```

HTTPS: `https://127.0.0.1:27124/` with `curl.exe -k` if the certificate is trusted.

## Security

- Never commit API keys or `docs/.obsidian/plugins/obsidian-local-rest-api/data.json`
- Rotate the API key in Obsidian settings if it was exposed; update `~/.cursor/mcp.json`

## Related

- Setup checklist: `@.cursor/agents/obsidian-mcp-setup.md`
- Human how-to: `@docs/02-how-to/obsidian-vault.md`
- Terminal search fallback: `@.cursor/skills/local-dev/SKILL.md` §C
