/**
 * CSV parser module
 * Supports formats:
 * - title,text (each row = one chapter)
 * - text only (content, body) — title auto-generated as "Глава N"
 * - single column — each row = chapter
 * - no header — each row = chapter, last column = content
 * RFC 4180: multiline fields in quotes, escaped double quotes
 */

import { parse } from 'csv-parse/sync';
import type { ParseResult } from './types.js';

const TEXT_COLUMN_ALIASES = ['text', 'content', 'body', 'chapter'];

function buildChaptersFromRecords(
  records: Record<string, string>[],
  getTitle: (record: Record<string, string>, index: number) => string,
  getContent: (record: Record<string, string>) => string
): { chapters: ParseResult['chapters']; skipped: number } {
  const chapters: ParseResult['chapters'] = [];
  let skipped = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const content = getContent(record);
    if (!content.trim()) {
      skipped++;
      continue;
    }
    chapters.push({
      title: getTitle(record, i) || `Глава ${chapters.length + 1}`,
      number: chapters.length + 1,
      content: content.trim(),
    });
  }
  return { chapters, skipped };
}

/**
 * Parse CSV file. Supports multiple formats:
 * 1. title,text (standard)
 * 2. text/content/body only (title = "Глава N")
 * 3. single column (any name)
 * 4. no header (columns: false, last column = content)
 */
export async function parseCsv(fileBuffer: Buffer): Promise<ParseResult> {
  const raw = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
  const warnings: string[] = [];

  let records: Record<string, string>[];
  try {
    records = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'CSV parse error';
    return {
      format: 'csv',
      metadata: {},
      chapters: [],
      errors: [`Ошибка парсинга CSV: ${msg}`],
      warnings,
    };
  }

  if (records.length === 0) {
    return {
      format: 'csv',
      metadata: {},
      chapters: [],
      errors: ['CSV файл не содержит данных (только заголовок или пустой)'],
      warnings,
    };
  }

  const firstKeys = Object.keys(records[0] || {});
  const hasTitle = firstKeys.some((k) => k.toLowerCase() === 'title');
  const hasText = firstKeys.some((k) => k.toLowerCase() === 'text');

  // 1. Standard format: title + text
  if (hasTitle && hasText) {
    const { chapters, skipped } = buildChaptersFromRecords(
      records,
      (r) => String(r.title ?? r.Title ?? '').trim(),
      (r) => String(r.text ?? r.Text ?? '')
    );
    if (skipped > 0) warnings.push(`Пропущено ${skipped} строк с пустым текстом`);
    if (chapters.length === 0) {
      return {
        format: 'csv',
        metadata: {},
        chapters: [],
        errors: ['Не найдено ни одной главы с непустым текстом'],
        warnings,
      };
    }
    return { format: 'csv', metadata: {}, chapters, warnings: warnings.length > 0 ? warnings : undefined };
  }

  // 2. Text-only: text, content, or body (optional title)
  const textColKey = firstKeys.find((k) => TEXT_COLUMN_ALIASES.includes(k.toLowerCase()));
  if (textColKey) {
    const useTitle = hasTitle;
    const { chapters, skipped } = buildChaptersFromRecords(
      records,
      useTitle ? (r) => String(r.title ?? r.Title ?? '').trim() : () => '',
      (r) => String(r[textColKey] ?? '')
    );
    if (skipped > 0) warnings.push(`Пропущено ${skipped} строк с пустым текстом`);
    if (chapters.length === 0) {
      return {
        format: 'csv',
        metadata: {},
        chapters: [],
        errors: ['Не найдено ни одной главы с непустым текстом'],
        warnings,
      };
    }
    warnings.push(`Использован формат без колонки title (колонка: ${textColKey})`);
    return { format: 'csv', metadata: {}, chapters, warnings };
  }

  // 3. Single column (any name)
  if (firstKeys.length === 1) {
    const colKey = firstKeys[0];
    const { chapters, skipped } = buildChaptersFromRecords(
      records,
      () => '',
      (r) => String(r[colKey] ?? '')
    );
    if (skipped > 0) warnings.push(`Пропущено ${skipped} строк с пустым текстом`);
    if (chapters.length === 0) {
      return {
        format: 'csv',
        metadata: {},
        chapters: [],
        errors: ['Не найдено ни одной главы с непустым текстом'],
        warnings,
      };
    }
    warnings.push(`Использована одна колонка (${colKey})`);
    return { format: 'csv', metadata: {}, chapters, warnings };
  }

  // 4. No header — first row may be data; try columns: false
  try {
    const rows = parse(raw, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    }) as string[][];

    if (rows.length === 0) {
      return {
        format: 'csv',
        metadata: {},
        chapters: [],
        errors: ['CSV файл не содержит данных'],
        warnings,
      };
    }

    const chapters: ParseResult['chapters'] = [];
    let skipped = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length === 0) {
        skipped++;
        continue;
      }
      const content = String(row[row.length - 1] ?? '').trim();
      if (!content) {
        skipped++;
        continue;
      }
      const title =
        row.length >= 2 ? String(row[row.length - 2] ?? '').trim() : `Глава ${chapters.length + 1}`;
      chapters.push({
        title: title || `Глава ${chapters.length + 1}`,
        number: chapters.length + 1,
        content,
      });
    }

    if (skipped > 0) warnings.push(`Пропущено ${skipped} строк с пустым текстом`);
    if (chapters.length === 0) {
      return {
        format: 'csv',
        metadata: {},
        chapters: [],
        errors: ['Не найдено ни одной главы с непустым текстом'],
        warnings,
      };
    }
    warnings.push('Использован формат без заголовка (последняя колонка = текст)');
    return { format: 'csv', metadata: {}, chapters, warnings };
  } catch (noHeaderErr) {
    const msg = noHeaderErr instanceof Error ? noHeaderErr.message : 'Parse error';
    return {
      format: 'csv',
      metadata: {},
      chapters: [],
      errors: [
        `Не удалось распознать формат CSV. Ожидаются колонки title, text или text/content/body. Ошибка: ${msg}`,
      ],
      warnings,
    };
  }
}
