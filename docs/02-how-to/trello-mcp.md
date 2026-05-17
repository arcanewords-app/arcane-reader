# Trello MCP for Cursor

Connect [mcp-server-trello](https://github.com/delorenj/mcp-server-trello) so agents can read your Trello boards (lists, cards, checklists). Planned use: generate tasks in this vault (Kanban plugin) from Trello cards.

## Credentials

1. Open [trello.com/app-key](https://trello.com/app-key) — copy **API Key**.
2. Generate a **Token** (link on the same page) with scope `read,write`.
3. Optional **board ID**: open `https://trello.com/b/<shortId>.json` from your board URL and copy the `id` field.

## Cursor config

1. Edit `%USERPROFILE%\.cursor\mcp.json` (merge with existing servers — keep `obsidian` if present).
2. Copy the `trello` block from [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example).
3. Replace `YOUR_TRELLO_API_KEY`, `YOUR_TRELLO_TOKEN`, `YOUR_TRELLO_BOARD_ID`.
4. Reload Cursor → **Settings → MCP** — `trello` should show as connected.

First start runs `npx -y @delorenj/mcp-server-trello` and may take half a minute.

## Verify

In Cursor chat, ask the agent to run Trello MCP tools: `list_boards`, then `get_lists` on your board.

## Security

- Do not commit API key or token to git.
- Revoke the token at [trello.com/app-key](https://trello.com/app-key) if it was exposed.

## Agents

- Setup checklist: `.cursor/agents/trello-mcp-setup.md`
- Tool reference: `.cursor/skills/trello-mcp/SKILL.md`
- Obsidian vault MCP: [[obsidian-vault]]

## Next step

Trello → Obsidian Kanban sync is not implemented yet; when added, agents will read cards via Trello MCP and write notes via Obsidian MCP.
