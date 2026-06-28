---
type: reference
status: active
domain: engine
stale: false
created: 2026-06-29
updated: 2026-06-29
projectId: 57cb0c5f-8f3d-4e74-a1fb-8425d17e1d68
projectName: Зенит Колдовства
langPair: en→ru
tags:
  - translation
  - benchmark
---

# Зенит Колдовства — translation runs

Проект Arcane Reader: **en→ru**. `projectId`: `57cb0c5f-8f3d-4e74-a1fb-8425d17e1d68`.

Названия глав в debug-логах (`chapterTitle`) могут быть на языке импорта — это metadata, не lang pair.

Индекс всех проектов: [[../translation-run-log]].

---

## Run 2026-06-27 — editing, project ch. 34

|                             |                                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| **traceId**                 | `e2b4ace6-068e-4ec3-986f-c6721ce9e6d3`                                       |
| **jobId** (batch)           | `trl_mqwkmbkj_5pexge`                                                        |
| **chapterId**               | `1bb167ee-3f4f-4569-bfaa-f46365d54033`                                       |
| **Project ch**              | 34                                                                           |
| **Source title** (metadata) | 第一百八十一章 强闯                                                          |
| **Environment**             | local `dev:full`                                                             |
| **Stages**                  | `editing` only                                                               |
| **Mode**                    | async (chapter within batch job)                                             |
| **Editing model**           | `gpt-5.4-mini`                                                               |
| **Execution**               | `one_shot`, `forceSingleShot: true`, `editingStylePreset: ai_revivification` |
| **Started**                 | 2026-06-27T16:44:10Z                                                         |
| **Completed**               | 2026-06-27T16:44:38Z                                                         |
| **LLM time**                | 28.6 s                                                                       |
| **Tokens**                  | 22 346                                                                       |
| **Paragraphs synced**       | 75 ok, 0 failed                                                              |
| **LLM calls**               | 2 (`complete` + `completeJSON`)                                              |
| **Retries**                 | 0 (`finishReason: stop`)                                                     |
| **pipeline.stage.failed**   | 0                                                                            |
| **Warnings / errors**       | 0 в scope trace                                                              |

### Highlights

- Одна глава из batch job `trl_mqwkmbkj_5pexge` (в job обработано 34 главы, batch #17–50).
- Для debug одной главы — **traceId**, не jobId:
  ```bash
  curl -s "http://localhost:3000/api/debug/agent/context?traceId=e2b4ace6-068e-4ec3-986f-c6721ce9e6d3&includePrompts=0"
  ```

### Notes

- Preset `ai_revivification` («Fix Only») vs `literary` в прогоне 2026-06-26.

---

## Run 2026-06-26 — editing batch (20 ch)

|                           |                                                                     |
| ------------------------- | ------------------------------------------------------------------- |
| **jobId**                 | `trl_mqvj18to_9xonxj`                                               |
| **requestId**             | `ecd0b278-95a2-4432-ad38-0dc6bd0aed61`                              |
| **projectId**             | `57cb0c5f-8f3d-4e74-a1fb-8425d17e1d68`                              |
| **Environment**           | local `dev:full`                                                    |
| **Chapters**              | 20 (project ch. #1–20)                                              |
| **Stages**                | `editing` only                                                      |
| **Mode**                  | async translate job                                                 |
| **Editing model**         | `gpt-5.4-mini`                                                      |
| **Execution**             | `one_shot`, `forceSingleShot: true`, `editingStylePreset: literary` |
| **Started**               | 2026-06-26T22:52:53Z                                                |
| **Completed**             | 2026-06-26T23:05:34Z                                                |
| **Wall time**             | 761 s (~12.7 min)                                                   |
| **Total tokens**          | 502 921                                                             |
| **Tokens / chapter**      | min 22 931 · max 30 297 · avg 25 146                                |
| **LLM time / chapter**    | min 29.9 s · max 40.8 s · avg 33.7 s                                |
| **Paragraphs synced**     | 2 029 ok, 0 failed                                                  |
| **LLM calls / chapter**   | 2 (`complete` + `completeJSON`)                                     |
| **Retries**               | 0 (all `finishReason: stop`)                                        |
| **pipeline.stage.failed** | 0                                                                   |
| **Warnings / errors**     | 0 в scope job                                                       |

### Highlights

- **Самая дорогая глава:** project ch. #3 (source title «塔罗会») — 30 297 tokens, 40.8 s.
- **Самая быстрая:** project ch. #10 — 22 931 tokens, 29.9 s.
- **Overhead между главами:** ~1.5–3 s (paragraph sync + token usage).
- **Последовательная обработка:** параллелизма в batch нет.

### Outliers / infra notes

- Debug buffer LLM captures: только последние ~10 глав (cap 20 prompts) — для полного аудита `DEBUG_PERSIST=1`.
- `lastError` в status вне job: `GET /user/token-usage 503` (раньше по времени).

### Per-chapter (tokens, LLM duration)

| Project ch | Tokens | LLM s |
| ---------- | ------ | ----- |
| 1          | 25 125 | 34.3  |
| 2          | 24 575 | 34.1  |
| 3          | 30 297 | 40.8  |
| 4          | 22 937 | 33.0  |
| 5          | 24 570 | 34.7  |
| 6          | 24 820 | 36.0  |
| 7          | 25 292 | 32.2  |
| 8          | 24 004 | 32.8  |
| 9          | 22 994 | 35.3  |
| 10         | 22 931 | 29.9  |
| 11         | 24 828 | 32.1  |
| 12         | 22 940 | 36.0  |
| 13         | 27 558 | 36.6  |
| 14         | 25 065 | 34.5  |
| 15         | 24 743 | 31.0  |
| 16         | 24 709 | 31.4  |
| 17         | 26 159 | 32.2  |
| 18         | 26 472 | 33.2  |
| 19         | 25 075 | 31.5  |
| 20         | 27 827 | 32.3  |
