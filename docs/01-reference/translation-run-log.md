---
type: reference
status: active
domain: engine
stale: false
created: 2026-06-26
updated: 2026-06-26
tags:
  - translation
  - benchmark
  - debug
---

# Translation run log

Журнал локальных и staging прогонов пайплайна (analyze / translate / edit). Используем для сравнения стоимости, скорости и стабильности между версиями engine, моделями и настройками проекта.

**Источник данных:** [[02-how-to/debug-translation]] → `GET /api/debug/status`, `GET /api/debug/agent/context?jobId=...`. Prod — [[02-how-to/observability-axiom]].

## Как добавлять запись

1. После прогона скопировать `jobId` (async) или `traceId` (sync) из ответа API / UI.
2. Снять snapshot:
   ```bash
   curl -s "http://localhost:3000/api/debug/status"
   curl -s "http://localhost:3000/api/debug/agent/context?jobId=JOB_ID&includePrompts=0"
   ```
3. Добавить строку в **сводную таблицу** (новые записи сверху).
4. Добавить секцию **Run …** ниже по шаблону.
5. Обновить `updated` в frontmatter.

### Поля сводной таблицы

| Колонка      | Описание                                                |
| ------------ | ------------------------------------------------------- |
| Date         | UTC дата завершения                                     |
| Project      | Название / slug проекта                                 |
| Stages       | `analysis`, `translation`, `editing`, `all`, комбинации |
| Chapters     | Число глав в batch                                      |
| Mode         | `sync` / `async`                                        |
| Model (edit) | Модель editing (если применимо)                         |
| Tokens total | Сумма по job                                            |
| Tokens/ch    | Среднее на главу                                        |
| Wall time    | Полное время job                                        |
| LLM time/ch  | Среднее время editing/translate на главу                |
| Errors       | 0 или кратко                                            |
| jobId        | `trl_*` / `ana_*` для корреляции                        |
| Notes        | Версия, preset, комментарий                             |

---

## Summary

| Date       | Project                   | Stages  | Ch  | Mode  | Model (edit) | Tokens total | Tokens/ch | Wall     | LLM/ch | Err | jobId                 | Notes                           |
| ---------- | ------------------------- | ------- | --- | ----- | ------------ | ------------ | --------- | -------- | ------ | --- | --------------------- | ------------------------------- |
| 2026-06-26 | Lord of Mysteries (zh→ru) | editing | 20  | async | gpt-5.4-mini | 502 921      | 25 146    | 12.7 min | ~34 s  | 0   | `trl_mqvj18to_9xonxj` | one_shot, literary; gl. 148–167 |

---

## Run 2026-06-26 — editing batch (20 ch)

|                           |                                                                     |
| ------------------------- | ------------------------------------------------------------------- |
| **jobId**                 | `trl_mqvj18to_9xonxj`                                               |
| **requestId**             | `ecd0b278-95a2-4432-ad38-0dc6bd0aed61`                              |
| **projectId**             | `57cb0c5f-8f3d-4e74-a1fb-8425d17e1d68`                              |
| **Environment**           | local `dev:full`                                                    |
| **Chapters**              | 20 (batch #1–20; книга гл. 148–167)                                 |
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

- **Самая дорогая глава:** batch #3 (гл. 150 «塔罗会») — 30 297 tokens, 40.8 s, source 9 894 chars.
- **Самая быстрая:** batch #10 (гл. 157) — 22 931 tokens, 29.9 s.
- **Overhead между главами:** ~1.5–3 s (paragraph sync + token usage).
- **Последовательная обработка:** параллелизма в batch нет.

### Outliers / infra notes

- Debug buffer LLM captures: только последние ~10 глав (cap 20 prompts) — для полного аудита включать `DEBUG_PERSIST=1`.
- `lastError` в status вне job: `GET /user/token-usage 503` (раньше по времени).

### Per-chapter (tokens, LLM duration)

| Batch # | Book ch | Tokens | LLM s |
| ------- | ------- | ------ | ----- |
| 1       | 148     | 25 125 | 34.3  |
| 2       | 149     | 24 575 | 34.1  |
| 3       | 150     | 30 297 | 40.8  |
| 4       | 151     | 22 937 | 33.0  |
| 5       | 152     | 24 570 | 34.7  |
| 6       | 153     | 24 820 | 36.0  |
| 7       | 154     | 25 292 | 32.2  |
| 8       | 155     | 24 004 | 32.8  |
| 9       | 156     | 22 994 | 35.3  |
| 10      | 157     | 22 931 | 29.9  |
| 11      | 158     | 24 828 | 32.1  |
| 12      | 159     | 22 940 | 36.0  |
| 13      | 160     | 27 558 | 36.6  |
| 14      | 161     | 25 065 | 34.5  |
| 15      | 162     | 24 743 | 31.0  |
| 16      | 163     | 24 709 | 31.4  |
| 17      | 164     | 26 159 | 32.2  |
| 18      | 165     | 26 472 | 33.2  |
| 19      | 166     | 25 075 | 31.5  |
| 20      | 167     | 27 827 | 32.3  |

### Template for next run

```markdown
## Run YYYY-MM-DD — <short title>

|                  |                                  |
| ---------------- | -------------------------------- |
| **jobId**        |                                  |
| **projectId**    |                                  |
| **Environment**  | local / staging                  |
| **Chapters**     |                                  |
| **Stages**       |                                  |
| **Mode**         | sync / async                     |
| **Models**       | analysis / translation / editing |
| **Wall time**    |                                  |
| **Total tokens** |                                  |
| **Errors**       |                                  |

### Highlights

-

### Notes

-
```
