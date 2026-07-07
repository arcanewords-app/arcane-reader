import { useState, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { PublicEntity, PublicEntityKind } from '../../types';
import { api } from '../../api/client';
import { MAX_TRANSLATOR_PSEUDONYMS_PER_USER } from '../../../shared/translatorPseudonyms';
import { Modal, Button } from '../ui';
import { EntityCard } from './EntityCard';
import { TagChip } from './TagChip';
import { TranslatorPseudonymFormModal } from '../TranslatorPseudonym/TranslatorPseudonymsSection';
import './EntityPickerModal.css';
import '../TranslatorPseudonym/TranslatorPseudonymsSection.css';

const INITIAL_TAG_LIMIT = 12;

interface EntityPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: PublicEntityKind;
  /** For author/translator: single select. For tags: multi-select. */
  mode: 'single' | 'multi';
  /** Pre-selected entity id(s). */
  selectedIds?: string[];
  onSelect: (entities: PublicEntity[]) => void;
  /** When kind=translator, load only the current user's pseudonyms. */
  translatorScope?: 'public' | 'mine';
  /** Allow inline create for mine translator scope. */
  allowCreate?: boolean;
}

export function EntityPickerModal({
  isOpen,
  onClose,
  kind,
  mode,
  selectedIds = [],
  onSelect,
  translatorScope = 'public',
  allowCreate = false,
}: EntityPickerModalProps) {
  const { t } = useTranslation();
  const [entities, setEntities] = useState<PublicEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagShowAll, setTagShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [showCreateForm, setShowCreateForm] = useState(false);

  const useMineTranslators = kind === 'translator' && translatorScope === 'mine';
  const canCreate = useMineTranslators && allowCreate;
  const atCreateLimit = entities.length >= MAX_TRANSLATOR_PSEUDONYMS_PER_USER;

  useEffect(() => {
    setSelected(new Set(selectedIds));
  }, [selectedIds, isOpen]);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = useMineTranslators
        ? await api.getTranslatorPseudonyms()
        : await api.getPublicEntities({ kind, limit: 200 });
      setEntities(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entities');
    } finally {
      setLoading(false);
    }
  }, [kind, useMineTranslators]);

  useEffect(() => {
    if (!isOpen) return;
    setShowCreateForm(false);
    loadEntities();
  }, [isOpen, loadEntities]);

  const handleSelectSingle = useCallback(
    (entity: PublicEntity) => {
      onSelect([entity]);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleToggleTag = useCallback((entity: PublicEntity) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entity.id)) {
        next.delete(entity.id);
      } else {
        next.add(entity.id);
      }
      return next;
    });
  }, []);

  const handleConfirmMulti = useCallback(() => {
    const selectedEntities = entities.filter((e) => selected.has(e.id));
    onSelect(selectedEntities);
    onClose();
  }, [entities, selected, onSelect, onClose]);

  const handleCreated = (entity: PublicEntity) => {
    setEntities((prev) => [...prev, entity]);
    setShowCreateForm(false);
    if (mode === 'single') {
      onSelect([entity]);
      onClose();
    }
  };

  const titleKey =
    kind === 'author'
      ? 'entityPicker.titleAuthor'
      : kind === 'translator'
        ? 'entityPicker.titleTranslator'
        : 'entityPicker.titleTags';

  const displayEntities =
    kind === 'tag' && !tagShowAll ? entities.slice(0, INITIAL_TAG_LIMIT) : entities;
  const hasMoreTags = kind === 'tag' && entities.length > INITIAL_TAG_LIMIT && !tagShowAll;

  const emptyMessage = useMineTranslators
    ? t('translatorPseudonym.empty')
    : t('entityPicker.empty');

  const footer =
    mode === 'multi' ? (
      <div class="form-actions">
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={handleConfirmMulti}>
          {t('entityPicker.confirm')}
        </Button>
      </div>
    ) : undefined;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t(titleKey)} size="large" footer={footer}>
        <div class="entity-picker-modal">
          {loading && (
            <div class="entity-picker-modal__loading">
              <span class="spinner" />
              <span>{t('entityPicker.loading')}</span>
            </div>
          )}
          {error && (
            <div class="entity-picker-modal__error" role="alert">
              {error}
            </div>
          )}
          {!loading && !error && mode === 'single' && (
            <div class="entity-picker-modal__grid">
              {displayEntities.map((entity) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  compact={false}
                  onClick={() => handleSelectSingle(entity)}
                />
              ))}
            </div>
          )}
          {!loading && !error && mode === 'multi' && (
            <div class="entity-picker-modal__chips">
              {displayEntities.map((entity) => (
                <TagChip
                  key={entity.id}
                  entity={entity}
                  selected={selected.has(entity.id)}
                  onClick={() => handleToggleTag(entity)}
                />
              ))}
            </div>
          )}
          {hasMoreTags && (
            <button
              type="button"
              class="entity-picker-modal__show-all"
              onClick={() => setTagShowAll(true)}
            >
              {t('entityPicker.showAll')}
            </button>
          )}
          {entities.length === 0 && !loading && !error && (
            <div class="entity-picker-modal__empty">
              <p>{emptyMessage}</p>
              {useMineTranslators && (
                <p class="entity-picker-modal__limit-hint">{t('translatorPseudonym.emptyHint')}</p>
              )}
            </div>
          )}
          {canCreate && !loading && !error && (
            <div class="entity-picker-modal__create">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCreateForm(true)}
                disabled={atCreateLimit}
              >
                {t('translatorPseudonym.create')}
              </Button>
              {atCreateLimit && (
                <p class="entity-picker-modal__limit-hint">
                  {t('translatorPseudonym.limitReached')}
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      <TranslatorPseudonymFormModal
        isOpen={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        editingEntity={null}
        onSaved={handleCreated}
      />
    </>
  );
}
