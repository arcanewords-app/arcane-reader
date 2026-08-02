import { useState, useMemo, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry, GlossaryEntryType } from '../../types.js';
import { Modal, Button, Input, Icon } from '../ui/index.js';
import { glossaryTypeIcons } from './glossaryTypeIcons.js';
import type { ChapterRef } from './glossaryTypes.js';

export interface RelationshipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: GlossaryEntry[];
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  typeLabels: Record<GlossaryEntryType, string>;
  currentEntry: GlossaryEntry;
  chapters?: ChapterRef[];
}

type GroupKey = number | 'other';

export function RelationshipsModal({
  isOpen,
  onClose,
  entries,
  selectedIds,
  onApply,
  typeLabels,
  currentEntry,
  chapters,
}: RelationshipsModalProps) {
  const { t } = useTranslation();
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraftIds(selectedIds);
      setSearchQuery('');
    }
  }, [isOpen, selectedIds]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(
      (e) => e.original.toLowerCase().includes(q) || e.translated.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const groupedEntries = useMemo(() => {
    const currentChapters = currentEntry.mentionedInChapters;
    const sortedChapterNums =
      currentChapters?.length && currentChapters.length > 0
        ? [...currentChapters].sort((a, b) => a - b)
        : [];

    const assignedIds = new Set<string>();
    const groups: { key: GroupKey; entries: GlossaryEntry[] }[] = [];

    for (const chNum of sortedChapterNums) {
      const inChapter = filteredEntries.filter(
        (e) => !assignedIds.has(e.id) && e.mentionedInChapters?.includes(chNum)
      );
      inChapter.forEach((e) => assignedIds.add(e.id));
      if (inChapter.length > 0) {
        groups.push({ key: chNum, entries: inChapter });
      }
    }

    const other = filteredEntries.filter((e) => !assignedIds.has(e.id));
    if (other.length > 0) {
      groups.push({ key: 'other', entries: other });
    }

    return groups;
  }, [filteredEntries, currentEntry.mentionedInChapters]);

  const toggleEntry = (id: string) => {
    setDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleApply = () => {
    onApply(draftIds);
    onClose();
  };

  const renderGroupTitle = (key: GroupKey) => {
    if (key === 'other') {
      return t('glossary.relationshipsGroupOther');
    }
    const ch = chapters?.find((c) => c.number === key);
    if (ch?.title) {
      return t('glossary.relationshipsGroupChapterWithTitle', {
        num: key,
        title: ch.title,
      });
    }
    return t('glossary.relationshipsGroupChapter', { num: key });
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('glossary.relationshipsModalTitle')}
      className="nested"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleApply}>{t('glossary.relationshipsApply')}</Button>
        </>
      }
    >
      <p class="form-hint" style={{ marginBottom: '0.75rem' }}>
        {t('glossary.relationshipsHint')}
      </p>
      {entries.length > 20 && (
        <div class="form-group" style={{ marginBottom: '0.75rem' }}>
          <Input
            placeholder={t('glossary.relationshipsSearchPlaceholder')}
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
        </div>
      )}
      <div class="glossary-relationships-modal-list">
        {groupedEntries.map(({ key, entries: groupEntries }) => (
          <div key={key} class="glossary-relationships-group">
            <div class="glossary-relationships-group-title">{renderGroupTitle(key)}</div>
            {groupEntries.map((e) => (
              <label
                key={e.id}
                class="glossary-relationships-checkbox-row"
                title={`${e.original} → ${e.translated}`}
              >
                <input
                  type="checkbox"
                  checked={draftIds.includes(e.id)}
                  onChange={() => toggleEntry(e.id)}
                />
                <span class="glossary-relationships-checkbox-icon" title={typeLabels[e.type]}>
                  <Icon name={glossaryTypeIcons[e.type]} size="sm" />
                </span>
                <span class="glossary-relationships-checkbox-text">
                  {e.original} → {e.translated}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
      {filteredEntries.length === 0 && searchQuery.trim() && (
        <p class="form-hint" style={{ marginTop: '0.5rem' }}>
          {t('glossary.relationshipsSearchEmpty')}
        </p>
      )}
    </Modal>
  );
}
