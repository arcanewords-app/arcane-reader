# CSV Pattern Replacement

Скрипт для оборачивания паттернов в CSV-файлах в теги блоков (system-message, note и т.д.).

**Папки:**

- `scripts/input-files/` — исходные CSV (в пакетном режиме)
- `scripts/output/` — обработанные файлы (создаётся автоматически)

## Использование

```bash
# Пакетный режим: все CSV из scripts/input-files → scripts/output
npm run csv-patterns

# С флагом --html
npx tsx scripts/csv-pattern-replace.ts --html

# Один файл (результат в input.out.csv)
npx tsx scripts/csv-pattern-replace.ts input.csv

# Указать выходной файл
npx tsx scripts/csv-pattern-replace.ts input.csv output.csv

# HTML-теги вместо маркеров (для EPUB/прямого вывода)
npx tsx scripts/csv-pattern-replace.ts input.csv output.csv --html

# Свой конфиг
npx tsx scripts/csv-pattern-replace.ts input.csv --config=my-patterns.json
```

## Форматы вывода

- **block-markers** (по умолчанию): `{{block:system-message}}...{{/block:system-message}}` — для пайплайна перевода
- **html** (флаг `--html`): `<aside class="system-message">...</aside>` — для экспорта

## Конфигурация

Файл `csv-pattern-config.json`:

- **blockTypes** — типы блоков (system-message, note) с htmlTag и cssClass
- **patterns** — правила: regex → blockType

Пресеты соответствуют проекту:

- `system-message` → `<aside class="system-message">` (статы, уровни, уведомления)
- `note` → `<section class="note">` (письма, записки, тексты книг)

## Примеры паттернов

| Паттерн                      | Описание                                 |
| ---------------------------- | ---------------------------------------- |
| `[Система] ...`              | Системные сообщения в квадратных скобках |
| `【...】...`                 | CJK-скобки (китайский/японский стиль)    |
| `Дорогой...`, `Уважаемый...` | Начала писем                             |

Добавляйте свои regex в `patterns` в конфиге.
