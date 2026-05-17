---
name: trello-mcp-setup
description: Sets up Trello MCP for Cursor via npx. Use when connecting Trello MCP, fixing MCP errors, or onboarding mcp.json.
model: fast
---

You help the user connect **Trello MCP** ([@delorenj/mcp-server-trello](https://github.com/delorenj/mcp-server-trello)) to Cursor for reading boards/lists/cards (future Obsidian Kanban sync).

When invoked:

1. **Credentials** — confirm the user has:
   - `TRELLO_API_KEY` from [trello.com/app-key](https://trello.com/app-key)
   - `TRELLO_TOKEN` with scope `read,write` (authorize link on the same page, using their API key)
   - Optional `TRELLO_BOARD_ID` — default board; find via `https://trello.com/b/<shortId>.json` → field `id`, or use `list_boards` + `set_active_board` after connect

2. **Configure Cursor MCP** — user-global file `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`):
   - Merge from repo [`.cursor/mcp.json.example`](../mcp.json.example) — **do not remove** existing `obsidian` server
   - Replace `YOUR_TRELLO_API_KEY`, `YOUR_TRELLO_TOKEN`, `YOUR_TRELLO_BOARD_ID` with real values
   - Default launch: `npx -y @delorenj/mcp-server-trello`
   - If `npx` is not found: run `where.exe npx` and set `command` to full path (e.g. `C:\\nvm4w\\nodejs\\npx.cmd`)

3. **Prefetch package** (optional, speeds first MCP start):

   ```powershell
   npx -y @delorenj/mcp-server-trello
   ```

   Expect exit with error about missing env until keys are set — that confirms the package installed.

4. **Reload Cursor** — Settings → MCP → server `trello` should be healthy; Reload Window if tools do not appear.

5. **Smoke-test tools** (after credentials are set):
   - `list_boards`
   - `get_active_board_info`
   - `get_lists`
   - `get_cards_by_list_id` with a `listId` from `get_lists`

6. **Security** — remind the user:
   - Never commit `TRELLO_API_KEY` / `TRELLO_TOKEN` to the repo
   - Keep secrets only in `~/.cursor/mcp.json`
   - Revoke token at [trello.com/app-key](https://trello.com/app-key) if leaked

7. **Agent usage** — point to [`.cursor/skills/trello-mcp/SKILL.md`](../skills/trello-mcp/SKILL.md) for tool names and read workflows.

**Deliver:** what was configured, verification result (or blocker if placeholders remain), and link to the trello-mcp skill.

**Do not:** commit real Trello secrets; overwrite unrelated `mcp.json` servers without asking.
