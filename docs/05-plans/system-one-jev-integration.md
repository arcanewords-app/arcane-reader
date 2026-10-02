---
type: plan
status: draft
domain: engine
stale: false
created: 2026-09-26
updated: 2026-09-26
---

# System One / Jev — possible future integration

Research note only. No code, env vars, or rule changes in this card. Jev does not replace any stage that writes text.

Source: [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (TypeSafe AI, 15 Sep 2026). Related docs: [how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md), [jev-1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md).

## What Jev is

Jev is a System One model: unstructured state in, typed probabilistic decisions out. It does not generate strings. One request can ask many questions in parallel.

Three primitives:

- **Choice** — one option from a closed list (up to 255), plus a distribution and a confidence score.
- **Score** — a position on an ordered scale of 2–10 levels, plus confidence.
- **Noul** — probability that the answer is yes, from 0 to 1. No separate confidence field. Threshold on distance from 0.5.

Code owns the branch. High confidence acts, low confidence escalates to a human or a generative model. Thresholds are examples, not defaults: calibrate them on our own chapters. Do not copy 0.5 / 0.9 from TypeSafe docs, and do not reuse a Noul threshold on a Choice. Those scales are not interchangeable, and `P(yes) + P(no)` across two separate questions is not required to sum to 1.

## Separate API and billing

Jev is not an OpenAI Chat Completions call.

- Endpoint: `POST https://api.typesafe.ai/v1/systemone`
- Auth: `TYPESAFE_API_KEY` (not our OpenAI key)
- Published price: $0.042 per million input tokens; output is free
- Access: early access / waitlist
- Pin `jev-1.13.0` in any future pilot. The `jev-latest` alias can move.

Our OpenAI promo allowance (about 1.5M tokens/day on mini models) does not cover this. In code that allowance is Chat Completions only: `promoFreeTier` in `src/shared/openaiModelCapabilities.ts`. Gateways (Vercel AI Gateway, OpenRouter `/api/alpha/decisions`, Cloudflare) are still a different product and a different bill.

1.5M Jev input tokens would be about $0.06 on TypeSafe's published rate. That is their meter, not the free OpenAI bucket.

## What we already have

Generation stays on the LLM. Jev would only sit on closed decisions around the pipeline.

| Today                           | Where                                                                     | Why it stays an LLM (or a heuristic)                                           |
| ------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Analyze → Translate → Edit      | `src/engine/pipeline/translation-pipeline.ts`                             | These stages write glossary metadata, translation, and edited prose            |
| Chapter critic                  | `src/services/chapter-critic.ts` (`runChapterCritic`)                     | Full-chapter JSON review; issue text is prose                                  |
| AI Replace, title translation   | `src/engine/prompts/ai-replace.ts`, title translate                       | The output is rewritten text                                                   |
| Stage model                     | `getStageModel` in `src/services/engine-integration.ts`                   | Static model id per stage. No difficulty signal                                |
| Glossary in a chunk             | `src/engine/glossary/glossary-filter.ts`                                  | String match (`filterGlossaryForChunk`), not a semantic judgment               |
| Merge suggestions               | `src/services/glossaryMergeSuggestions.ts`                                | One JSON completion that both groups entries and writes a reason               |
| Edit quality                    | `EditStage.checkQuality` in `src/engine/stages/stage-3-edit.ts`           | One score for the whole text; often skipped when editing is chunked            |
| Gender / location / term labels | `normalizeGender` and neighbors in `src/engine/stages/stage-1-analyze.ts` | Closed sets, but assigned inside the analysis JSON and then normalized in code |

Engine as-is: [[03-explanation/engine-pipeline]], [[03-explanation/engine-glossary-and-prompts]], [[03-explanation/engine-integration-boundary]].

## Out of scope for Jev

Do not ask Jev to:

- Translate, edit, or write critic issue descriptions, merge reasons, or titles.
- Count tokens, split chunks, or compare dates. `jev-1.13` does not count reliably and reads dates as text.
- Treat Russian or Belarusian gender agreement as a final verdict. A "likely gender error" score can filter paragraphs into the critic. It should not block a paragraph on its own.
- Generate text by chaining Choices. If the answer is a string, keep the generative model and let Jev pick among candidates the code already extracted.

`jev-1.13` is literal, weak on indirection, and does not treat state as hostile. Injected instructions inside tool arguments or `customInstructions` can move the answer. Permissions and spend caps stay in our code. Long state full of unrelated text hurts accuracy: filter first, then ask.

## Candidate integrations

Ordered as discussed. None of these are scheduled.

### 1. Glossary compliance before the critic

For each glossary term the code already found in the source, one Noul: "does the translation use the canonical target form, not a synonym?" Questions share one state and run in parallel. Paragraphs under the threshold go to `runChapterCritic`. The rest skip the full-chapter call.

Gender fits the same shape. `normalizeGender` already allows only `male`, `female`, `neutral`, `unknown`. A Choice over the sentences around a name can confirm or flag the label. Uncertain labels stay for a person or the critic.

This is the suggested first pilot (below).

### 2. Entity merge as pair scoring

`suggestGlossaryMerges` currently asks one model to emit groups and a reason. Code can build candidate pairs (similar spelling, shared first word, alias). Jev answers "same entity?" with a confidence. The same check belongs on the way out of Analyze, before a new character is written into the glossary. Uncertain pairs stay in the existing human merge UI. The short reason string, if we still want one, stays on a generative model.

### 3. Skip edit or critic by chunk score

A Score on a chunk: how much the translation already reads cleanly and keeps the meaning. High score and high confidence: skip Stage 3. Low score: run edit, or go straight to the critic. Today `checkQuality` is either one number for the whole text or silent on chunked editing (`checkQualityForChunked`).

### 4. Model route before `getStageModel`

A Choice on the chapter or chunk: plain prose, gendered dialogue, verse, game UI / system windows. Easy chunks stay on the mini model. Dense ones go to the stronger stage model. The threshold lives in code, next to `getStageModel`, not inside the prompt.

### 5. Text-block type before translation

The translator currently decides whether to wrap a span in `{{block:type-id}}` while it generates. Split that. A Choice per paragraph (speech, letter, system window, note, narration) and the code writes the markers. Translation then receives text that is already marked. Display and export already consume those markers; see [[03-explanation/engine-pipeline]].

### 6. Guardrails on author text and AI Replace

Project `customInstructions` are copied into the translate and edit prompts (`src/engine/types/pipeline.ts`, applied from project settings in `src/services/engine-integration.ts`). A Noul can ask whether the instruction tells the model to ignore the glossary, switch language, or replace the task. Failures do not enter the pipeline.

After AI Replace, a second Noul: "did the edit stay local and preserve meaning?" Apply the paragraph only when that passes. The rewrite itself stays on the generative model.

### 7. Import language and reader reports

On import, a Choice over the whitelist (`en`, `ko`, `zh`, `ru`, `be` — see `src/engine/language.ts`) and a Noul: "is this already a translation rather than source text?"

On a reader report, a Choice: typo / meaning / glossary / not actionable, so the author queue is labeled before anyone opens it. Report storage stays as it is (`src/api/routes/chapterReports.ts`). Jev only classifies.

## Suggested first pilot

Glossary compliance on **en→ru** only.

1. Code finds glossary terms in the source paragraph (existing string filter).
2. One System One request asks a Noul per term against source + translation.
3. Paragraphs below the threshold are the only ones sent to `runChapterCritic`.
4. Analyze, Translate, and Edit are unchanged.
5. Calibrate the threshold on labeled chapters from our own projects before any default ships.

Stop conditions: waitlist access, a separate TypeSafe bill, and a measured false-negative rate on glossary violations we already know about. If the Noul misses mandatory terms, the pilot does not replace the critic.

## Open questions

- Whether early access is worth a key before we have a labeled glossary-violation set.
- Where the client would live (engine library vs `src/services/`) if a pilot starts. Engine stays free of HTTP today; a provider boundary similar to `ILLMProvider` is the likely shape, not a direct call inside a stage.
- Whether daily author token limits (`src/config/tokenLimits.ts`) should count Jev tokens. They should not be silently folded into the OpenAI promo counter.
