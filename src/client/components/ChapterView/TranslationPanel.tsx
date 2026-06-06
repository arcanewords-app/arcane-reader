import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Button, Icon } from '../ui';
import { ProjectLanguagePairFields } from '../Project/ProjectLanguagePairFields';
import { api } from '../../api/client';
import { trackEvent } from '../../utils/analytics';
import {
  projectDefaultLanguagePair,
  type LanguagePairValue,
  type ProjectSourceLanguage,
} from '../../constants/translationLanguages';
import {
  getLanguageOverrideWarnings,
  toLanguagePairOverride,
} from '../../utils/languagePairOverride';
import type {
  Chapter,
  Project,
  ProjectSettings,
  ChapterTranslationOptions,
  TranslationStageKind,
} from '../../types';
import { isChunkError } from '../../../shared/chunkErrors';
import './TranslationPanel.css';

type Scope = 'full' | 'empty' | 'selected';

const STAGE_ORDER: TranslationStageKind[] = ['analysis', 'translation', 'editing'];

interface TranslationPanelProps {
  chapter: Chapter;
  project: Project;
  projectId: string;
  /** Start translation with given options */
  startTranslation: (options: ChapterTranslationOptions) => void;
  translating: boolean;
  /** Chunk progress during translation (from status polling) */
  chunkProgress?: { chunksDone: number; totalChunks: number } | null;
  /** Estimate tokens for text length and stages (array or 'all') */
  estimate: (textLength: number, stages?: import('../../types').TranslationStages) => number;
  emptyCount: number;
  selectedParagraphIds: string[];
  onSelectAllEmpty: () => void;
  onDeselectAll: () => void;
  onCancelTranslation: () => void;
  onChapterUpdate: (chapter: Chapter) => void;
  /** Mark current content as ready-made translation (one click) */
  onMarkAsTranslated?: () => void;
  markingAsTranslated?: boolean;
  /** Called when project settings are updated (e.g. from inline editing block) */
  onSettingsChange?: (settings: ProjectSettings) => void;
}

/** Get text length for scope (for token estimate). */
function getTextLengthForScope(chapter: Chapter, scope: Scope, selectedIds: string[]): number {
  if (scope === 'selected' && selectedIds.length && chapter.paragraphs?.length) {
    const idSet = new Set(selectedIds);
    return chapter.paragraphs
      .filter((p) => idSet.has(p.id))
      .reduce((sum, p) => sum + p.originalText.length, 0);
  }
  if (scope === 'empty' && chapter.paragraphs?.length) {
    const empty = chapter.paragraphs.filter((p) => {
      const t = p.translatedText?.trim() || '';
      if (!t.length) return true;
      if (t.startsWith('❌') || isChunkError(t)) return true;
      return false;
    });
    return empty.reduce((sum, p) => sum + p.originalText.length, 0);
  }
  return chapter.originalText?.length ?? 0;
}

