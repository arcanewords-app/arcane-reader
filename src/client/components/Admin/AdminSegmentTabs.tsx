import { route } from 'preact-router';
import './admin-shared.css';

export interface AdminSegmentTab {
  id: string;
  path: string;
  label: string;
}

interface AdminSegmentTabsProps {
  tabs: AdminSegmentTab[];
  activeId: string;
  ariaLabel: string;
}

export function AdminSegmentTabs({ tabs, activeId, ariaLabel }: AdminSegmentTabsProps) {
  return (
    <nav class="admin-segment-tabs" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.path}
          class={`admin-segment-tab ${activeId === tab.id ? 'admin-segment-tab--active' : ''}`}
          aria-current={activeId === tab.id ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            route(tab.path);
          }}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
