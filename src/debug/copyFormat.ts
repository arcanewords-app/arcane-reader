/**
 * Format debug log entries for copy-paste into Cursor / agents.
 */

import type { DebugLogEntry } from './buffer.js';

const PAYLOAD_OMIT = ['time', 'level', 'msg'];

function omitPayload(entry: DebugLogEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(entry)) {
    if (!PAYLOAD_OMIT.includes(k)) out[k] = entry[k];
  }
  return out;
}

function formatEntryLine(entry: DebugLogEntry): string {
  const payload = omitPayload(entry);
  const payloadStr =
    Object.keys(payload).length > 0 ? `\n  ${JSON.stringify(payload, null, 2)}` : '';
  return `[${entry.time ?? ''}] ${String(entry.level ?? '').toUpperCase()} ${entry.msg ?? ''}${payloadStr}`;
}

const EVENT_CODE_HINTS: Record<string, string[]> = {
  'pipeline.start': ['src/engine/pipeline/translation-pipeline.ts', 'src/server.ts'],
  'translation.started': ['src/server.ts'],
  'translation.completed': ['src/server.ts', 'src/services/engine-integration.ts'],
  'translation.perform_start': ['src/server.ts'],
  'http.request': ['src/middleware/requestContext.ts'],
};

function codeHintsForEntries(entries: DebugLogEntry[]): string[] {
  const hints = new Set<string>(['docs/02-how-to/debug-translation.md', 'src/debug/']);
  for (const e of entries) {
    const event = typeof e.event === 'string' ? e.event : '';
    if (event && EVENT_CODE_HINTS[event]) {
      for (const h of EVENT_CODE_HINTS[event]) hints.add(h);
    }
    const msg = String(e.msg ?? '');
    if (msg.includes('TranslateStage')) hints.add('src/engine/stages/stage-2-translate.ts');
    if (msg.includes('AnalyzeStage')) hints.add('src/engine/stages/stage-1-analyze.ts');
    if (msg.includes('EditStage')) hints.add('src/engine/stages/stage-3-edit.ts');
    if (msg.includes('Pipeline:')) hints.add('src/engine/pipeline/translation-pipeline.ts');
  }
  return [...hints];
}

export function formatEntryMarkdown(entry: DebugLogEntry): string {
  return formatEntryLine(entry);
}

export function formatEntriesMarkdown(entries: DebugLogEntry[], title: string): string {
  if (entries.length === 0) return `${title}\n\n(no entries)\n`;

  const first = entries[0];
  const traceId = first.traceId ?? first.jobId ?? first.requestId;
  const errors = entries.filter((e) => e.level === 'error' || e.level === 'fatal');
  const warns = entries.filter((e) => e.level === 'warn');

  const lines: string[] = [
    `## ${title}`,
    '',
    '### Context',
    `- traceId: ${traceId ?? '—'}`,
    `- projectId: ${first.projectId ?? '—'}`,
    `- chapterId: ${first.chapterId ?? '—'}`,
    `- jobId: ${first.jobId ?? '—'}`,
    `- requestId: ${first.requestId ?? '—'}`,
    `- entries: ${entries.length}`,
    '',
    '### Timeline (newest first)',
    '',
    ...[...entries].reverse().map(formatEntryLine),
  ];

  if (errors.length > 0) {
    lines.push('', '### Errors', '');
    lines.push(...errors.map(formatEntryLine));
  }
  if (warns.length > 0 && warns.length <= 20) {
    lines.push('', '### Warnings', '');
    lines.push(...warns.slice(-10).map(formatEntryLine));
  }

  lines.push('', '### Relevant code', '');
  for (const h of codeHintsForEntries(entries)) {
    lines.push(`- ${h}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function formatEntriesJson(entries: DebugLogEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export function formatForCursor(entries: DebugLogEntry[]): string {
  return formatEntriesMarkdown(entries, 'Arcane debug context (for Cursor agent)');
}
