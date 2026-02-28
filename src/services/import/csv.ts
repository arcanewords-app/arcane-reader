/**
 * CSV parser module
 * Supports format: title,text (each row = one chapter)
 * RFC 4180: multiline fields in quotes, escaped double quotes
 */

import { parse } from 'csv-parse/sync';
import type { ParseResult } from './types.js';

const EXPECTED_COLUMNS = ['title', 'text'];

/**
 * Parse CSV file with header "title,text"
 * Each row becomes a chapter
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

  // Validate header from first record keys
  const firstKeys = Object.keys(records[0] || {});
  const hasTitle = firstKeys.some((k) => k.toLowerCase() === 'title');
  const hasText = firstKeys.some((k) => k.toLowerCase() === 'text');
  if (!hasTitle || !hasText) {
    return {
      format: 'csv',
      metadata: {},
      chapters: [],
      errors: [
        `Ожидаемые колонки: ${EXPECTED_COLUMNS.join(', ')}. Найдено: ${firstKeys.join(', ') || 'пусто'}`,
      ],
      warnings,
    };
  }

  const chapters: ParseResult['chapters'] = [];
  let skipped = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const titleRaw = record.title ?? record.Title ?? '';
    const textRaw = record.text ?? record.Text ?? '';

    const title = String(titleRaw).trim();
    const content = String(textRaw).trim();

    if (!content) {
      skipped++;
      continue;
    }

    chapters.push({
      title: title || `Глава ${chapters.length + 1}`,
      number: chapters.length + 1,
      content,
    });
  }

  if (skipped > 0) {
    warnings.push(`Пропущено ${skipped} строк с пустым текстом`);
  }

  if (chapters.length === 0) {
    return {
      format: 'csv',
      metadata: {},
      chapters: [],
      errors: ['Не найдено ни одной главы с непустым текстом'],
      warnings,
    };
  }

  return {
    format: 'csv',
    metadata: {},
    chapters,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
