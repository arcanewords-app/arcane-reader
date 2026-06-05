import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { DebugTraceSummary, TraceDetailResponse } from '@debug/shared/types';
import { LEVEL_COLORS } from '@debug/shared/types';
import {
  formatEntryMarkdown,
  formatHttpExchangeMarkdown,
  formatHttpUpstream,
  formatLlmCaptureMarkdown,
  omitLogPayload,
} from '@debug/shared/copyFormat';
import { exportDebug, fetchTraceDetail, fetchTraces } from '../api/client';
import { PageToolbar } from '../components/layout/PageToolbar';
import { DbgButton } from '../components/ui/DbgButton';
import { DbgBadge, Toast } from '../components/ui/index';
import {
  CollapsibleJson,
  DbgTable,
  httpStatusClass,
  type DbgTableColumn,
} from '../components/ui/DbgTable';
import { useClipboard, useDebugFetch } from '../hooks';

interface TracesPanelProps {
  active: boolean;
  selectedTraceId: string | null;
  onSelectTrace: (traceId: string) => void;
  onFilterLogs: (traceId: string) => void;
}

export function TracesPanel({
  active,
  selectedTraceId,
  onSelectTrace,
  onFilterLogs,
}: TracesPanelProps) {
  const { copyText, toast } = useClipboard();
  const [traceDetail, setTraceDetail] = useState<TraceDetailResponse | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [expandedPayloads, setExpandedPayloads] = useState<Set<number>>(new Set());

  const { data, refresh } = useDebugFetch(fetchTraces, []);
  const traces = data?.traces ?? [];

  const loadDetail = useCallback(async (traceId: string) => {
    const detail = await fetchTraceDetail(traceId);
    setTraceDetail(detail);
    setExpandedPayloads(new Set());
    setExpandAll(false);
  }, []);

  useEffect(() => {
    if (selectedTraceId && active) {
      void loadDetail(selectedTraceId);
    }
  }, [selectedTraceId, active, loadDetail]);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  const listColumns: DbgTableColumn<DebugTraceSummary>[] = [
    {
      key: 'id',
      header: 'Trace',
      render: (t) => (
        <>
          <strong>{t.traceId.slice(0, 8)}…</strong>
          {t.errorCount ? <span class="dbg-status-err"> {t.errorCount} err</span> : null}
        </>
      ),
    },
    {
      key: 'msg',
      header: 'Last message',
      render: (t) => {
        const label =
          (t.chapterId ? `${t.chapterId.slice(0, 8)}… ` : '') +
          (t.lastMsg ?? t.traceId).slice(0, 60);
        return label;
      },
    },
    {
      key: 'time',
      header: 'Time',
      render: (t) => <span class="dbg-time">{t.lastTime}</span>,
    },
    {
      key: 'count',
      header: 'Entries',
      render: (t) => String(t.entryCount),
    },
  ];

  const sortedEntries = useMemo(() => {
    if (!traceDetail) return [];
    return [...traceDetail.entries].sort((a, b) =>
      String(a.time ?? '').localeCompare(String(b.time ?? ''))
    );
  }, [traceDetail]);

  const waterfallMeta = useMemo(() => {
    if (!sortedEntries.length || !traceDetail) {
      return { firstMs: 0, totalMs: 1 };
    }
    const firstMs = new Date(String(sortedEntries[0].time)).getTime();
    const totalMs = traceDetail.summary.durationMs || 1;
    return { firstMs, totalMs };
  }, [sortedEntries, traceDetail]);

  const togglePayload = (wi: number) => {
    setExpandedPayloads((prev) => {
      const next = new Set(prev);
      if (next.has(wi)) next.delete(wi);
      else next.add(wi);
      return next;
    });
  };

  const handleExpandAll = () => {
    if (!sortedEntries.length) return;
    if (expandAll) {
      setExpandedPayloads(new Set());
      setExpandAll(false);
    } else {
      setExpandedPayloads(new Set(sortedEntries.map((_, i) => i)));
      setExpandAll(true);
    }
  };

  const hasSelection = Boolean(selectedTraceId && traceDetail);

  return (
    <>
      <PageToolbar>
        <DbgButton onClick={() => void refresh()}>Refresh traces</DbgButton>
        <DbgButton
          variant="primary"
          disabled={!hasSelection}
          onClick={() => {
            if (!selectedTraceId) return;
            void exportDebug({ format: 'trace', traceId: selectedTraceId }).then(copyText);
          }}
        >
          Copy for Cursor
        </DbgButton>
        <DbgButton
          disabled={!hasSelection}
          onClick={() => {
            if (traceDetail) void copyText(JSON.stringify(traceDetail, null, 2));
          }}
        >
          Copy JSON
        </DbgButton>
        <DbgButton
          disabled={!selectedTraceId}
          onClick={() => {
            if (selectedTraceId) void copyText(selectedTraceId);
          }}
        >
          Copy traceId
        </DbgButton>
        <DbgButton
          disabled={!selectedTraceId}
          onClick={() => {
            if (selectedTraceId) onFilterLogs(selectedTraceId);
          }}
        >
          Filter logs
        </DbgButton>
        <DbgButton disabled={!hasSelection} onClick={handleExpandAll}>
          {expandAll ? 'Collapse all' : 'Expand all'}
        </DbgButton>
      </PageToolbar>

      <div class="dbg-split">
        <div class="dbg-split-side">
          <DbgTable
            columns={listColumns}
            rows={traces}
            rowKey={(t) => t.traceId}
            selectedKey={selectedTraceId}
            onRowClick={(t) => {
              onSelectTrace(t.traceId);
              void loadDetail(t.traceId);
            }}
            emptyMessage="No traces yet."
          />
        </div>
        <div class="dbg-split-main dbg-trace-detail">
          {!traceDetail ? (
            <p class="dbg-empty-state">Select a trace to view details.</p>
          ) : (
            <>
              <h3>Trace {traceDetail.traceId}</h3>
              <div class="dbg-trace-summary">
                duration: {traceDetail.summary.durationMs}ms · entries:{' '}
                {traceDetail.summary.entryCount} · errors: {traceDetail.summary.errorCount} · warns:{' '}
                {traceDetail.summary.warnCount}
                {traceDetail.summary.totalLlmTokens
                  ? ` · LLM tokens: ${traceDetail.summary.totalLlmTokens}`
                  : ''}
                {traceDetail.summary.stages.length
                  ? ` · stages: ${traceDetail.summary.stages.join(', ')}`
                  : ''}
              </div>

              {traceDetail.httpExchanges.length > 0 ? (
                <TraceHttpSection exchanges={traceDetail.httpExchanges} copyText={copyText} />
              ) : null}

              {traceDetail.llmCaptures.length > 0 ? (
                <TraceLlmSection captures={traceDetail.llmCaptures} copyText={copyText} />
              ) : null}

              <h4 class="dbg-section-title">Waterfall</h4>
              {sortedEntries.map((e, wi) => {
                const tMs = new Date(String(e.time)).getTime();
                const offset = waterfallMeta.firstMs ? Math.max(0, tMs - waterfallMeta.firstMs) : 0;
                const widthPct = Math.max(2, Math.round((offset / waterfallMeta.totalMs) * 100));
                const payload = JSON.stringify(omitLogPayload(e), null, 2);
                return (
                  <div key={wi} class="dbg-waterfall-row">
                    <div class="dbg-waterfall-bar-wrap">
                      <div class="dbg-waterfall-bar" style={{ width: `${widthPct}%` }} />
                    </div>
                    <div class="dbg-waterfall-content">
                      <span class="dbg-time">+{offset}ms</span>{' '}
                      <span
                        class="dbg-level"
                        style={{ color: LEVEL_COLORS[e.level] ?? 'var(--dbg-muted)' }}
                      >
                        {e.level}
                      </span>{' '}
                      {e.event ? <DbgBadge>{String(e.event)}</DbgBadge> : null} {e.msg ?? ''}
                      <div class="dbg-row-actions">
                        <DbgButton onClick={() => void copyText(formatEntryMarkdown(e))}>
                          Copy row
                        </DbgButton>
                      </div>
                      <CollapsibleJson
                        data={payload}
                        expanded={expandedPayloads.has(wi)}
                        onToggle={() => togglePayload(wi)}
                      />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}

function TraceHttpSection({
  exchanges,
  copyText,
}: {
  exchanges: TraceDetailResponse['httpExchanges'];
  copyText: (text: string) => Promise<void>;
}) {
  const columns: DbgTableColumn<(typeof exchanges)[0]>[] = [
    {
      key: 'req',
      header: 'Request',
      render: (h) => (
        <span class={httpStatusClass(h.statusCode)}>
          {h.method} {h.path} → {h.statusCode}
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (h) => `${h.durationMs}ms`,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (h) => (
        <div class="dbg-row-actions">
          <DbgButton
            onClick={(e) => {
              e.stopPropagation();
              if (h.responsePreview) void copyText(h.responsePreview);
            }}
          >
            Copy response
          </DbgButton>
          <DbgButton
            onClick={(e) => {
              e.stopPropagation();
              void copyText(formatHttpExchangeMarkdown(h));
            }}
          >
            Copy exchange
          </DbgButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <h4 class="dbg-section-title">HTTP ({exchanges.length})</h4>
      <DbgTable
        columns={columns}
        rows={exchanges}
        rowKey={(h) => h.id}
        renderDetail={(h) => {
          const upstream = formatHttpUpstream(h);
          return (
            <div>
              {upstream ? <div class="dbg-status-warn">Upstream: {upstream}</div> : null}
              {h.responsePreview ? <pre class="dbg-pre">{h.responsePreview}</pre> : null}
            </div>
          );
        }}
        emptyMessage=""
      />
    </>
  );
}

function TraceLlmSection({
  captures,
  copyText,
}: {
  captures: TraceDetailResponse['llmCaptures'];
  copyText: (text: string) => Promise<void>;
}) {
  const columns: DbgTableColumn<(typeof captures)[0]>[] = [
    {
      key: 'model',
      header: 'Model',
      render: (c) => c.model,
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (c) => c.stage ?? '—',
    },
    {
      key: 'tokens',
      header: 'Tokens',
      render: (c) => (c.tokens ? String(c.tokens.total) : '—'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => (
        <DbgButton
          onClick={(e) => {
            e.stopPropagation();
            void copyText(formatLlmCaptureMarkdown(c));
          }}
        >
          Copy for agent
        </DbgButton>
      ),
    },
  ];

  return (
    <>
      <h4 class="dbg-section-title">LLM ({captures.length})</h4>
      <DbgTable columns={columns} rows={captures} rowKey={(c) => c.id} emptyMessage="" />
    </>
  );
}
