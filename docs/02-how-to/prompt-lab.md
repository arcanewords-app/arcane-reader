---
type: how-to
status: active
domain: engine
created: 2026-06-16
---

# Prompt Lab (dev-only)

Isolated tool for testing Analyze / Translate / Edit prompts without affecting production.

## Prerequisites

1. Local dev: `npm run dev` or `npm run dev:full`
2. `OPENAI_API_KEY` in `.env`
3. Apply SQL migration: [[../migrations/prompt_lab_tables]] in Supabase

## Open the UI

- Direct: `http://localhost:5175/prompt-lab/`
- Via main client proxy: `http://localhost:5173/prompt-lab`

## Workbench

Three-column layout:

1. **Configuration** — stage, language controls (full pair for analyze/translate; target-only for edit), model select, temperature, prompt version, advanced options (glossary, custom instructions).
2. **Prompts** — system/user preview cards; **Edit** opens fullscreen modal with diff and save-as-version.
3. **Input & Result** — source text, run output, token stats.

Steps:

1. Choose **stage**, **language** (pair or target per stage), **model**, and **prompt version** (current from code or saved).
2. For **edit**: set preset and focus; only **target language** affects the editor system prompt.
3. Paste **source text** (and translated text for edit).
4. Optionally import **glossary** (JSON/CSV) under Advanced options.
5. Edit prompts via **Edit** in the Prompts column (or override user prompt in the modal).
6. Click **Run stage** — result appears on the right.
7. Enable **Save run** (Advanced) to persist in `prompt_lab_runs`.

Model list matches main app settings (`src/shared/llmModels.ts`). Reasoning models are hidden for the analyze stage.

## Meta API

`GET /api/prompt-lab/meta` returns `pairs` (with `label`), `models`, `defaultModel`, `analysisExcludedModels`, stages, presets, focus options.

## Saved data

| Tab             | Table                |
| --------------- | -------------------- |
| Saved texts     | `prompt_lab_texts`   |
| Prompt versions | `prompt_lab_prompts` |
| Run history     | `prompt_lab_runs`    |

## Related

- [[debug-translation]] — production pipeline debug capture
- [[../03-explanation/engine-pipeline]] — stage inputs matrix
- Rule: [[../_canonical/rules/prompt-lab]]
