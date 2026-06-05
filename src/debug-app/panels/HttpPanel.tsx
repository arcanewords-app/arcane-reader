import { useCallback, useMemo, useState } from 'preact/hooks';
import type { CapturedHttpExchange } from '@debug/shared/types';
import { SLOW_HTTP_MS } from '@debug/shared/types';
import {
  formatHttpExchangeMarkdown,
  formatHttpExchangesMarkdown,
  formatHttpUpstream,
} from '@debug/shared/copyFormat';
import { clearHttpCaptures, fetchHttpCaptures } from '../api/client';
import { PageToolbar, ToolbarGroup } from '../components/layout/PageToolbar';
import { DbgButton } from '../components/ui/DbgButton';
import { DbgCheckbox, DbgInput, DbgSelect, StatusChip, Toast } from '../components/ui/index';
import { DbgTable, httpStatusClass, type DbgTableColumn } from '../components/ui/DbgTable';
import { useAutoRefresh, useClipboard, useDebugFetch } from '../hooks';

interface HttpPanelProps {
  active: boolean;
  onOpenTrace: (traceId: string) => void;
  onFilterLogsByRequestId: (requestId: string) => void;
}

export function HttpPanel({ active, onOpenTrace, onFilterLogsByRequestId }: HttpPanelProps) {
  const { copyText, showToast, toast } = useClipboard();
  const [pathFilter, setPathFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [preset, setPreset] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(3);

  const { data, refresh } = useDebugFetch(fetchHttpCaptures, []);
  const captures = data?.captures ?? [];
  const enabled = data?.enabled ?? false;

  const visible = useMemo(() => {
    const pathLower = pathFilter.toLowerCase();
    return captures.filter((h) => {
      if (pathLower && !h.path.toLowerCase().includes(pathLower)) return false;
      if (statusFilter && String(h.statusCode) !== statusFilter.trim()) return false;
      if (preset === 'errors' && h.statusCode < 400) return false;
      if (preset === 'slow' && h.durationMs <= SLOW_HTTP_MS) return false;
      return true;
    });
  }, [captures, pathFilter, statusFilter, preset]);

  const refreshHttp = useCallback(() => {
    if (active) void refresh();
  }, [active, refresh]);

  useAutoRefresh(autoRefresh && active, refreshInterval, refreshHttp);

  const columns: DbgTableColumn<CapturedHttpExchange>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (h) => <span class="dbg-time">{h.time}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (h) => <strong>{h.method}</strong>,
    },
    {
      key: 'path',
      header: 'Path',
      render: (h) => h.path,
    },
    {
      key: 'status',
      header: 'Status',
      render: (h) => <span class={httpStatusClass(h.statusCode)}>{h.statusCode}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (h) => <span class="dbg-time">{h.durationMs}ms</span>,
    },
    {
      key: 'trace',
      header: 'Trace',
      render: (h) =>
        h.traceId ? (
          <DbgButton
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTrace(h.traceId!);
            }}
          >
            {h.traceId.slice(0, 8)}…
          </DbgButton>
        ) : (
          '—'
        ),
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
              else showToast('No response body');
            }}
          >
            Response
          </DbgButton>
          <DbgButton
            onClick={(e) => {
              e.stopPropagation();
              void copyText(formatHttpExchangeMarkdown(h));
            }}
          >
            All
          </DbgButton>
          <DbgButton
            onClick={(e) => {
              e.stopPropagation();
              onFilterLogsByRequestId(h.requestId);
            }}
          >
            Filter logs
          </DbgButton>
          {h.traceId ? (
            <DbgButton
              onClick={(e) => {
                e.stopPropagation();
                onOpenTrace(h.traceId!);
              }}
            >
              Open trace
            </DbgButton>
          ) : null}
        </div>
      ),
    },
  ];

  const renderDetail = (h: CapturedHttpExchange) => {
    const upstream = formatHttpUpstream(h);
    return (
      <div class="dbg-http-detail-grid">
        {h.error ? <div class="dbg-status-err">Error: {h.error}</div> : null}
        {upstream ? <div class="dbg-status-warn">Upstream: {upstream}</div> : null}
        {h.requestPreview ? (
          <div class="dbg-pre-block">
            <strong>Request</strong>
            <pre class="dbg-pre">{h.requestPreview}</pre>
          </div>
        ) : null}
        {h.responsePreview ? (
          <div class="dbg-pre-block">
            <strong>Response</strong>
            <pre class="dbg-pre">{h.responsePreview}</pre>
          </div>
        ) : null}
      </div>
    );
  };

  const handleClear = async () => {
    if (!confirm('Clear HTTP captures?')) return;
    await clearHttpCaptures();
    void refresh();
  };

  return (
    <>
      <PageToolbar>
        <StatusChip
          enabled={enabled}
          onLabel={`Capture ON (DEBUG_CAPTURE_HTTP=1) · ${captures.length} captured`}
          offLabel="Capture OFF — set DEBUG_CAPTURE_HTTP=1 in .env and restart"
        />
        <DbgInput
          width="lg"
          placeholder="path filter..."
          value={pathFilter}
          onInput={(e) => setPathFilter(e.currentTarget.value)}
        />
        <DbgInput
          width="xs"
          placeholder="status"
          value={statusFilter}
          onInput={(e) => setStatusFilter(e.currentTarget.value)}
        />
        <ToolbarGroup>
          <DbgSelect
            options={[
              { value: '', label: 'All' },
              { value: 'errors', label: '4xx/5xx only' },
              { value: 'slow', label: 'Slow (>2s)' },
            ]}
            value={preset}
            onChange={(e) => setPreset(e.currentTarget.value)}
          />
        </ToolbarGroup>
        <DbgCheckbox checked={autoRefresh} onChange={setAutoRefresh} label="Auto" />
        <DbgSelect
          options={[
            { value: '2', label: '2s' },
            { value: '3', label: '3s' },
            { value: '5', label: '5s' },
            { value: '10', label: '10s' },
          ]}
          value={String(refreshInterval)}
          onChange={(e) => setRefreshInterval(parseInt(e.currentTarget.value, 10) || 3)}
        />
        <DbgButton onClick={() => void refresh()}>Refresh</DbgButton>
        <DbgButton onClick={() => void handleClear()}>Clear HTTP</DbgButton>
        <DbgButton
          variant="primary"
          onClick={() =>
            void copyText(formatHttpExchangesMarkdown(visible, `Visible HTTP (${visible.length})`))
          }
        >
          Copy visible
        </DbgButton>
        <DbgButton onClick={() => void copyText(JSON.stringify(visible, null, 2))}>
          Copy JSON
        </DbgButton>
        <DbgButton
          onClick={() => {
            const errors = captures.filter((h) => h.statusCode >= 400);
            if (!errors.length) {
              showToast('No error responses');
              return;
            }
            void copyText(formatHttpExchangesMarkdown(errors, 'HTTP errors'));
          }}
        >
          Copy errors
        </DbgButton>
      </PageToolbar>
      <DbgTable
        columns={columns}
        rows={visible}
        rowKey={(h) => h.id}
        rowClassName={(h) => {
          const classes: string[] = [];
          if (h.statusCode >= 400) classes.push('dbg-row-error');
          if (h.durationMs > SLOW_HTTP_MS) classes.push('dbg-row-slow');
          return classes.join(' ');
        }}
        renderDetail={renderDetail}
        emptyMessage="No HTTP captures match filters."
      />
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
