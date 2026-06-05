import type { DebugTab } from '@debug/shared/types';

const TABS: Array<{ id: DebugTab; label: string }> = [
  { id: 'logs', label: 'Logs' },
  { id: 'traces', label: 'Traces' },
  { id: 'http', label: 'HTTP' },
  { id: 'prompts', label: 'Prompts' },
];

interface TabNavProps {
  active: DebugTab;
  onChange: (tab: DebugTab) => void;
}

export function TabNav({ active, onChange }: TabNavProps) {
  return (
    <div class="dbg-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          class={active === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
