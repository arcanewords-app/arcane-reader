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
4. For **Review** (compare + LLM score): [[../migrations/prompt_lab_review]]

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
3. Paste **source text** (and translated text for edit), or use **Import scraper chapter** (see below).
4. Optionally import **glossary** (JSON/CSV) under Advanced options.
5. Edit prompts via **Edit** in the Prompts column (or override user prompt in the modal).
6. Click **Run stage** — result appears on the right.
7. Enable **Save run** (Advanced) to persist in `prompt_lab_runs` (auto `display_name`: `stage_model_prompt_label`).

Model list matches main app settings (`src/shared/llmModels.ts`). Reasoning models are hidden for the analyze stage.

## Review

Header button **Review** opens the evaluation workspace:

1. Pick **left** and **right** runs from history (translate/edit with text output).
2. Choose **Source** or **Output** for each side (compare translate vs edit, or source vs translation).
3. Side-by-side paragraph view with marker stripping.
4. Pick an **Evaluation model** (defaults to the configured model; persisted per session). Reasoning models may be slower but more thorough.
5. **Evaluation prompt** — preview the exact system/user prompt sent to the model (inline snippet + full modal, `POST /api/prompt-lab/evaluate/preview`, no LLM call).
6. **Evaluate** — LLM score (1–10), dimensions, issues; saved to `prompt_lab_evaluations`. It runs as a single request, so it finishes in seconds (translation/edit run the full pipeline and take longer).

Workbench **Advanced**: optional **Run label** suffix.

Translate always uses `--para:auto_N--` paragraph markers (Reader uses UUIDs from the chapter DB). Source text is normalized on save, scraper import, load, and run — same blank-line split as chapter import in Reader.

## Meta API

`GET /api/prompt-lab/meta` returns `pairs` (with `label`), `models`, `defaultModel`, `analysisExcludedModels`, stages, presets, focus options.

## Saved data

| Tab             | Table                    |
| --------------- | ------------------------ |
| Saved texts     | `prompt_lab_texts`       |
| Prompt versions | `prompt_lab_prompts`     |
| Run history     | `prompt_lab_runs`        |
| Review          | `prompt_lab_evaluations` |

**Save text** and **Load in workbench** normalize source (and translated text when present): strip any existing markers, split on blank lines (same as chapter import in Reader), drop separator-only paragraphs (`***`, `---`), and inject fresh `--para:auto_N--` markers. Partial marker coverage (e.g. one marker on a whole chapter) is always re-split. Workbench and Saved texts show a paragraph preview list aligned with Reader's paragraph view.

### Import scraper chapter

Alternative to pasting source text: **Import scraper chapter** in the Input column loads a chapter JSON from [arcane-scraper](https://github.com/arcane-scraper) scraper-console data, e.g. `apps/scraper-console/data/scraper-projects/{projectId}/chapters/1036.json`.

Expected shape (`ProjectChapterFull`): `number`, `title`, `content` (plain text with `\n\n` paragraph breaks), optional `sourceUrl`, `sourceAdapterId`, `scrapedAt`. Raw BQG API dumps with a `txt` field are rejected — use the saved chapter file from scraper-console.

Flow: pick `.json` → source text and chapter number are filled → **Save text** modal opens with title prefilled as `{number} — {title}` → confirm to store in `prompt_lab_texts`.

## Related

- [[debug-translation]] — production pipeline debug capture
- [[../03-explanation/engine-pipeline]] — stage inputs matrix
- Rule: [[../_canonical/rules/prompt-lab]]
