---
type: plan
status: archived
domain: engine
stale: false
created: 2026-05-31
updated: 2026-05-31
trello: https://trello.com/c/x6yL862t
canonical: .cursor/rules/engine.mdc
---

# Engine CJK → RU spike (research)

**Trello:** [Spike card](https://trello.com/c/x6yL862t)

## Decision summary

| Topic          | Decision                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| MVP languages  | **ko**, **zh** → **ru**                                                                                 |
| Japanese (ja)  | **Phase 2** — go/no-go after ko/zh quality baseline                                                     |
| Morphology     | Analyze extracts gender/entities; translation/editing via **LLM** + glossary; no new declension modules |
| Scope of spike | Research + follow-up cards; **no code in this card**                                                    |

## Executive summary

The `Language` union already includes `ko`, `zh`, `ja`, but the pipeline is effectively **hardwired to en→ru** in two places. Prompts and glossary loading assume **English-origin names**. CJK→RU is not a small patch: it requires **language propagation**, **prompt specialization**, and **glossary path fixes** before quality testing is meaningful.

**Recommendation:** treat MVP as **integration + prompts + glossary loading** (3 cards, M/L), then chunking parity (S), then UI (S). ja deferred to Phase 2.

---

## Critical blockers (must fix before any CJK quality test)

### 1. Hardcoded languages in Analyze stage

`AnalyzeStage.analyzeSection` passes `'English', 'Russian'` to `createAnalyzerPrompt` regardless of project/agent languages:

```230:230:src/engine/stages/stage-1-analyze.ts
        content: createAnalyzerPrompt(sectionText, 'English', 'Russian', glossaryText || undefined),
```

**Impact:** Analyzer user prompt always says "English → Russian". CJK entity extraction, honorifics, and transliteration guidance are misaligned.

**Verdict:** **Rewrite** — pass `AgentContext.sourceLanguage` / `targetLanguage` (with human-readable labels).

### 2. Hardcoded languages in engine-integration

`getAgentForProject` always creates agent with `sourceLanguage: 'en'`, `targetLanguage: 'ru'`:

```40:45:src/services/engine-integration.ts
    agent = NovelAgent.create({
      novelId: project.id,
      title: project.name,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
```

Project DB has `source_language` / `target_language` (`supabaseDatabase.ts`) but they are **not wired** into the agent.

**Impact:** Even if Analyze is fixed, agent state and `TranslationConfig` remain wrong for ko/zh projects.

**Verdict:** **Patch** in integration layer — map `project.sourceLanguage` / `project.targetLanguage` to `Language` union with validation.

### 3. Glossary load uses EN→RU transliteration

When loading existing glossary entries, `translateAndDeclineName(entry.original, ...)` runs for every character. That function transliterates **Latin** names via `transliterateEnToRu`; CJK originals produce garbage or pass-through incorrectly.

**Impact:** Pre-existing glossary from analyze (with CJK originals) gets corrupted on agent reload.

**Verdict:** **Rewrite path** for non-Latin originals — use `entry.translated` from DB when present; skip EN transliteration when source is CJK; declensions optional (LLM handles in translation).

---

## Gap matrix: component × ko/zh → ru

| Component                                  | As-is                                                             | Problem                                                                                  | Verdict                               | Size |
| ------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- | ---- |
| `types/common.ts` `Language`               | Includes ko, zh, ja                                               | Type exists but unused in runtime paths                                                  | OK                                    | —    |
| `engine-integration.ts` agent create       | Hardcoded en/ru                                                   | Wrong language pair                                                                      | **Patch**                             | S    |
| `stage-1-analyze.ts` prompt args           | Hardcoded English/Russian                                         | Wrong analyze context                                                                    | **Patch**                             | S    |
| `ANALYZER_SYSTEM_PROMPT`                   | Generic + one honorifics line; "Russian declension" in guidelines | No ko/zh name patterns, speech levels, hanja/hangul                                      | **Rewrite** branches or overlay       | M    |
| `TRANSLATOR_SYSTEM_PROMPT`                 | Generic literary translator                                       | No CJK→RU: honorifics, particles, name readings                                          | **Rewrite** overlay for source=ko\|zh | M    |
| `EDITOR_SYSTEM_PROMPT`                     | RU literary editor (correct for target=ru)                        | OK for CJK→RU target; risk if we add other targets later                                 | **Defer** branch until non-RU targets | —    |
| `createAnalyzerPrompt`                     | ISO codes as strings (`ko`, `ru`)                                 | Weak signal for LLM; prefer full names + rules block                                     | **Patch**                             | S    |
| `chunker.ts` `estimateTokens`              | tiktoken + CJK heuristic incl. Hangul                             | Works                                                                                    | OK                                    | —    |
| `openai.ts` `estimateTokens`               | CJK regex **without Hangul**                                      | Underestimates ko text → wrong budgets if used                                           | **Patch**                             | S    |
| `chunker.ts` `splitIntoSentences`          | `(?<=[.!?])\s+(?=[A-ZА-ЯЁ"«])`                                    | Breaks for CJK sentence boundaries when `neverSplitParagraphs: false`                    | **Patch** when sentence split needed  | S    |
| `splitIntoSections` (analyze)              | Paragraph-based                                                   | OK for CJK                                                                               | OK                                    | —    |
| Default chunk sizes (2000/3500)            | Sized for Latin                                                   | CJK paragraphs = more tokens per char; may need lower maxTokens or higher timeouts       | **Tune** after manual runs            | S    |
| `translateAndDeclineName` on glossary load | EN-centric                                                        | Breaks CJK originals                                                                     | **Patch**                             | M    |
| `GlossaryManager.addCharacter`             | `translateName` for EN                                            | Analyze should supply `suggestedTranslation`; addCharacter must not re-transliterate CJK | **Patch**                             | S    |
| API `projects.ts` schema                   | `z.string()` for languages                                        | No enum validation                                                                       | Follow-up (Product)                   | S    |
| Client i18n `language.*`                   | ja, zh present; **ko missing**                                    | UI labels incomplete                                                                     | Follow-up (Product)                   | S    |
| Project UI language picker                 | Shows metadata.language only                                      | No source/target selection for translation pair                                          | Follow-up (Product)                   | M    |

---

## Stage × language matrix (ko, zh)

| Stage         | ko → ru   | zh → ru   | Notes                                                                                                                    |
| ------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Analyze**   | High risk | High risk | Names in Hangul; speech levels (-요/-습니다); honorifics (님, 씨). System prompt assumes capitalized Latin proper nouns. |
| **Translate** | High risk | High risk | Particles, address forms, Sino-Korean vs native vocabulary. Glossary must carry RU transliteration from analyze.         |
| **Edit**      | Low risk  | Low risk  | Input is already Russian; existing RU literary rules apply. Declension hints still useful.                               |

### ja (Phase 2) — preview

| Area         | Extra complexity                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Names        | Kanji + furigana + reading choice (kun/on)                                                                                             |
| Dialogue     | Keigo levels, sentence-final particles                                                                                                 |
| Typography   | Mixed scripts, vertical text in imports                                                                                                |
| **Go/no-go** | After ko/zh manual quality runs; if analyze glossary quality is acceptable for ko/zh, ja is incremental prompt work + reading metadata |

---

## Token / chunk audit

Sample heuristic (100 chars each):

| Script      | chunker heuristic          | openai provider                 |
| ----------- | -------------------------- | ------------------------------- |
| Hangul (ko) | ~100 tokens (1 char/token) | ~25 tokens (Latin formula only) |
| Han (zh)    | ~100 tokens                | ~100 tokens (CJK in regex)      |
| Latin (en)  | ~25 tokens                 | ~25 tokens                      |

**Action:** unify CJK detection (include Hangul `0xAC00–0xD7AF`) in shared util; use in both `chunker.ts` fallback and `openai.ts`.

**Default pipeline:** `neverSplitParagraphs: true` — sentence split gap is **latent** unless flag changes.

**Oversized paragraphs:** CJK chapters with long unbroken paragraphs may exceed token limits → timeout risk. Monitor in manual runs; consider lower `chunkSize` for ko/zh source (e.g. 1200–1500).

---

## Prompt strategy (recommended)

Introduce **language-pair overlays** instead of monolithic rewrites:

```
getAnalyzerSystemPrompt(source: Language, target: Language)
getTranslatorSystemPrompt(source: Language, target: Language)
```

- **Base prompts:** keep current generic + RU editor as default.
- **Overlays for ko→ru, zh→ru:** honorifics, name transliteration rules (consistent with analyze), speech register, particles → Russian equivalents.
- **Analyze output:** require `suggestedTranslation` in Cyrillic for all proper nouns; store gender for LLM declension hints (not Petrovich for CJK-originated names).

Morphology policy (agreed): **no programmatic declension for CJK-origin names** — LLM + glossary canonical form + editor declension hints.

---

## Risks

| Risk                                           | Mitigation                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Name inconsistency (multiple transliterations) | Strong analyze + glossary enforcement in translator                      |
| Regression en→ru                               | Language overlays only when source ∈ {ko, zh}; keep current paths for en |
| Token/timeouts on long CJK paragraphs          | Tune chunkSize; monitor worker timeouts                                  |
| Glossary corruption on reload                  | Fix integration load path before testing                                 |
| ja scope creep                                 | Explicit Phase 2 gate                                                    |

---

## Follow-up Trello cards (created)

| #   | Card                                                       | Size | Priority |
| --- | ---------------------------------------------------------- | ---- | -------- |
| 1   | Engine: wire project languages + fix glossary load for CJK | M    | P0       |
| 2   | Engine: Analyzer prompts for ko/zh→ru                      | M    | P0       |
| 3   | Engine: Translator prompts for ko/zh→ru                    | M    | P1       |
| 4   | Engine: CJK-aware token estimate parity                    | S    | P1       |
| 5   | Product: UI labels + project language pair (ko/zh)         | S–M  | P2       |
| 6   | Engine: ja→ru Phase 2 (after ko/zh baseline)               | L    | P3       |

---

## Manual test plan (optional, post P0)

1. Create project with `sourceLanguage: ko`, `targetLanguage: ru` (after card #1).
2. Run analyze on ~2k char sample chapter — verify glossary entries have Cyrillic `suggestedTranslation` and gender.
3. Run translate — check honorifics and name consistency.
4. Repeat for zh sample.
5. Document quality notes in this plan or a debug note.

---

## References

- [[03-explanation/engine-pipeline]]
- [[03-explanation/engine-glossary-and-prompts]]
- [[03-explanation/engine-integration-boundary]]
- [[05-plans/engine-pipeline-improvements]] (Stage 3 alignment — orthogonal but affects all languages)
