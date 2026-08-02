import { useTranslation } from 'react-i18next';
import type { TranslationStageKind } from '../../types';
import { Icon } from '../ui';
import type { EditingFocus } from '../../../shared/editing-focus.js';
import '../ChapterView/ReaderSettings.css';

export const BATCH_STAGE_ORDER: TranslationStageKind[] = ['analysis', 'translation', 'editing'];

export interface BatchStageOptionsProps {
  batchSelectedStages: TranslationStageKind[];
  onToggleStage: (stage: TranslationStageKind) => void;
  batchTranslateChapterTitles: boolean;
  onBatchTranslateChapterTitlesChange: (checked: boolean) => void;
  includeGlossaryInEditing: boolean;
  onToggleIncludeGlossaryInEditing: () => void | Promise<void>;
  editingFocus: EditingFocus;
  onEditingFocusChange: (e: Event) => void | Promise<void>;
  editingStylePreset: 'default' | 'literary' | 'minimal' | 'ai_revivification';
  onEditingStylePresetChange: (e: Event) => void | Promise<void>;
}

export function BatchStageOptions({
  batchSelectedStages,
  onToggleStage,
  batchTranslateChapterTitles,
  onBatchTranslateChapterTitlesChange,
  includeGlossaryInEditing,
  onToggleIncludeGlossaryInEditing,
  editingFocus,
  onEditingFocusChange,
  editingStylePreset,
  onEditingStylePresetChange,
}: BatchStageOptionsProps) {
  const { t } = useTranslation();

  return (
    <>
      <div style={{ marginBottom: '0.75rem' }}>
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-dim)',
            marginBottom: '0.5rem',
          }}
        >
          {t('translationPanel.stages', 'Стадии')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {BATCH_STAGE_ORDER.map((stage) => {
            const checked = batchSelectedStages.includes(stage);
            const label =
              stage === 'analysis'
                ? t('projectInfo.stageAnalysis', 'Анализ')
                : stage === 'translation'
                  ? t('projectInfo.stageTranslation', 'Перевод')
                  : t('projectInfo.stageEditing', 'Редактура');
            const icon =
              stage === 'analysis' ? (
                <Icon name="manage_search" size="sm" />
              ) : stage === 'translation' ? (
                <Icon name="translate" size="sm" />
              ) : (
                <Icon name="edit" size="sm" />
              );
            const title =
              stage === 'analysis'
                ? t('translationPanel.stageAnalysisHint', 'Анализ, обновление глоссария')
                : stage === 'translation'
                  ? t('translationPanel.stageTranslationHint', 'Перевод')
                  : t('translationPanel.stageEditingHint', 'Редактура текущего перевода');
            return (
              <label
                key={stage}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.6rem',
                  borderRadius: '6px',
                  border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                  background: checked
                    ? 'var(--accent-subtle, rgba(var(--accent-rgb), 0.1))'
                    : 'transparent',
                  cursor: 'pointer',
                  margin: 0,
                  fontSize: '0.9rem',
                }}
                title={title}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleStage(stage)}
                  style={{ marginRight: 0, accentColor: 'var(--accent)' }}
                />
                {icon} {label}
              </label>
            );
          })}
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          {t('translationPanel.stagesMultiHint')}
        </span>
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          fontSize: '0.9rem',
          cursor: batchSelectedStages.includes('translation') ? 'pointer' : 'not-allowed',
          opacity: batchSelectedStages.includes('translation') ? 1 : 0.55,
        }}
      >
        <input
          type="checkbox"
          checked={batchTranslateChapterTitles}
          disabled={!batchSelectedStages.includes('translation')}
          onChange={(e) =>
            onBatchTranslateChapterTitlesChange((e.target as HTMLInputElement).checked)
          }
          style={{ marginTop: '0.2rem', accentColor: 'var(--accent)' }}
        />
        <span>
          {t('translationPanel.translateChapterTitles', 'Переводить названия глав')}
          <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            {t(
              'translationPanel.translateChapterTitlesHint',
              'Короткий перевод заголовка из оглавления (отдельно от текста главы)'
            )}
          </span>
        </span>
      </label>
      {batchSelectedStages.includes('editing') && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
              color: 'var(--text-secondary)',
            }}
          >
            {t('projectInfo.editingSettingsLabel', 'Настройки редактуры')}
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              cursor: 'pointer',
              marginBottom: '0.5rem',
            }}
          >
            <input
              type="checkbox"
              checked={includeGlossaryInEditing}
              onChange={onToggleIncludeGlossaryInEditing}
              style={{
                width: '18px',
                height: '18px',
                marginTop: '2px',
                cursor: 'pointer',
                accentColor: 'var(--accent)',
              }}
              aria-label={t('settings.includeGlossaryInEditing')}
            />
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                {t('settings.includeGlossaryInEditing')}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                {t('settings.includeGlossaryInEditingHint')}
              </div>
            </div>
          </label>
          <div>
            <label
              style={{
                display: 'block',
                fontWeight: 500,
                fontSize: '0.9rem',
                marginBottom: '0.35rem',
              }}
            >
              {t('settings.editingFocus')}
            </label>
            <select
              value={editingFocus}
              onChange={onEditingFocusChange}
              style={{
                width: '100%',
                padding: '0.4rem 0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                marginBottom: '0.5rem',
              }}
            >
              <option value="fix_only">{t('settings.editingFocus.fix_only')}</option>
              <option value="polish">{t('settings.editingFocus.polish')}</option>
              <option value="elevate">{t('settings.editingFocus.elevate')}</option>
            </select>
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontWeight: 500,
                fontSize: '0.9rem',
                marginBottom: '0.35rem',
              }}
            >
              {t('settings.editingStylePreset')}
            </label>
            <select
              value={editingStylePreset}
              onChange={onEditingStylePresetChange}
              style={{
                width: '100%',
                padding: '0.4rem 0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
              }}
            >
              <option value="default">{t('settings.editingStylePreset.default')}</option>
              <option value="literary">{t('settings.editingStylePreset.literary')}</option>
              <option value="minimal">{t('settings.editingStylePreset.minimal')}</option>
              <option value="ai_revivification">
                {t('settings.editingStylePreset.ai_revivification')}
              </option>
            </select>
          </div>
        </div>
      )}
    </>
  );
}
