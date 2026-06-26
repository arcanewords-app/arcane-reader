/**
 * Format debug log entries for copy-paste into Cursor / agents.
 */

import type {
  CapturedHttpExchange,
  CapturedLlmCall,
  DebugLogEntry,
  TraceDetailSummary,
} from './types.js';

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
  'pipeline.stage.started': ['src/engine/pipeline/translation-pipeline.ts'],
  'pipeline.stage.completed': ['src/engine/pipeline/translation-pipeline.ts'],
  'pipeline.stage.failed': ['src/engine/pipeline/translation-pipeline.ts'],
  'translation.started': ['src/server.ts'],
  'translation.completed': ['src/server.ts', 'src/services/engine-integration.ts'],
  'translation.perform_start': ['src/server.ts'],
  'translation.chunk_progress': ['src/server.ts', 'src/engine/stages/stage-2-translate.ts'],
  'translate.job.enqueued': ['src/server.ts', 'src/services/chapterQueue.ts'],
  'analysis.job.enqueued': ['src/server.ts', 'src/services/chapterQueue.ts'],
  'job.started': ['src/services/jobs/runAnalysisJob.ts', 'src/services/jobs/runTranslateJob.ts'],
  'job.completed': ['src/services/jobs/runAnalysisJob.ts', 'src/services/jobs/runTranslateJob.ts'],
  'worker.started': ['src/worker.ts', 'src/services/chapterWorker.ts'],
  'http.request': ['src/middleware/requestContext.ts'],
  'auth.register.failed': ['src/services/authService.ts', 'src/server.ts'],
  'auth.login.failed': ['src/services/authService.ts', 'src/server.ts'],
  'auth.logout.failed': ['src/services/authService.ts', 'src/server.ts'],
  'auth.me.failed': ['src/services/authService.ts', 'src/server.ts'],
  'auth.refresh.failed': ['src/services/authService.ts', 'src/server.ts'],
};

export function getCodeHintsForEntries(entries: DebugLogEntry[]): string[] {
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

export function formatEntriesMarkdown(
  entries: DebugLogEntry[],
  title: string,
  options?: { timelineOrder?: 'asc' | 'desc' }
): string {
  if (entries.length === 0) return `${title}\n\n(no entries)\n`;

  const order = options?.timelineOrder ?? 'desc';
  const timelineLabel = order === 'asc' ? 'oldest first' : 'newest first';
  const sorted =
    order === 'asc'
      ? [...entries].sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')))
      : [...entries].sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? '')));

  const first = sorted[0];
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
    `### Timeline (${timelineLabel})`,
    '',
    ...sorted.map(formatEntryLine),
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
  for (const h of getCodeHintsForEntries(entries)) {
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

export function formatHttpUpstream(h: CapturedHttpExchange): string {
  if (!h.upstreamCode && h.upstreamStatus === undefined && !h.upstreamMessage) return '';
  const parts: string[] = [];
  if (h.upstreamCode) parts.push(`code: ${h.upstreamCode}`);
  if (h.upstreamStatus !== undefined) parts.push(`status: ${h.upstreamStatus}`);
  if (h.upstreamMessage) parts.push(`message: ${h.upstreamMessage}`);
  return parts.join(' · ');
}

export function formatHttpExchangeMarkdown(h: CapturedHttpExchange): string {
  const lines = [
    `## HTTP ${h.method} ${h.path}`,
    '',
    `- status: ${h.statusCode}`,
    `- duration: ${h.durationMs}ms`,
    `- requestId: ${h.requestId}`,
    ...(h.traceId ? [`- traceId: ${h.traceId}`] : []),
    ...(h.error ? [`- error: ${h.error}`] : []),
    ...(h.upstreamCode ? [`- upstreamCode: ${h.upstreamCode}`] : []),
    ...(h.upstreamStatus !== undefined ? [`- upstreamStatus: ${h.upstreamStatus}`] : []),
    ...(h.upstreamMessage ? [`- upstreamMessage: ${h.upstreamMessage}`] : []),
    '',
  ];
  if (h.requestPreview) {
    lines.push('### Request', '', '```json', h.requestPreview, '```', '');
  }
  if (h.responsePreview) {
    lines.push('### Response', '', '```json', h.responsePreview, '```', '');
  }
  return lines.join('\n');
}

export function formatHttpExchangesMarkdown(
  captures: CapturedHttpExchange[],
  title: string
): string {
  if (captures.length === 0) return `${title}\n\n(no captures)\n`;
  return [title, '', ...captures.map(formatHttpExchangeMarkdown)].join('\n');
}

export function formatLlmCaptureMarkdown(c: CapturedLlmCall): string {
  return [
    `## LLM call ${c.model} (${c.method})`,
    '',
    `- traceId: ${c.traceId ?? '—'}`,
    `- stage: ${c.stage ?? '—'}`,
    ...(c.finishReason ? [`- finishReason: ${c.finishReason}`] : []),
    ...(c.reasoningTokens != null ? [`- reasoningTokens: ${c.reasoningTokens}`] : []),
    ...(c.attempt != null ? [`- attempt: ${c.attempt}`] : []),
    ...(c.schemaName ? [`- schemaName: ${c.schemaName}`] : []),
    ...(c.contentLength != null ? [`- contentLength: ${c.contentLength}`] : []),
    ...(c.tokens ? [`- tokens: ${c.tokens.total}`] : []),
    '',
    '### System',
    c.systemPreview,
    '',
    '### User',
    c.userPreview,
    '',
    '### Response',
    c.responsePreview,
    '',
  ].join('\n');
}

export function formatTraceForCursor(params: {
  traceId: string;
  summary: TraceDetailSummary;
  entries: DebugLogEntry[];
  llmCaptures: CapturedLlmCall[];
  httpExchanges: CapturedHttpExchange[];
  timelineOrder?: 'asc' | 'desc';
}): string {
  const { traceId, summary, entries, llmCaptures, httpExchanges, timelineOrder = 'asc' } = params;
  const logMd = formatEntriesMarkdown(entries, `Arcane trace ${traceId} (for Cursor agent)`, {
    timelineOrder,
  });

  const extra: string[] = [];
  if (httpExchanges.length > 0) {
    extra.push(
      '### HTTP exchanges',
      '',
      ...httpExchanges.map((h) =>
        [
          `- ${h.method} ${h.path} → ${h.statusCode} (${h.durationMs}ms)`,
          h.upstreamMessage
            ? `  Upstream: code=${h.upstreamCode ?? '—'} status=${h.upstreamStatus ?? '—'} — ${h.upstreamMessage}`
            : '',
          h.responsePreview ? `  Response: ${h.responsePreview.split('\n')[0]}…` : '',
        ]
          .filter(Boolean)
          .join('\n')
      ),
      ''
    );
  }
  if (llmCaptures.length > 0) {
    extra.push('### LLM calls', '');
    for (const c of llmCaptures) {
      extra.push(formatLlmCaptureMarkdown(c));
    }
  }

  extra.push(
    '### Trace summary',
    '',
    `- durationMs: ${summary.durationMs}`,
    `- errors: ${summary.errorCount}`,
    `- warns: ${summary.warnCount}`,
    `- llmCaptures: ${summary.llmCaptureCount}`,
    `- httpExchanges: ${summary.httpExchangeCount}`,
    ...(summary.totalLlmTokens ? [`- totalLlmTokens: ${summary.totalLlmTokens}`] : []),
    ''
  );

  return logMd + '\n' + extra.join('\n');
}

export function omitLogPayload(entry: DebugLogEntry): Record<string, unknown> {
  return omitPayload(entry);
}
