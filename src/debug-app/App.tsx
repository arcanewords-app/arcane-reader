import { useCallback, useState } from 'preact/hooks';
import { AppShell, Panel } from './components/layout/AppShell';
import { HttpPanel } from './panels/HttpPanel';
import { LogsPanel } from './panels/LogsPanel';
import { PromptsPanel } from './panels/PromptsPanel';
import { TracesPanel } from './panels/TracesPanel';
import { useUrlSync } from './hooks/useUrlSync';

export function App() {
  const { tab, setTab, logFilters, setLogFilters, filterLogsByCorrelation, filterLogsByRequestId } =
    useUrlSync();

  const [entryCount, setEntryCount] = useState(0);
  const [workerBridge, setWorkerBridge] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const onMeta = useCallback((meta: { count: number; workerBridge: boolean; events: string[] }) => {
    setEntryCount(meta.count);
    setWorkerBridge(meta.workerBridge);
  }, []);

  const workerBanner = workerBridge
    ? 'Worker log bridge: active (REDIS_URL). Async job logs appear with process=worker.'
    : 'Worker logs: only in worker terminal unless REDIS_URL is set (npm run dev:full).';

  const openTrace = useCallback(
    (traceId: string) => {
      setSelectedTraceId(traceId);
      setLogFilters({ traceId });
      setTab('traces');
    },
    [setLogFilters, setTab]
  );

  return (
    <AppShell
      activeTab={tab}
      onTabChange={setTab}
      entryCount={entryCount}
      workerBanner={workerBanner}
      workerBannerOk={workerBridge}
    >
      <Panel id="logs" active={tab === 'logs'}>
        <LogsPanel
          filters={logFilters}
          onFiltersChange={setLogFilters}
          onMeta={onMeta}
          active={tab === 'logs'}
        />
      </Panel>
      <Panel id="traces" active={tab === 'traces'}>
        <TracesPanel
          active={tab === 'traces'}
          selectedTraceId={selectedTraceId}
          onSelectTrace={setSelectedTraceId}
          onFilterLogs={filterLogsByCorrelation}
        />
      </Panel>
      <Panel id="http" active={tab === 'http'}>
        <HttpPanel
          active={tab === 'http'}
          onOpenTrace={openTrace}
          onFilterLogsByRequestId={filterLogsByRequestId}
        />
      </Panel>
      <Panel id="prompts" active={tab === 'prompts'}>
        <PromptsPanel active={tab === 'prompts'} onOpenTrace={openTrace} />
      </Panel>
    </AppShell>
  );
}
