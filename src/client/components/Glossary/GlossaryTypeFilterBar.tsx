import { useTranslation } from 'react-i18next';
import type { GlossaryEntryType } from '../../types.js';
import { Icon } from '../ui/index.js';
import { glossaryTypeIcons } from './glossaryTypeIcons.js';
import type { GlossaryTypeFilter } from './glossaryFilterShared.js';

const TYPE_FILTERS: GlossaryTypeFilter[] = ['all', 'character', 'location', 'term'];

export interface GlossaryTypeFilterBarProps {
  filter: string;
  onFilterChange: (filter: string) => void;
  counts: { all: number; character: number; location: number; term: number };
  extraFilters?: { id: string; label: string; count: number }[];
  showTypeIcons?: boolean;
}

export function GlossaryTypeFilterBar({
  filter,
  onFilterChange,
  counts,
  extraFilters,
  showTypeIcons = true,
}: GlossaryTypeFilterBarProps) {
  const { t } = useTranslation();

  const typeLabels: Record<GlossaryEntryType, string> = {
    character: t('glossary.characters'),
    location: t('glossary.locations'),
    term: t('glossary.terms'),
  };

  return (
    <div class="glossary-filters">
      {TYPE_FILTERS.map((f) => (
        <button
          key={f}
          class={`filter-btn ${filter === f ? 'active' : ''}`}
          onClick={() => onFilterChange(f)}
        >
          {f === 'all' ? (
            t('glossary.all')
          ) : showTypeIcons ? (
            <>
              <Icon name={glossaryTypeIcons[f]} size="sm" /> {typeLabels[f]}
            </>
          ) : (
            typeLabels[f]
          )}
          <span>{counts[f]}</span>
        </button>
      ))}
      {extraFilters?.map((ef) => (
        <button
          key={ef.id}
          class={`filter-btn ${filter === ef.id ? 'active' : ''}`}
          onClick={() => onFilterChange(ef.id)}
        >
          {ef.label}
          <span>{ef.count}</span>
        </button>
      ))}
    </div>
  );
}
