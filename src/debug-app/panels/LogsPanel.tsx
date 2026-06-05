import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { DebugLogEntry } from '@debug/shared/types';
import { LEVEL_COLORS } from '@debug/shared/types';
import {
  formatEntriesJson,
  formatEntriesMarkdown,
  formatEntryMarkdown,
  omitLogPayload,
} from '@debug/shared/copyFormat';
import { clearLogs, exportDebug, fetchLogs } from '../api/client';
import { PageToolbar, ToolbarGroup, ToolbarLabel } from '../components/layout/PageToolbar';
import { DbgButton } from '../components/ui/DbgButton';
import { DbgBadge, DbgCheckbox, DbgInput, DbgSelect, Toast } from '../components/ui/index';
import { CollapsibleJson, DbgTable, type DbgTableColumn } from '../components/ui/DbgTable';
import { useAutoRefresh, useClipboard, useDebugFetch } from '../hooks';
import { entryMatchesFilters, type LogFilters } from '../hooks/useUrlSync';

interface LogsPanelProps {
  filters: LogFilters;
  onFiltersChange: (patch: Partial<LogFilters>) => void;
  onMeta: (meta: { count: number; workerBridge: boolean; events: string[] }) => void;
  active: boolean;
}

export function LogsPanel({ filters, onFiltersChange, onMeta, active }: LogsPanelProps) {
  const { copyText, toast } = useClipboard();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(3);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data, refresh } = useDebugFetch(fetchLogs, []);

  const entries = data?.entries ?? [];
  const events = data?.meta.events ?? [];

  useEffect(() => {
    if (data?.meta) {
      onMeta({
        count: data.meta.count,
        workerBridge: data.meta.workerBridge,
        events: data.meta.events,
      });
    }
  }, [data, onMeta]);

  const visibleEntries = useMemo(
    () => entries.filter((e) => entryMatchesFilters(e, filters)),
    [entries, filters]
  );

  const refreshLogs = useCallback(() => {
    if (active) void refresh();
  }, [active, refresh]);

  useAutoRefresh(autoRefresh && active, refreshInterval, refreshLogs);

  const eventOptions = useMemo(
    () => [{ value: '', label: 'all' }, ...events.map((ev) => ({ value: ev, label: ev }))],
    [events]
  );

  const toggleRowExpand = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const columns: DbgTableColumn<DebugLogEntry & { _idx: number }>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (e) => <span class="dbg-time">{e.time}</span>,
    },
    {
      key: 'level',
      header: 'Level',
      render: (e) => (
        <span class="dbg-level" style={{ color: LEVEL_COLORS[e.level] ?? 'var(--dbg-muted)' }}>
          {e.level}
        </span>
      ),
    },
    {
      key: 'process',
      header: 'Process',
      render: (e) => (
        <DbgBadge variant={e.process === 'worker' ? 'worker' : 'default'}>
          {e.process ?? 'api'}
        </DbgBadge>
      ),
    },
    {
      key: 'msg',
      header: 'Message',
      render: (e) => {
        const corr = e.traceId || e.jobId || e.requestId || '';
        return (
          <button
            type="button"
            class="dbg-btn dbg-btn--ghost dbg-msg"
            onClick={() => toggleRowExpand(e._idx)}
            title="Click to expand payload"
          >
            {e.msg ?? ''}
            {corr ? (
              <>
                {' '}
                <DbgBadge>{String(corr).slice(0, 8)}</DbgBadge>
              </>
            ) : null}
          </button>
        );
      },
    },
    {
      key: 'payload',
      header: 'Payload',
      render: (e) => (
        <CollapsibleJson
          data={JSON.stringify(omitLogPayload(e), null, 2)}
          expanded={expandedRows.has(e._idx)}
          onToggle={() => toggleRowExpand(e._idx)}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (e) => {
        const corr = e.traceId || e.jobId || e.requestId || '';
        return (
          <div class="dbg-row-actions">
            <DbgButton
              onClick={(ev) => {
                ev.stopPropagation();
                void copyText(formatEntryMarkdown(e));
              }}
            >
              Copy
            </DbgButton>
            {corr ? (
              <DbgButton
                onClick={(ev) => {
                  ev.stopPropagation();
                  void exportDebug({ format: 'cursor', traceId: corr }).then(copyText);
                }}
              >
                Trace
              </DbgButton>
            ) : null}
          </div>
        );
      },
    },
  ];

  const rowsWithIdx = visibleEntries.map((e) => {
    const idx = entries.indexOf(e);
    return { ...e, _idx: idx >= 0 ? idx : 0 };
  });

  const handleCopyVisible = () => {
    void copyText(formatEntriesMarkdown(visibleEntries, `Visible logs (${visibleEntries.length})`));
  };

  const handleCopyCursor = async () => {
    const traceId = filters.traceId.trim();
    if (traceId) {
      void copyText(await exportDebug({ format: 'cursor', traceId }));
      return;
    }
    const firstTrace = visibleEntries.find((e) => e.traceId)?.traceId;
    if (firstTrace) {
      void copyText(await exportDebug({ format: 'cursor', traceId: firstTrace }));
      return;
    }
    void copyText(formatEntriesMarkdown(visibleEntries, 'Arcane debug context'));
  };

  const handleClear = async () => {
    if (!confirm('Clear in-memory log buffer?')) return;
    await clearLogs();
    void refresh();
  };

  return (
    <>
      <PageToolbar>
        <ToolbarLabel label="Level">
          <DbgSelect
            options={[
              { value: '', label: 'all' },
              { value: 'error', label: 'error' },
              { value: 'warn', label: 'warn' },
              { value: 'info', label: 'info' },
              { value: 'debug', label: 'debug' },
              { value: 'trace', label: 'trace' },
            ]}
            value={filters.level}
            onChange={(e) => onFiltersChange({ level: e.currentTarget.value })}
          />
        </ToolbarLabel>
        <ToolbarLabel label="Event">
          <DbgSelect
            options={eventOptions}
            value={filters.event}
            onChange={(e) => onFiltersChange({ event: e.currentTarget.value })}
          />
        </ToolbarLabel>
        <ToolbarLabel label="Process">
          <DbgSelect
            options={[
              { value: '', label: 'all' },
              { value: 'api', label: 'api' },
              { value: 'worker', label: 'worker' },
            ]}
            value={filters.process}
            onChange={(e) => onFiltersChange({ process: e.currentTarget.value })}
          />
        </ToolbarLabel>
        <DbgInput
          width="sm"
          placeholder="traceId"
          value={filters.traceId}
          onInput={(e) => onFiltersChange({ traceId: e.currentTarget.value })}
        />
        <DbgInput
          width="sm"
          placeholder="requestId"
          value={filters.requestId}
          onInput={(e) => onFiltersChange({ requestId: e.currentTarget.value })}
        />
        <DbgInput
          width="sm"
          placeholder="chapterId"
          value={filters.chapterId}
          onInput={(e) => onFiltersChange({ chapterId: e.currentTarget.value })}
        />
        <DbgInput
          width="sm"
          placeholder="projectId"
          value={filters.projectId}
          onInput={(e) => onFiltersChange({ projectId: e.currentTarget.value })}
        />
        <DbgInput
          width="sm"
          placeholder="jobId"
          value={filters.jobId}
          onInput={(e) => onFiltersChange({ jobId: e.currentTarget.value })}
        />
        <DbgInput
          width="md"
          placeholder="Search text..."
          value={filters.search}
          onInput={(e) => onFiltersChange({ search: e.currentTarget.value })}
        />
        <ToolbarGroup>
          <DbgSelect
            options={[
              { value: '', label: 'Preset' },
              { value: 'errors', label: 'Errors only' },
              { value: 'translation', label: 'Translation events' },
              { value: 'pipeline', label: 'Pipeline / stages' },
            ]}
            value={filters.preset}
            onChange={(e) => onFiltersChange({ preset: e.currentTarget.value })}
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
        <DbgButton onClick={() => void handleClear()}>Clear</DbgButton>
        <DbgButton variant="primary" onClick={handleCopyVisible}>
          Copy visible
        </DbgButton>
        <DbgButton onClick={() => void handleCopyCursor()}>Copy for Cursor</DbgButton>
        <DbgButton onClick={() => void copyText(formatEntriesJson(visibleEntries))}>
          Copy JSON
        </DbgButton>
      </PageToolbar>
      <DbgTable
        columns={columns}
        rows={rowsWithIdx}
        rowKey={(e) => String(e._idx)}
        emptyMessage="No log entries match filters."
      />
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
