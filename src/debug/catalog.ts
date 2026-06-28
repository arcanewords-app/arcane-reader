/**
 * Static catalog of translation-related debug events for agents.
 */

export interface DebugCatalogEvent {
  event: string;
  description: string;
  exampleQuery: string;
}

export const DEBUG_TRANSLATION_EVENTS: DebugCatalogEvent[] = [
  {
    event: 'translate.job.enqueued',
    description: 'Async translate batch queued (API)',
    exampleQuery: '/api/debug/query?kind=logs&event=translate.job.enqueued',
  },
  {
    event: 'analysis.job.enqueued',
    description: 'Async analysis batch queued (API)',
    exampleQuery: '/api/debug/query?kind=logs&event=analysis.job.enqueued',
  },
  {
    event: 'job.started',
    description: 'BullMQ worker started processing a job',
    exampleQuery: '/api/debug/query?kind=logs&event=job.started',
  },
  {
    event: 'job.completed',
    description: 'BullMQ worker finished a job',
    exampleQuery: '/api/debug/query?kind=logs&event=job.completed',
  },
  {
    event: 'translation.started',
    description: 'Sync single-chapter translate route entered',
    exampleQuery: '/api/debug/query?kind=logs&event=translation.started',
  },
  {
    event: 'translation.perform_start',
    description: 'performTranslation() began',
    exampleQuery: '/api/debug/query?kind=logs&event=translation.perform_start',
  },
  {
    event: 'pipeline.start',
    description: 'Engine pipeline invoked',
    exampleQuery: '/api/debug/query?kind=logs&event=pipeline.start',
  },
  {
    event: 'pipeline.stage.started',
    description: 'Analyze / translate / edit stage started',
    exampleQuery: '/api/debug/query?kind=logs&event=pipeline.stage.started',
  },
  {
    event: 'pipeline.stage.completed',
    description: 'Pipeline stage finished successfully',
    exampleQuery: '/api/debug/query?kind=logs&event=pipeline.stage.completed',
  },
  {
    event: 'pipeline.stage.failed',
    description: 'Pipeline stage failed',
    exampleQuery: '/api/debug/query?kind=logs&event=pipeline.stage.failed&errorsOnly=1',
  },
  {
    event: 'translation.chunk_progress',
    description: 'Chunk translation progress (start/complete per chapter)',
    exampleQuery: '/api/debug/query?kind=logs&event=translation.chunk_progress',
  },
  {
    event: 'translation.completed',
    description: 'Chapter translation finished',
    exampleQuery: '/api/debug/query?kind=logs&event=translation.completed',
  },
  {
    event: 'translation.incomplete',
    description: 'Translation ended without full completion',
    exampleQuery: '/api/debug/query?kind=logs&event=translation.incomplete',
  },
  {
    event: 'worker.started',
    description: 'BullMQ worker process ready',
    exampleQuery: '/api/debug/query?kind=logs&event=worker.started&process=worker',
  },
];

export function getDebugCatalog() {
  return {
    events: DEBUG_TRANSLATION_EVENTS,
    correlationFields: ['traceId', 'jobId', 'requestId', 'chapterId', 'projectId', 'stage'],
    timeFilters: {
      last: 'Relative window: 30m, 1h, 2h (default for unscoped), 6h, 24h',
      since: 'ISO timestamp lower bound',
      until: 'ISO timestamp upper bound',
      example: '/api/debug/query?kind=logs&last=2h&compact=1',
    },
    agentEndpoints: [
      { path: '/api/debug/status', description: 'Buffer counts, window stats, last error' },
      {
        path: '/api/debug/agent/context',
        description: 'Markdown context for jobId/traceId/requestId; prefer traceId for one chapter',
      },
      { path: '/api/debug/query', description: 'Filtered JSON query (last/since/until, dedupe)' },
      { path: '/api/debug/jobs/:jobId', description: 'Async job aggregate (JSON)' },
    ],
    workflows: {
      syncTranslate: 'Response JSON includes traceId → /api/debug/agent/context?traceId=...',
      asyncTranslate:
        '202 response includes jobId; one chapter → traceId from translation.completed log',
      singleChapter:
        '/api/debug/agent/context?traceId=UUID&includePrompts=0 (not jobId for one chapter)',
      recentLogs: '/api/debug/query?kind=logs&last=2h&compact=1&limit=100',
    },
  };
}
