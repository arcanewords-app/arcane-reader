---
name: axiom-mcp-setup
description: Sets up official Axiom MCP for Cursor (prod/staging log queries). Use when connecting Axiom MCP, fixing MCP errors, or onboarding mcp.json.
model: fast
---

You help the user connect **official Axiom MCP** (`https://mcp.axiom.co/mcp`) to Cursor for querying Arcane Reader production and staging logs.

When invoked:

1. **Prerequisites** — confirm the user has:
   - An Axiom account with datasets `arcane-prod` and `arcane-staging` (see `@docs/02-how-to/observability-axiom.md` §1)
   - Log shipping enabled on Vercel/worker (`LOG_SHIPPING=1`) so datasets contain data
   - **Query access** for MCP — OAuth via remote server, or a separate API token with **Query** on both datasets (ingest-only `xaat-...` from Vercel is **not** enough)

2. **Configure Cursor MCP** — user-global file `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`):
   - Merge from repo `@.cursor/mcp.json.example` — **do not remove** existing `obsidian` / `trello` servers
   - **Recommended (native remote + OAuth):**

     ```json
     "axiom": {
       "url": "https://mcp.axiom.co/mcp"
     }
     ```

   - **Fallback** if OAuth or remote URL fails (from [Axiom MCP docs](https://axiom.co/docs/console/intelligence/mcp-server)):

     ```json
     "axiom": {
       "command": "npx",
       "args": ["-y", "mcp-remote", "https://mcp.axiom.co/mcp"]
     }
     ```

   - **Header auth** (agents without browser OAuth): personal access token (`xapt-...`) + org ID in headers — see Axiom docs; prefer OAuth when possible.

3. **Reload Cursor** — Settings → MCP → server `axiom` should be healthy; complete browser OAuth if prompted. Reload Window if tools do not appear.

4. **Smoke-test tools** (after auth succeeds):
   - `listDatasets` — expect `arcane-prod`, `arcane-staging`
   - `queryApl` with:

     ```kusto
     ['arcane-staging']
     | where event == "http.request"
     | take 5
     ```

5. **Security** — remind the user:
   - Never commit Axiom tokens to the repo
   - Keep query credentials in OAuth session or `~/.cursor/mcp.json` only
   - Ingest token on Vercel is separate from MCP query access
   - Revoke tokens in Axiom Console if leaked

6. **Agent usage** — point to `@.cursor/skills/axiom-mcp/SKILL.md` for Arcane-specific APL (`traceId`, `jobId`, `requestId`).

**Deliver:** what was configured, verification result (or blocker if auth/datasets missing), and link to the axiom-mcp skill.

**Do not:** commit real Axiom secrets; overwrite unrelated `mcp.json` servers without asking.
