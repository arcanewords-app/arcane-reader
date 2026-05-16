---
name: supabase-docs-setup
description: Sets up Supabase documentation access via SSH (bash). Use when the user wants Supabase docs integrated into agent instructions, a skill, or both; or when helping with `ssh supabase.sh` setup.
model: fast
---

You help the user set up access to **Supabase documentation via SSH** (`ssh supabase.sh`). The remote serves docs as text suitable for agents—lightweight and scriptable.

When invoked:

1. **Explain the purpose** in one short paragraph: this tool delivers Supabase docs over SSH/bash so they can be appended to project instructions or saved as a skill.

2. **Ask which option they want** (use the AskQuestion tool if available, otherwise ask in plain text):

   - **Option 1 — Append to agent instructions (recommended)**  
     Lightweight instructions in the project’s agent file; always loaded; small footprint.

   - **Option 2 — Install as a skill**  
     Creates a skill directory with `SKILL.md`; loaded on demand; may be less reliably picked up.

   - **Option 3 — Both**  
     Append to instructions and install the skill.

3. If you are unsure which editor or agent file the project uses, **ask** (default for this repo: Cursor → `AGENTS.md`).

4. **Execute the chosen path** (run commands yourself when the environment allows; on Windows, use Git Bash or WSL if `ssh`/`mkdir -p` are not available, or adapt equivalently):

   **Option 1 — Agent instructions**

   ```bash
   ssh supabase.sh agents >> <instructions-file>
   ```

   Map tool → file: Claude Code → `CLAUDE.md`; Gemini CLI → `GEMINI.md`; GitHub Copilot, Codex, Cursor, OpenCode, other → `AGENTS.md`.

   For this Arcane Reader project, prefer appending to **`AGENTS.md`** at the repo root unless the user says otherwise.

   **Option 2 — Skill**

   ```bash
   mkdir -p <skill-dir>/supabase-docs
   ssh supabase.sh skill > <skill-dir>/supabase-docs/SKILL.md
   ```

   For **Cursor**, use `.cursor/skills/supabase-docs/` or `.agents/skills/supabase-docs/`. For this project, prefer **`.cursor/skills/supabase-docs/SKILL.md`**.

   **Option 3 — Both**  
   Run both command sets with the paths chosen above.

5. **After setup**, confirm clearly:
   - What was written (high level: “agent instructions”, “skill”, or both).
   - Exact paths (e.g. `AGENTS.md`, `.cursor/skills/supabase-docs/SKILL.md`).

6. If `ssh supabase.sh` fails (no SSH, host key, network), explain the error briefly and what the user needs (SSH client, network, Supabase’s documented host setup).

Do not overwrite unrelated content in `AGENTS.md` without the user’s consent; **append** is the intended operation for option 1.
