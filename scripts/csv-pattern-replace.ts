#!/usr/bin/env npx tsx
/**
 * CSV Pattern Replacement Script
 *
 * Applies pattern-based replacements to text in CSV files.
 * Wraps matched content in block markers ({{block:type}}...{{/block:type}})
 * or HTML tags based on config.
 *
 * Usage:
 *   npx tsx scripts/csv-pattern-replace.ts input.csv [output.csv] [--config=path]
 *
 * Config: scripts/csv-pattern-config.json
 * Uses presets: system-message (aside), note (section)
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

interface BlockTypeConfig {
  htmlTag: string;
  cssClass: string;
  description?: string;
}

interface PatternRule {
  id: string;
  blockType: string;
  pattern: string;
  flags?: string;
  description?: string;
}

interface Config {
  outputFormat?: 'block-markers' | 'html';
  blockTypes: Record<string, BlockTypeConfig>;
  patterns: PatternRule[];
}

function escapeCsvValue(val: string): string {
  if (val.includes('"') || val.includes('\n') || val.includes(',')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function toCsv(records: Record<string, string>[], headers: string[]): string {
  const lines = [headers.join(',')];
  for (const rec of records) {
    const row = headers.map((h) => escapeCsvValue(String(rec[h] ?? '')));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function loadConfig(configPath: string): Config {
  const raw = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw) as Config;
  if (!config.blockTypes || !config.patterns) {
    throw new Error('Config must have blockTypes and patterns');
  }
  return config;
}

function wrapWithBlockMarker(text: string, blockType: string): string {
  return `{{block:${blockType}}}${text}{{/block:${blockType}}}`;
}

function wrapWithHtml(text: string, blockType: string, config: BlockTypeConfig): string {
  const tag = config.htmlTag || 'div';
  const cls = config.cssClass ? ` class="${config.cssClass}"` : '';
  return `<${tag}${cls}>${text}</${tag}>`;
}

/** Convert existing HTML block tags to block markers (for pipeline compatibility) */
function htmlToBlockMarkers(content: string): string {
  const conversions: Array<{ tag: string; cls: string; blockType: string }> = [
    { tag: 'aside', cls: 'system-message', blockType: 'system-message' },
    { tag: 'section', cls: 'note', blockType: 'note' },
    { tag: 'section', cls: 'letter', blockType: 'note' },
    { tag: 'div', cls: 'system-message', blockType: 'system-message' },
    { tag: 'div', cls: 'note', blockType: 'note' },
    { tag: 'div', cls: 'inner-voice', blockType: 'inner-voice' },
  ];
  let result = content;
  for (const { tag, cls, blockType } of conversions) {
    const re = new RegExp(
      `<${tag}[^>]*class\\s*=\\s*["'][^"']*${cls}[^"']*["'][^>]*>([\\s\\S]*?)</${tag}\\s*>`,
      'gi'
    );
    result = result.replace(
      re,
      (_, inner) => `{{block:${blockType}}}${inner}{{/block:${blockType}}}`
    );
  }
  return result;
}

function applyPatterns(content: string, config: Config): string {
  let result = content;

  if (config.outputFormat !== 'html') {
    result = htmlToBlockMarkers(result);
  }

  for (const rule of config.patterns) {
    const blockConfig = config.blockTypes[rule.blockType];
    if (!blockConfig) continue;

    const flags = rule.flags || 'g';
    const regex = new RegExp(rule.pattern, flags);

    result = result.replace(regex, (match) => {
      const trimmed = match.trim();
      if (!trimmed) return match;

      if (config.outputFormat === 'html') {
        return wrapWithHtml(trimmed, rule.blockType, blockConfig);
      }
      return wrapWithBlockMarker(trimmed, rule.blockType);
    });
  }

  return result;
}

function processCsv(
  inputPath: string,
  outputPath: string,
  configPath: string,
  forceHtml?: boolean
): void {
  const config = loadConfig(configPath);
  if (forceHtml) config.outputFormat = 'html';
  const raw = readFileSync(inputPath, 'utf-8').replace(/^\uFEFF/, '');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  const textKeys = ['text', 'Text', 'content', 'Content'];
  const textCol = Object.keys(records[0] || {}).find(
    (k) => textKeys.includes(k) || k.toLowerCase() === 'text'
  );

  if (!textCol) {
    console.error('CSV must have a "text" column');
    process.exit(1);
  }

  let processed = 0;
  for (const record of records) {
    const val = record[textCol];
    if (val && typeof val === 'string') {
      record[textCol] = applyPatterns(val, config);
      processed++;
    }
  }

  const headers = Object.keys(records[0] || {});
  const output = toCsv(records, headers);

  writeFileSync(outputPath, output, 'utf-8');
  console.log(`Processed ${processed} rows. Output: ${outputPath}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configArg = args.find((a) => a.startsWith('--config='));
  const htmlOutput = args.includes('--html');
  const configPath = configArg
    ? resolve(process.cwd(), configArg.replace('--config=', ''))
    : resolve(__dirname, 'csv-pattern-config.json');

  if (!input) {
    console.log(`
CSV Pattern Replacement - wraps text in block markers or HTML tags

Usage:
  npx tsx scripts/csv-pattern-replace.ts input.csv [output.csv] [options]

Options:
  --config=path   Custom config path (default: scripts/csv-pattern-config.json)
  --html          Output HTML tags instead of block markers

Output format:
  block-markers: {{block:system-message}}...{{/block:system-message}}
  html:          <aside class="system-message">...</aside>

Edit csv-pattern-config.json to add/modify patterns.
`);
    process.exit(0);
  }

  const inputPath = resolve(process.cwd(), input);
  const pos = args.indexOf(input);
  const nextArg = args[pos + 1];
  const outputPath =
    nextArg && !nextArg.startsWith('--')
      ? resolve(process.cwd(), nextArg)
      : inputPath.replace(/\.csv$/i, '.out.csv');

  try {
    processCsv(inputPath, outputPath, configPath, htmlOutput);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
