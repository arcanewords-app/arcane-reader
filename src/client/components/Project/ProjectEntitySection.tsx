import { useTranslation } from 'react-i18next';
import type {
  Project,
  ProjectWithChapterList,
  PublicEntity,
  TranslationStatus,
} from '../../types.js';
import { TRANSLATION_STATUSES } from '../../../shared/translation-status.js';
import { Button, Icon } from '../ui';
import { EntityCard, TagChip, EntityPickerModal } from '../EntityCard';
import '../ProjectInfo.css';

export interface ProjectEntitySectionProps {
  project: Project | ProjectWithChapterList;
  authorEntity: PublicEntity | null;
  translatorEntity: PublicEntity | null;
  tagEntities: PublicEntity[];
  savingEntities: boolean;
  isOwnedTranslatorEntity: (entity: PublicEntity | null | undefined) => boolean;
  showAuthorPicker: boolean;
  onShowAuthorPickerChange: (open: boolean) => void;
  showTranslatorPicker: boolean;
  onShowTranslatorPickerChange: (open: boolean) => void;
  showTagPicker: boolean;
  onShowTagPickerChange: (open: boolean) => void;
  onAuthorSelect: (entities: PublicEntity[]) => void;
  onTranslatorSelect: (entities: PublicEntity[]) => void;
  onTagSelect: (entities: PublicEntity[]) => void;
  onRemoveAuthor: () => void;
  onRemoveTranslator: () => void;
  onRemoveTag: (entity: PublicEntity) => void;
  onTranslationStatusChange: (status: TranslationStatus | null) => void;
}

export function ProjectEntitySection({
  project,
  authorEntity,
  translatorEntity,
  tagEntities,
  savingEntities,
  isOwnedTranslatorEntity,
  showAuthorPicker,
  onShowAuthorPickerChange,
  showTranslatorPicker,
  onShowTranslatorPickerChange,
  showTagPicker,
  onShowTagPickerChange,
  onAuthorSelect,
  onTranslatorSelect,
  onTagSelect,
  onRemoveAuthor,
  onRemoveTranslator,
  onRemoveTag,
  onTranslationStatusChange,
}: ProjectEntitySectionProps) {
  const { t } = useTranslation();

  const handleAuthorSelect = (entities: PublicEntity[]) => {
    onAuthorSelect(entities);
    onShowAuthorPickerChange(false);
  };

  const handleTranslatorSelect = (entities: PublicEntity[]) => {
    onTranslatorSelect(entities);
    onShowTranslatorPickerChange(false);
  };

  const handleTagSelect = (entities: PublicEntity[]) => {
    onTagSelect(entities);
    onShowTagPickerChange(false);
  };

  return (
    <>
      <div class="entity-section" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
        <div class="metadata-header" style={{ marginBottom: '0.75rem' }}>
          <span class="metadata-icon">
            <Icon name="person" size="sm" />
          </span>
          <h3 class="metadata-title">{t('projectInfo.entitySectionTitle')}</h3>
        </div>
        <div class="entity-section__content">
          <div class="entity-section__row">
            <span class="entity-section__label">{t('projectInfo.author')}</span>
            <div class="entity-section__value">
              {authorEntity ? (
                <div class="entity-section__card-wrap">
                  <EntityCard entity={authorEntity} compact />
                  <button
                    type="button"
                    class="entity-section__remove"
                    onClick={onRemoveAuthor}
                    disabled={savingEntities}
                    aria-label={t('projectInfo.removeAuthor')}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onShowAuthorPickerChange(true)}
                  disabled={savingEntities}
                >
                  {t('projectInfo.selectAuthor')}
                </Button>
              )}
            </div>
          </div>
          <div class="entity-section__row">
            <span class="entity-section__label">{t('projectInfo.translator')}</span>
            <div class="entity-section__value">
              {translatorEntity ? (
                <div class="entity-section__card-wrap">
                  <EntityCard entity={translatorEntity} compact />
                  {translatorEntity && !isOwnedTranslatorEntity(translatorEntity) && (
                    <span class="entity-section__legacy-badge">
                      {t('translatorPseudonym.legacyBadge')}
                    </span>
                  )}
                  <button
                    type="button"
                    class="entity-section__remove"
                    onClick={onRemoveTranslator}
                    disabled={savingEntities}
                    aria-label={t('projectInfo.removeTranslator')}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onShowTranslatorPickerChange(true)}
                  disabled={savingEntities}
                >
                  {t('projectInfo.selectTranslator')}
                </Button>
              )}
            </div>
          </div>
          <div class="entity-section__row">
            <span class="entity-section__label">{t('projectInfo.tags')}</span>
            <div class="entity-section__value entity-section__tags">
              {tagEntities.map((entity) => (
                <TagChip
                  key={entity.id}
                  entity={entity}
                  removable
                  onRemove={() => onRemoveTag(entity)}
                />
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onShowTagPickerChange(true)}
                disabled={savingEntities}
              >
                {t('projectInfo.addTags')}
              </Button>
            </div>
          </div>
          <div class="entity-section__row entity-section__row--translation-status">
            <span class="entity-section__label">{t('projectInfo.translationStatus.label')}</span>
            <div class="entity-section__value entity-section__translation-status">
              <div
                class="translation-status-pills"
                role="group"
                aria-label={t('projectInfo.translationStatus.label')}
              >
                {TRANSLATION_STATUSES.map((status) => {
                  const isActive = project.metadata?.translationStatus === status;
                  const optionKey =
                    status === 'in_progress'
                      ? 'inProgress'
                      : status === 'complete'
                        ? 'complete'
                        : 'abandoned';
                  return (
                    <button
                      key={status}
                      type="button"
                      class={`translation-status-pill${isActive ? ' translation-status-pill--active' : ''}`}
                      disabled={savingEntities}
                      aria-pressed={isActive}
                      onClick={() => {
                        const next = project.metadata?.translationStatus === status ? null : status;
                        onTranslationStatusChange(next);
                      }}
                    >
                      {t(`projectInfo.translationStatus.${optionKey}`)}
                    </button>
                  );
                })}
                {project.metadata?.translationStatus != null && (
                  <button
                    type="button"
                    class="translation-status-clear"
                    disabled={savingEntities}
                    onClick={() => onTranslationStatusChange(null)}
                  >
                    {t('projectInfo.translationStatus.clear')}
                  </button>
                )}
              </div>
              <p class="entity-section__translation-status-hint">
                {t('projectInfo.translationStatus.hint')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <EntityPickerModal
        isOpen={showAuthorPicker}
        onClose={() => onShowAuthorPickerChange(false)}
        kind="author"
        mode="single"
        selectedIds={authorEntity ? [authorEntity.id] : []}
        onSelect={handleAuthorSelect}
      />
      <EntityPickerModal
        isOpen={showTranslatorPicker}
        onClose={() => onShowTranslatorPickerChange(false)}
        kind="translator"
        mode="single"
        translatorScope="mine"
        allowCreate
        selectedIds={translatorEntity ? [translatorEntity.id] : []}
        onSelect={handleTranslatorSelect}
      />
      <EntityPickerModal
        isOpen={showTagPicker}
        onClose={() => onShowTagPickerChange(false)}
        kind="tag"
        mode="multi"
        selectedIds={tagEntities.map((e) => e.id)}
        onSelect={handleTagSelect}
      />
    </>
  );
}
