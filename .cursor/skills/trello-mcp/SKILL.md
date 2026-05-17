---
name: trello-mcp
description: Read Trello boards, lists, and cards via MCP (npx @delorenj/mcp-server-trello). Use for importing tasks into Obsidian when MCP is connected.
---

# Trello MCP

Interact with Trello boards through the MCP server [@delorenj/mcp-server-trello](https://github.com/delorenj/mcp-server-trello), launched via `npx` from Cursor config.

## Prerequisites

1. **Credentials** in `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`):
   - `TRELLO_API_KEY`, `TRELLO_TOKEN` (required)
   - `TRELLO_BOARD_ID` (optional default board)
2. Cursor MCP server `trello` connected (copy [`.cursor/mcp.json.example`](../../mcp.json.example) trello block; see [`trello-mcp-setup.md`](../../agents/trello-mcp-setup.md)).
3. First `npx` start may take 10–30 s while the package downloads.

If MCP is unavailable, tell the user to set credentials, reload Cursor (Settings → MCP), and run setup agent `trello-mcp-setup`.

## Board selection

- Set `TRELLO_BOARD_ID` in `mcp.json` for a default board, **or**
- Call `list_boards` then `set_active_board` — persists in `%USERPROFILE%\.trello-mcp\config.json`
- Most tools accept optional `boardId` to override the active board

## MCP tools

- Cursor config key: `trello` in `mcp.json`
- MCP invoke server id: `user-trello` (see `mcps/user-trello/`)

Read tool schemas under `mcps/user-trello/tools/*.json` before calling.

### Read workflows (import to Obsidian / Kanban)

| Task                   | Tool                    | Notes                                   |
| ---------------------- | ----------------------- | --------------------------------------- |
| List accessible boards | `list_boards`           |                                         |
| Set default board      | `set_active_board`      | `{ boardId }`                           |
| Current board          | `get_active_board_info` |                                         |
| Board columns          | `get_lists`             | Optional `boardId`                      |
| Cards in a column      | `get_cards_by_list_id`  | `listId` from `get_lists`               |
| Full card (markdown)   | `get_card`              | `includeMarkdown: true` for vault paste |
| My assigned cards      | `get_my_cards`          |                                         |
| Recent activity        | `get_recent_activity`   | Optional `limit`                        |

### Write / manage (use only when asked)

`add_card_to_list`, `update_card_details`, `move_card`, `archive_card`, checklist and comment tools — see upstream README.

## Pairing with Obsidian MCP

Future flow: **read** from Trello (`get_lists`, `get_cards_by_list_id`, `get_card`), **write** to vault via Obsidian MCP (`vault_write`, `vault_patch`) — see [obsidian-mcp SKILL](../obsidian-mcp/SKILL.md). Obsidian must be running for vault tools.

Do not duplicate Trello secrets into vault notes or repo `.env`.

## Rate limits

Trello API: ~300 req/10s per key, ~100 req/10s per token — handled by the server.

## Related

- Setup: `@.cursor/agents/trello-mcp-setup.md`
- Human how-to: `@docs/02-how-to/trello-mcp.md`
- Obsidian vault: `@.cursor/skills/obsidian-mcp/SKILL.md`