export function TranslationPanel({
  chapter,
  project,
  projectId,
  startTranslation,
  translating,
  chunkProgress,
  estimate,
  emptyCount,
  selectedParagraphIds,
  onSelectAllEmpty,
  onDeselectAll,
  onCancelTranslation,
  onMarkAsTranslated,
  markingAsTranslated = false,
  onSettingsChange,
}: TranslationPanelProps) {
  const { t } = useTranslation();

  const [scope, setScope] = useState<Scope>('full');
  const [selectedStages, setSelectedStages] = useState<TranslationStageKind[]>([
    'analysis',
    'translation',
    'editing',
  ]);
  const [panelLanguagePair, setPanelLanguagePair] = useState<LanguagePairValue>(() =>
    projectDefaultLanguagePair(project)
  );
  const [languageOverrideAck, setLanguageOverrideAck] = useState(false);

  useEffect(() => {
    setPanelLanguagePair(projectDefaultLanguagePair(project));
    setLanguageOverrideAck(false);
  }, [project.id, project.sourceLanguage, project.targetLanguage]);

  const projectDefaultPair = useMemo(
    () => projectDefaultLanguagePair(project),
    [project.sourceLanguage, project.targetLanguage, project.id]
  );
  const hasTranslatedContent = useMemo(() => {
    if (chapter.status === 'completed' || chapter.status === 'draft') return true;
    return (
      chapter.paragraphs?.some((p) => {
        const text = p.translatedText?.trim() || '';
        return text.length > 0 && !text.startsWith('❌') && !isChunkError(text);
      }) ?? false
    );
  }, [chapter.status, chapter.paragraphs]);
  const languageOverrideWarnings = useMemo(
    () =>
      getLanguageOverrideWarnings({
        batchLanguagePair: panelLanguagePair,
        project,
        selectedStages,
        hasTranslatedContent,
        t,
      }),
    [panelLanguagePair, project, selectedStages, hasTranslatedContent, t]
  );
  const needsLanguageOverrideAck = languageOverrideWarnings.length > 0;
  const panelLanguagePairOverride = useMemo(
    () => toLanguagePairOverride(panelLanguagePair, project),
    [panelLanguagePair, project.sourceLanguage, project.targetLanguage]
  );
  const hasLanguageOverride = panelLanguagePairOverride !== undefined;

  const textLength = useMemo(
    () => getTextLengthForScope(chapter, scope, selectedParagraphIds),
    [chapter, scope, selectedParagraphIds]
  );
  const estimatedTokens = useMemo(
    () => estimate(textLength, selectedStages),
    [estimate, textLength, selectedStages]
  );

  const toggleStage = (stage: TranslationStageKind) => {
    setSelectedStages((prev) =>
      prev.includes(stage)
        ? prev.filter((s) => s !== stage)
        : [...prev, stage].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
    );
  };

  const includeGlossaryInEditing = project.settings?.includeGlossaryInEditing ?? true;
  const editingStylePreset = project.settings?.editingStylePreset ?? 'default';
  const editingFocus = project.settings?.editingFocus ?? 'both';

  const handleToggleIncludeGlossaryInEditing = useCallback(async () => {
    const updated = await api.updateSettings(project.id, {
      includeGlossaryInEditing: !includeGlossaryInEditing,
    });
    onSettingsChange?.(updated);
  }, [project.id, includeGlossaryInEditing, onSettingsChange]);

  const handleEditingStylePresetChange = useCallback(
    async (e: Event) => {
      const value = (e.target as HTMLSelectElement).value as
        | 'default'
        | 'literary'
        | 'minimal'
        | 'ai_revivification';
      const updated = await api.updateSettings(project.id, {
        editingStylePreset: value,
      });
      onSettingsChange?.(updated);
    },
    [project.id, onSettingsChange]
  );

  const handleEditingFocusChange = useCallback(
    async (e: Event) => {
      const value = (e.target as HTMLSelectElement).value as 'fix_problems' | 'style_only' | 'both';
      const updated = await api.updateSettings(project.id, {
        editingFocus: value,
      });
      onSettingsChange?.(updated);
    },
    [project.id, onSettingsChange]
  );

  const buildOptions = (): ChapterTranslationOptions => {
    const opts: ChapterTranslationOptions = { stages: selectedStages };
    if (scope === 'empty') opts.translateOnlyEmpty = true;
    if (scope === 'selected' && selectedParagraphIds.length) {
      opts.paragraphIds = selectedParagraphIds;
    }
    if (panelLanguagePairOverride) {
      opts.languagePair = panelLanguagePairOverride;
    }
    return opts;
  };

  const handleStart = () => {
    trackEvent('chapter_translate', {
      project_id: projectId,
      chapter_id: chapter.id,
    });
    startTranslation(buildOptions());
  };

  return (
    <div class="translation-panel">
      <div class="translation-panel-section">
        <div class="translation-panel-label">{t('translationPanel.scope', 'Объём')}</div>
        <div class="translation-panel-scope">
          <label class="translation-panel-radio">
            <input
              type="radio"
              name="scope"
              checked={scope === 'full'}
              onChange={() => setScope('full')}
              disabled={translating}
            />
            <span>{t('translationPanel.scopeFull', 'Вся глава')}</span>
          </label>
          <label class="translation-panel-radio">
            <input
              type="radio"
              name="scope"
              checked={scope === 'empty'}
              onChange={() => setScope('empty')}
              disabled={translating || emptyCount === 0}
            />
            <span>
              {t('translationPanel.scopeEmpty', { count: emptyCount }, `Пустые (${emptyCount})`)}
            </span>
          </label>
          <label class="translation-panel-radio">
            <input
              type="radio"
              name="scope"
              checked={scope === 'selected'}
              onChange={() => setScope('selected')}
              disabled={translating}
            />
            <span>
              {t(
                'translationPanel.scopeSelected',
                { count: selectedParagraphIds.length },
                `Выбранные (${selectedParagraphIds.length})`
              )}
            </span>
          </label>
        </div>
        <div class="translation-panel-actions-inline">
          <button
            type="button"
            class="translation-panel-link"
            onClick={onSelectAllEmpty}
            disabled={translating || emptyCount === 0}
          >
            {t('chapter.selectAll')}
          </button>
          <span class="translation-panel-sep">|</span>
          <button
            type="button"
            class="translation-panel-link"
            onClick={onDeselectAll}
            disabled={translating}
          >
            {t('chapter.deselectAll')}
          </button>
        </div>
      </div>

      <div class="translation-panel-section">
        <div class="translation-panel-label">{t('translationPanel.stages', 'Стадии')}</div>
        <div class="translation-panel-stages">
          {STAGE_ORDER.map((stage) => {
            const checked = selectedStages.includes(stage);
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
                class={`translation-panel-stage-btn ${checked ? 'active' : ''}`}
                title={title}
                style={{ margin: 0, cursor: translating ? 'not-allowed' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={translating}
                  onChange={() => toggleStage(stage)}
                  style={{ marginRight: '0.35rem', accentColor: 'var(--accent)' }}
                />
                {icon} {label}
              </label>
            );
          })}
        </div>
        <span class="translation-panel-hint">
          {t('translationPanel.stagesMultiHint', 'Можно выбрать несколько стадий')}
        </span>
      </div>

      <div class="translation-panel-section translation-panel-language-pair">
        <div class="translation-panel-language-pair-header">
          <span class="translation-panel-label">{t('processChapters.languagePairLabel')}</span>
          {hasLanguageOverride && (
            <button
              type="button"
              class="translation-panel-link"
              onClick={() => {
                setPanelLanguagePair(projectDefaultPair);
                setLanguageOverrideAck(false);
              }}
              disabled={translating}
            >
              {t('processChapters.useProjectLanguagePair')}
            </button>
          )}
        </div>
        <ProjectLanguagePairFields
          idPrefix="chapter-translate"
          compact
          sourceDisabled={translating}
          sourceLanguage={panelLanguagePair.sourceLanguage}
          targetLanguage={panelLanguagePair.targetLanguage}
          onSourceLanguageChange={(value: ProjectSourceLanguage) => {
            setPanelLanguagePair((prev) => ({ ...prev, sourceLanguage: value }));
            setLanguageOverrideAck(false);
          }}
          onTargetLanguageChange={(value) => {
            setPanelLanguagePair((prev) => ({ ...prev, targetLanguage: value }));
            setLanguageOverrideAck(false);
          }}
        />
        {!hasLanguageOverride && (
          <span class="translation-panel-hint">{t('processChapters.languagePairDefaultHint')}</span>
        )}
        {languageOverrideWarnings.map((warning) => (
          <p key={warning} class="translation-panel-language-warning" role="alert">
            {warning}
          </p>
        ))}
        {needsLanguageOverrideAck && (
          <label class="translation-panel-language-ack">
            <input
              type="checkbox"
              checked={languageOverrideAck}
              disabled={translating}
              onChange={(e) => setLanguageOverrideAck((e.target as HTMLInputElement).checked)}
            />
            {t('processChapters.languageOverrideAck')}
          </label>
        )}
      </div>

      {selectedStages.includes('editing') && (
        <div class="translation-panel-section translation-panel-editing-settings">
          <div class="translation-panel-label">
            {t('projectInfo.editingSettingsLabel', 'Настройки редактуры')}
          </div>
          <label
            class="translation-panel-editing-toggle"
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
              onChange={handleToggleIncludeGlossaryInEditing}
              disabled={translating}
              style={{
                width: '18px',
                height: '18px',
                marginTop: '2px',
                cursor: translating ? 'not-allowed' : 'pointer',
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
              onChange={handleEditingFocusChange}
              disabled={translating}
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
              <option value="fix_problems">{t('settings.editingFocus.fix_problems')}</option>
              <option value="style_only">{t('settings.editingFocus.style_only')}</option>
              <option value="both">{t('settings.editingFocus.both')}</option>
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
              onChange={handleEditingStylePresetChange}
              disabled={translating}
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

      <div class="translation-panel-section translation-panel-estimate">
        {estimatedTokens > 0 && (
          <span class="translation-panel-tokens">
            {t(
              'translationPanel.estimatedTokens',
              { tokens: estimatedTokens.toLocaleString() },
              `~${estimatedTokens.toLocaleString()} токенов`
            )}
          </span>
        )}
      </div>

      <div class="translation-panel-section translation-panel-buttons">
        {translating ? (
          <Button variant="secondary" size="sm" onClick={onCancelTranslation}>
            <Icon name="stop_circle" size="sm" /> {t('chapter.cancelTranslate')}
            {chunkProgress && chunkProgress.totalChunks > 0 && (
              <span class="translation-chunk-progress">
                {' '}
                ({chunkProgress.chunksDone}/{chunkProgress.totalChunks})
              </span>
            )}
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStart}
              disabled={
                selectedStages.length === 0 ||
                (scope === 'empty' && emptyCount === 0) ||
                (scope === 'selected' && selectedParagraphIds.length === 0) ||
                chapter.status === 'translating' ||
                (needsLanguageOverrideAck && !languageOverrideAck)
              }
            >
              <Icon name="translate" size="sm" /> {t('translationPanel.start', 'Запустить')}
            </Button>
            {onMarkAsTranslated &&
              chapter.paragraphs &&
              chapter.paragraphs.length > 0 &&
              (chapter.status === 'pending' ||
                chapter.status === 'analyzed' ||
                chapter.status === 'error') && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onMarkAsTranslated}
                  disabled={translating || markingAsTranslated}
                  title={t('markAsTranslated.title', 'Пометить как переведённую')}
                >
                  {markingAsTranslated ? (
                    <span class="spinner" />
                  ) : (
                    <Icon name="check_circle" size="sm" />
                  )}{' '}
                  {t('markAsTranslated.button', 'Пометить как переведённую')}
                </Button>
              )}
          </>
        )}
      </div>
    </div>
  );
}
