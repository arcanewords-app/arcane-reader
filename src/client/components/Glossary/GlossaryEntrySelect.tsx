import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry, GlossaryEntryType } from '../../types.js';
import { Input, Icon } from '../ui/index.js';
import { glossaryTypeIcons } from './glossaryTypeIcons.js';

export interface GlossaryEntrySelectProps {
  entries: GlossaryEntry[];
  value: GlossaryEntry | null;
  onChange: (entry: GlossaryEntry | null) => void;
  excludeIds?: string[];
  filterByType?: GlossaryEntryType;
  placeholder?: string;
}

export function GlossaryEntrySelect({
  entries,
  value,
  onChange,
  excludeIds = [],
  filterByType,
  placeholder,
}: GlossaryEntrySelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filteredEntries = useMemo(() => {
    let list = entries.filter((e) => !excludeIds.includes(e.id));
    if (filterByType) list = list.filter((e) => e.type === filterByType);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(
      (e) => e.original.toLowerCase().includes(q) || e.translated.toLowerCase().includes(q)
    );
  }, [entries, excludeIds, filterByType, searchQuery]);

  const handleSelect = (entry: GlossaryEntry) => {
    onChange(entry);
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <div class="glossary-entry-select" ref={wrapperRef}>
      <button
        type="button"
        class="glossary-entry-select-trigger form-input"
        onClick={() => setOpen(!open)}
      >
        {value ? (
          <span class="glossary-entry-select-value">
            <Icon name={glossaryTypeIcons[value.type]} size="sm" />
            {value.original} → {value.translated}
          </span>
        ) : (
          <span class="glossary-entry-select-placeholder">{placeholder}</span>
        )}
      </button>
      {open && (
        <div class="glossary-entry-select-dropdown">
          <Input
            placeholder={t('glossary.relationshipsSearchPlaceholder')}
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            style={{ margin: '0.5rem' }}
          />
          <div class="glossary-entry-select-list">
            {filteredEntries.map((e) => (
              <button
                key={e.id}
                type="button"
                class="glossary-entry-select-item"
                onClick={() => handleSelect(e)}
              >
                <Icon name={glossaryTypeIcons[e.type]} size="sm" />
                {e.original} → {e.translated}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
