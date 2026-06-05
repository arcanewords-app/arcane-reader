import type { ComponentChildren } from 'preact';
import type { DebugTab } from '@debug/shared/types';
import { TabNav } from './TabNav';

interface AppShellProps {
  activeTab: DebugTab;
  onTabChange: (tab: DebugTab) => void;
  entryCount: number;
  workerBanner: string | null;
  workerBannerOk: boolean;
  children: ComponentChildren;
}

export function AppShell({
  activeTab,
  onTabChange,
  entryCount,
  workerBanner,
  workerBannerOk,
  children,
}: AppShellProps) {
  return (
    <>
      <header class="dbg-app-header">
        <h1>
          Arcane Debug
          <span class="dbg-header-meta">({entryCount} entries)</span>
        </h1>
      </header>
      {workerBanner ? (
        <div class={`dbg-banner${workerBannerOk ? ' ok' : ''}`}>{workerBanner}</div>
      ) : null}
      <TabNav active={activeTab} onChange={onTabChange} />
      {children}
    </>
  );
}

export function Panel({
  id,
  active,
  children,
}: {
  id: DebugTab;
  active: boolean;
  children: ComponentChildren;
}) {
  return (
    <div id={`panel-${id}`} class={`dbg-panel${active ? ' active' : ''}`}>
      {children}
    </div>
  );
}
