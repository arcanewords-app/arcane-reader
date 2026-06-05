import { useCallback } from 'preact/hooks';
import type { CapturedLlmCall } from '@debug/shared/types';
import { formatLlmCaptureMarkdown } from '@debug/shared/copyFormat';
import { clearPromptCaptures, fetchPromptCaptures } from '../api/client';
import { PageToolbar } from '../components/layout/PageToolbar';
import { DbgButton } from '../components/ui/DbgButton';
import { StatusChip, Toast } from '../components/ui/index';
import { DbgTable, type DbgTableColumn } from '../components/ui/DbgTable';
import { useClipboard, useDebugFetch } from '../hooks';

interface PromptsPanelProps {
  active: boolean;
  onOpenTrace: (traceId: string) => void;
}

export function PromptsPanel({ active, onOpenTrace }: PromptsPanelProps) {
  const { copyText, showToast, toast } = useClipboard();

  const { data, refresh } = useDebugFetch(fetchPromptCaptures, []);
  const captures = data?.captures ?? [];
  const enabled = data?.enabled ?? false;

  const refreshIfActive = useCallback(() => {
    if (active) void refresh();
  }, [active, refresh]);

  const columns: DbgTableColumn<CapturedLlmCall>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (c) => <span class="dbg-time">{c.time}</span>,
    },
    {
      key: 'model',
      header: 'Model',
      render: (c) => c.model,
    },
    {
      key: 'method',
      header: 'Method',
      render: (c) => c.method,
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (c) => c.stage ?? '—',
    },
    {
      key: 'trace',
      header: 'Trace',
      render: (c) =>
        c.traceId ? (
          <DbgButton
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTrace(c.traceId!);
            }}
          >
            {c.traceId.slice(0, 8)}…
          </DbgButton>
        ) : (
          '—'
        ),
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
        <div class="dbg-row-actions">
          <DbgButton
            onClick={(e) => {
              e.stopPropagation();
              void copyText(formatLlmCaptureMarkdown(c));
            }}
          >
            Copy for agent
          </DbgButton>
          <DbgButton
            onClick={(e) => {
              e.stopPropagation();
              void copyText(JSON.stringify(c, null, 2));
            }}
          >
            Copy JSON
          </DbgButton>
          {c.traceId ? (
            <DbgButton
              onClick={(e) => {
                e.stopPropagation();
                onOpenTrace(c.traceId!);
              }}
            >
              Open trace
            </DbgButton>
          ) : null}
        </div>
      ),
    },
  ];

  const renderDetail = (c: CapturedLlmCall) => (
    <div class="dbg-http-detail-grid">
      <div class="dbg-pre-block">
        <strong>System</strong>
        <pre class="dbg-pre">{c.systemPreview}</pre>
      </div>
      <div class="dbg-pre-block">
        <strong>User</strong>
        <pre class="dbg-pre">{c.userPreview}</pre>
      </div>
      <div class="dbg-pre-block">
        <strong>Response</strong>
        <pre class="dbg-pre">{c.responsePreview}</pre>
      </div>
    </div>
  );

  const handleClear = async () => {
    if (!confirm('Clear prompt captures?')) return;
    await clearPromptCaptures();
    refreshIfActive();
  };

  const handleCopyAll = () => {
    if (!captures.length) {
      showToast('No prompts');
      return;
    }
    void copyText(captures.map(formatLlmCaptureMarkdown).join('\n\n---\n\n'));
  };

  return (
    <>
      <PageToolbar>
        <StatusChip
          enabled={enabled}
          onLabel={`Capture ON (DEBUG_CAPTURE_LLM=1) · ${captures.length} captured`}
          offLabel="Capture OFF — set DEBUG_CAPTURE_LLM=1 in .env and restart"
        />
        <DbgButton onClick={() => void refresh()}>Refresh</DbgButton>
        <DbgButton onClick={() => void handleClear()}>Clear prompts</DbgButton>
        <DbgButton variant="primary" onClick={handleCopyAll}>
          Copy all
        </DbgButton>
        <DbgButton onClick={() => void copyText(JSON.stringify(captures, null, 2))}>
          Copy JSON
        </DbgButton>
      </PageToolbar>
      <DbgTable
        columns={columns}
        rows={captures}
        rowKey={(c) => c.id}
        renderDetail={renderDetail}
        emptyMessage="No captures yet."
      />
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
