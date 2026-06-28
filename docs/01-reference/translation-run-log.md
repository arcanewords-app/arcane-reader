---
type: reference
status: active
domain: engine
stale: false
created: 2026-06-26
updated: 2026-06-29
tags:
  - translation
  - benchmark
  - debug
---

# Translation run log

Журнал локальных и staging прогонов пайплайна (analyze / translate / edit). Используем для сравнения стоимости, скорости и стабильности между версиями engine, моделями и настройками проекта.

**Источник данных:** [[02-how-to/debug-translation]] → `GET /api/debug/status`, `GET /api/debug/agent/context?traceId=...`. Prod — [[02-how-to/observability-axiom]].

Детальные Run-секции — в файлах проектов: [[translation-runs/zenith-sorcery]].

---

## Project registry

| projectId                              | Name             | Pair  | Log file                            |
| -------------------------------------- | ---------------- | ----- | ----------------------------------- |
| `57cb0c5f-8f3d-4e74-a1fb-8425d17e1d68` | Зенит Колдовства | en→ru | [[translation-runs/zenith-sorcery]] |

Новый проект: добавить строку сюда и создать `translation-runs/<slug>.md`.

---

## Summary (all projects)

| Date       | Project                                               | Pair  | Stages  | Ch  | Proj ch | Mode  | Model (edit) | Tokens total | Tokens/ch | Wall / LLM       | Err | Correlation                         | Notes                       |
| ---------- | ----------------------------------------------------- | ----- | ------- | --- | ------- | ----- | ------------ | ------------ | --------- | ---------------- | --- | ----------------------------------- | --------------------------- |
| 2026-06-27 | [[translation-runs/zenith-sorcery\|Зенит Колдовства]] | en→ru | editing | 1   | 34      | async | gpt-5.4-mini | 22 346       | 22 346    | 28.6 s           | 0   | `e2b4ace6…` / `trl_mqwkmbkj_5pexge` | one_shot, ai_revivification |
| 2026-06-26 | [[translation-runs/zenith-sorcery\|Зенит Колдовства]] | en→ru | editing | 20  | 1–20    | async | gpt-5.4-mini | 502 921      | 25 146    | 12.7 min / ~34 s | 0   | `trl_mqvj18to_9xonxj`               | one_shot, literary          |

---

## Как добавлять запись

1. После прогона определить **projectId** и **корреляцию**:
   - **Одна глава** → `traceId` из `translation.completed` (предпочтительно).
   - **Весь async batch** → `jobId` (`trl_*` / `ana_*`).
2. Снять snapshot:
   ```bash
   curl -s "http://localhost:3000/api/debug/status"
   # одна глава
   curl -s "http://localhost:3000/api/debug/agent/context?traceId=TRACE_ID&includePrompts=0"
   # весь job (много глав)
   curl -s "http://localhost:3000/api/debug/agent/context?jobId=JOB_ID&includePrompts=0&detail=1"
   ```
3. Найти или создать файл в `translation-runs/<slug>.md`; добавить строку в registry (если новый проект).
4. Добавить строку в **Summary** выше (новые сверху).
5. Добавить секцию **Run …** в файл проекта.
6. Обновить `updated` в frontmatter индекса и файла проекта.

### Нумерация

| Термин           | Источник                                                |
| ---------------- | ------------------------------------------------------- |
| **Project ch**   | `chapterNumber` в логах / API                           |
| **jobId**        | Async batch (`trl_*`)                                   |
| **traceId**      | Одна глава (UUID)                                       |
| **Source title** | `chapterTitle` в логах — metadata импорта, не lang pair |

### Поля Summary

| Колонка                  | Описание                                         |
| ------------------------ | ------------------------------------------------ |
| Date                     | UTC дата завершения                              |
| Project                  | Ссылка на файл проекта                           |
| Pair                     | `en→ru`, `zh→ru` — из настроек проекта           |
| Stages                   | `analysis`, `translation`, `editing`, комбинации |
| Ch                       | Число глав в записи (1 или batch)                |
| Proj ch                  | Номер(а) глав в проекте                          |
| Mode                     | `sync` / `async`                                 |
| Model (edit)             | Модель editing                                   |
| Tokens total / Tokens/ch | Сумма и среднее                                  |
| Wall / LLM               | Wall time job или LLM time на главу              |
| Correlation              | `traceId` и/или `jobId`                          |
| Notes                    | preset, комментарий                              |

### Debug: окно по времени

Для общих запросов без `jobId`/`traceId` API по умолчанию отдаёт логи за **последние 2 ч** (`last=2h`):

```bash
curl -s "http://localhost:3000/api/debug/query?kind=logs&last=2h&compact=1&limit=100"
```

См. [[02-how-to/debug-translation]] и `@.cursor/skills/debug-local/SKILL.md`.

---

## Run template

```markdown
## Run YYYY-MM-DD — <short title>

|                  |                                  |
| ---------------- | -------------------------------- |
| **traceId**      | (single chapter)                 |
| **jobId**        | (batch)                          |
| **projectId**    |                                  |
| **Project ch**   |                                  |
| **Environment**  | local / staging                  |
| **Stages**       |                                  |
| **Mode**         | sync / async                     |
| **Models**       | analysis / translation / editing |
| **LLM time**     |                                  |
| **Total tokens** |                                  |
| **Errors**       |                                  |

### Highlights

-

### Notes

-
```
