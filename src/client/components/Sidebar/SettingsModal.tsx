import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Project, ProjectSettings, TextBlockType, CustomInstructions } from '../../types';
import { Modal, Button, Icon } from '../ui';
import { ProjectLanguagePairFields } from '../Project/ProjectLanguagePairFields';
import { api } from '../../api/client';
import { invalidateProject } from '../../store/projects';
import {
  normalizeProjectSourceLanguage,
  normalizeProjectTargetLanguage,
  PROJECT_DEFAULT_TARGET_LANGUAGE,
  type ProjectSourceLanguage,
  type ProjectTargetLanguage,
} from '../../constants/translationLanguages';
import { normalizeEditingFocus, type EditingFocus } from '../../../shared/editing-focus.js';
import {
  DEFAULT_TEXT_BLOCK_TYPES,
  LITRPG_PRESET,
  EPISTOLARY_PRESET,
  BLOCK_PREVIEW_SAMPLES,
  getCustomBlockPreview,
} from '../../constants/text-block-presets';
import {
  DEFAULT_LLM_MODEL,
  isModelInProdSettingsList,
  modelUsesDefaultTemperature,
  modelsForProdSettings,
} from '../../../shared/llmModels.js';
import {
  defaultExecutionModeForModel,
  TRANSLATE_EXECUTION_MODES,
  type TranslateExecutionMode,
} from '../../../shared/translate-execution-modes.js';
import {
  defaultEditExecutionModeForModel,
  EDIT_EXECUTION_MODES,
  type EditExecutionMode,
} from '../../../shared/edit-execution-modes.js';
import {
  executionPresetI18nKey,
  executionPresetHintI18nKey,
} from '../../../shared/execution-presets-ui.js';
import './SettingsModal.css';

interface SettingsModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: ProjectSettings) => void;
  onRefreshProject?: () => Promise<void>;
}

export function SettingsModal({
  project,
  isOpen,
  onClose,
  onSettingsChange,
  onRefreshProject,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const settings = project.settings || {};
  const isOriginalReadingMode = settings.originalReadingMode ?? false;

  // Get current model for a stage (with fallbacks). Show saved value even if not in MODELS list.
  const getStageModel = (stage: 'analysis' | 'translation' | 'editing'): string => {
    if (settings.stageModels) {
      const current = settings.stageModels[stage];
      if (current && typeof current === 'string') return current;
    }
    return settings.model || DEFAULT_LLM_MODEL;
  };

  const effectiveTranslateMode: TranslateExecutionMode =
    settings.translateExecutionMode ?? defaultExecutionModeForModel(getStageModel('translation'));
  const effectiveEditMode: EditExecutionMode =
    settings.editExecutionMode ?? defaultEditExecutionModeForModel(getStageModel('editing'));

  const renderProdModelOptions = (stage: 'analysis' | 'translation' | 'editing') => {
    const current = getStageModel(stage);
    const options = modelsForProdSettings(stage);
    const inList = isModelInProdSettingsList(stage, current);
    return (
      <>
        {!inList && (
          <option value={current}>
            {current} ({t('settings.savedModel')})
          </option>
        )}
        {options.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </>
    );
  };

  const handleStageModelChange = async (
    stage: 'analysis' | 'translation' | 'editing',
    model: string
  ) => {
    const currentStageModels = settings.stageModels || {
      analysis: settings.model || DEFAULT_LLM_MODEL,
      translation: settings.model || DEFAULT_LLM_MODEL,
      editing: settings.model || DEFAULT_LLM_MODEL,
    };

    const patch: Record<string, unknown> = {
      stageModels: {
        ...currentStageModels,
        [stage]: model,
      },
    };

    if (stage === 'translation') {
      patch.translateExecutionMode = defaultExecutionModeForModel(model);
    }
    if (stage === 'editing') {
      patch.editExecutionMode = defaultEditExecutionModeForModel(model);
    }

    const updated = await api.updateSettings(project.id, patch);
    onSettingsChange(updated);
  };

  const handleExecutionModeChange = async (
    field: 'translateExecutionMode' | 'editExecutionMode',
    value: TranslateExecutionMode | EditExecutionMode
  ) => {
    const updated = await api.updateSettings(project.id, { [field]: value });
    onSettingsChange(updated);
  };

  const defaultTemp = settings.temperature ?? 0.5;
  const getStageTemperature = (stage: 'analysis' | 'translation' | 'editing') =>
    settings.temperatureByStage?.[stage] ?? defaultTemp;

  const handleStageTemperatureChange = async (
    stage: 'analysis' | 'translation' | 'editing',
    e: Event
  ) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    const temperature = value / 100;
    const current = settings.temperatureByStage || {};
    const updated = await api.updateSettings(project.id, {
      temperatureByStage: { ...current, [stage]: temperature },
    });
    onSettingsChange(updated);
  };

  const toggleOriginalReadingMode = async () => {
    const current = settings.originalReadingMode ?? false;
    const updated = await api.updateSettings(project.id, {
      originalReadingMode: !current,
    });
    onSettingsChange(updated);
    if (onRefreshProject) {
      await onRefreshProject();
    }
  };

  const includeGlossaryInAnalysis = settings.includeGlossaryInAnalysis ?? true;
  const includeGlossaryInTranslation = settings.includeGlossaryInTranslation ?? true;
  const includeGlossaryInEditing = settings.includeGlossaryInEditing ?? true;
  const includeTextBlockTypesInTranslation = settings.includeTextBlockTypesInTranslation ?? false;

  const toggleIncludeGlossaryInAnalysis = async () => {
    const updated = await api.updateSettings(project.id, {
      includeGlossaryInAnalysis: !includeGlossaryInAnalysis,
    });
    onSettingsChange(updated);
  };

  const toggleIncludeGlossaryInTranslation = async () => {
    const updated = await api.updateSettings(project.id, {
      includeGlossaryInTranslation: !includeGlossaryInTranslation,
    });
    onSettingsChange(updated);
  };

  const toggleIncludeGlossaryInEditing = async () => {
    const updated = await api.updateSettings(project.id, {
      includeGlossaryInEditing: !includeGlossaryInEditing,
    });
    onSettingsChange(updated);
  };

  const toggleIncludeTextBlockTypesInTranslation = async () => {
    const updated = await api.updateSettings(project.id, {
      includeTextBlockTypesInTranslation: !includeTextBlockTypesInTranslation,
    });
    onSettingsChange(updated);
  };

  // Text blocks & custom instructions
  const textBlockTypes = settings.textBlockTypes ?? [];
  const customInstructions = settings.customInstructions ?? {};

  const handleToggleBlockType = async (id: string, enabled: boolean) => {
    const current = textBlockTypes.length > 0 ? textBlockTypes : DEFAULT_TEXT_BLOCK_TYPES;
    const updated = await api.updateSettings(project.id, {
      textBlockTypes: current.map((bt) => (bt.id === id ? { ...bt, enabled } : bt)),
    });
    onSettingsChange(updated);
  };

  const handleLoadPreset = async (preset: TextBlockType[]) => {
    const updated = await api.updateSettings(project.id, { textBlockTypes: preset });
    onSettingsChange(updated);
  };

  const handleCustomInstructionsChange = async (
    field: 'translation' | 'editing',
    value: string
  ) => {
    const next = { ...customInstructions, [field]: value || undefined };
    const updated = await api.updateSettings(project.id, {
      customInstructions: Object.keys(next).length ? next : undefined,
    });
    onSettingsChange(updated);
  };

  const displayBlockTypes = textBlockTypes.length > 0 ? textBlockTypes : DEFAULT_TEXT_BLOCK_TYPES;

  const [customInstructionsLocal, setCustomInstructionsLocal] = useState<CustomInstructions>({});
  const [showFormatHelp, setShowFormatHelp] = useState(false);
  const [sourceLanguageDraft, setSourceLanguageDraft] = useState<ProjectSourceLanguage>('en');
  const [targetLanguageDraft, setTargetLanguageDraft] = useState<ProjectTargetLanguage>(
    PROJECT_DEFAULT_TARGET_LANGUAGE
  );
  const [savingLanguages, setSavingLanguages] = useState(false);
  const [languageSaveError, setLanguageSaveError] = useState<string | null>(null);

  const glossaryCount = 'glossary' in project ? project.glossary.length : 0;
  const languagePairLocked =
    glossaryCount > 0 || project.chapters.some((c) => c.status !== 'pending');

  useEffect(() => {
    if (isOpen) {
      setCustomInstructionsLocal({ ...customInstructions });
      const target = normalizeProjectTargetLanguage(project.targetLanguage);
      setTargetLanguageDraft(target);
      setSourceLanguageDraft(normalizeProjectSourceLanguage(project.sourceLanguage, target));
      setLanguageSaveError(null);
    }
  }, [
    isOpen,
    project.id,
    customInstructions.translation,
    customInstructions.editing,
    project.sourceLanguage,
    project.targetLanguage,
  ]);

  const handleSaveLanguages = async () => {
    if (languagePairLocked) return;
    setSavingLanguages(true);
    setLanguageSaveError(null);
    try {
      await api.updateProjectLanguages(project.id, sourceLanguageDraft, targetLanguageDraft);
      invalidateProject(project.id);
      if (onRefreshProject) {
        await onRefreshProject();
      }
    } catch (error) {
      setLanguageSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingLanguages(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings.title')} size="large">
      <div class="settings-modal">
        {/* Translation language pair */}
        <div class="settings-language-pair-section">
          <h3 class="settings-section-title">{t('settings.languagePairSection')}</h3>
          {languagePairLocked ? (
            <>
              <p class="settings-language-pair-locked">{t('project.languagePairLocked')}</p>
              <ProjectLanguagePairFields
                idPrefix="settings-project"
                sourceLanguage={project.sourceLanguage || 'en'}
                targetLanguage={project.targetLanguage || PROJECT_DEFAULT_TARGET_LANGUAGE}
                onSourceLanguageChange={() => {}}
                sourceDisabled
                targetDisabled
              />
            </>
          ) : (
            <>
              <ProjectLanguagePairFields
                idPrefix="settings-project"
                sourceLanguage={sourceLanguageDraft}
                targetLanguage={targetLanguageDraft}
                onSourceLanguageChange={setSourceLanguageDraft}
                onTargetLanguageChange={setTargetLanguageDraft}
              />
              {targetLanguageDraft !== normalizeProjectTargetLanguage(project.targetLanguage) && (
                <p class="settings-language-pair-hint">
                  {t('project.languagePairTargetHint', {
                    targetLanguageLabel: t(`language.${targetLanguageDraft}`),
                  })}
                </p>
              )}
              <Button
                size="sm"
                variant="secondary"
                loading={savingLanguages}
                disabled={
                  sourceLanguageDraft ===
                    normalizeProjectSourceLanguage(project.sourceLanguage, targetLanguageDraft) &&
                  targetLanguageDraft === normalizeProjectTargetLanguage(project.targetLanguage)
                }
                onClick={handleSaveLanguages}
                style={{ marginTop: '0.5rem' }}
              >
                {t('settings.saveLanguagePair')}
              </Button>
            </>
          )}
          {languageSaveError && (
            <p class="settings-language-pair-error" role="alert">
              {languageSaveError}
            </p>
          )}
        </div>

        {/* Original Reading Mode Toggle */}
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                {t('settings.originalReadingMode')}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                {isOriginalReadingMode
                  ? t('settings.originalReadingModeDescOn')
                  : t('settings.originalReadingModeDescOff')}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isOriginalReadingMode}
                onChange={toggleOriginalReadingMode}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                aria-label={t('settings.originalReadingMode')}
              />
            </label>
          </div>
        </div>

        {/* Glossary usage (when translation is available) */}
        {!isOriginalReadingMode && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
              {t('settings.glossarySectionTitle')}
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
                marginBottom: '0.75rem',
              }}
            >
              <input
                type="checkbox"
                checked={includeGlossaryInAnalysis}
                onChange={toggleIncludeGlossaryInAnalysis}
                style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer' }}
                aria-label={t('settings.includeGlossaryInAnalysis')}
              />
              <div>
                <div style={{ fontWeight: 500 }}>{t('settings.includeGlossaryInAnalysis')}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {t('settings.includeGlossaryInAnalysisHint')}
                </div>
              </div>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={includeGlossaryInTranslation}
                onChange={toggleIncludeGlossaryInTranslation}
                style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer' }}
                aria-label={t('settings.includeGlossaryInTranslation')}
              />
              <div>
                <div style={{ fontWeight: 500 }}>{t('settings.includeGlossaryInTranslation')}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {t('settings.includeGlossaryInTranslationHint')}
                </div>
              </div>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
                marginTop: '0.75rem',
              }}
            >
              <input
                type="checkbox"
                checked={includeGlossaryInEditing}
                onChange={toggleIncludeGlossaryInEditing}
                style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer' }}
                aria-label={t('settings.includeGlossaryInEditing')}
              />
              <div>
                <div style={{ fontWeight: 500 }}>{t('settings.includeGlossaryInEditing')}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {t('settings.includeGlossaryInEditingHint')}
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Text Blocks & Custom Instructions */}
        {!isOriginalReadingMode && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
              {t('settings.textBlocksTitle')}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              {t('settings.textBlocksDesc')}
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
                marginBottom: '0.75rem',
              }}
            >
              <input
                type="checkbox"
                checked={includeTextBlockTypesInTranslation}
                onChange={toggleIncludeTextBlockTypesInTranslation}
                style={{
                  width: '18px',
                  height: '18px',
                  marginTop: '2px',
                  cursor: 'pointer',
                }}
                aria-label={t('settings.includeTextBlockTypesInTranslation')}
              />
              <div>
                <div style={{ fontWeight: 500 }}>
                  {t('settings.includeTextBlockTypesInTranslation')}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {t('settings.includeTextBlockTypesInTranslationHint')}
                </div>
              </div>
            </label>
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                {t('settings.textBlocksPresets')}
              </span>{' '}
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => handleLoadPreset(LITRPG_PRESET)}
                style={{ marginRight: '0.5rem' }}
              >
                {t('settings.textBlocksPresetLitRpg')}
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => handleLoadPreset(EPISTOLARY_PRESET)}
              >
                {t('settings.textBlocksPresetEpistolary')}
              </button>
            </div>
            <div class="text-blocks-list">
              {displayBlockTypes.map((bt) => {
                const previewSample = BLOCK_PREVIEW_SAMPLES[bt.id];
                const previewHtml = previewSample ? previewSample.html : getCustomBlockPreview(bt);
                return (
                  <div key={bt.id} class="text-block-row">
                    <div class="text-block-left">
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.5rem',
                          cursor: 'pointer',
                          marginBottom: '0.25rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={bt.enabled}
                          onChange={() => handleToggleBlockType(bt.id, !bt.enabled)}
                          style={{
                            width: '18px',
                            height: '18px',
                            marginTop: '2px',
                            cursor: 'pointer',
                          }}
                          aria-label={bt.name}
                        />
                        <div>
                          <span style={{ fontWeight: 500 }}>
                            {bt.icon ? `${bt.icon} ` : ''}
                            {bt.name}
                          </span>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-dim)',
                              marginTop: '0.2rem',
                            }}
                          >
                            {bt.description}
                          </div>
                        </div>
                      </label>
                    </div>
                    <div class="text-block-preview">
                      <span class="text-block-preview-label">
                        {t('settings.textBlocksPreviewLabel')}
                      </span>
                      <div
                        class="text-block-preview-content"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {t('settings.textBlocksCustomTypesHint')}
            </div>
            <div class="text-blocks-format-help">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => setShowFormatHelp(!showFormatHelp)}
                style={{ marginTop: '0.75rem' }}
              >
                {showFormatHelp ? t('common.close') : t('settings.textBlocksFormatHelp')}
              </button>
              {showFormatHelp && (
                <div class="text-blocks-format-content">
                  <p style={{ marginBottom: '0.5rem' }}>{t('settings.textBlocksFormatIntro')}</p>
                  <code class="text-blocks-format-code">
                    {'{{block:тип-id}}'}текст{'{{/block:тип-id}}'}
                  </code>
                  <p style={{ marginTop: '0.75rem', marginBottom: '0.35rem' }}>
                    {t('settings.textBlocksFormatExamples')}
                  </p>
                  <pre class="text-blocks-format-pre">
                    {t('settings.textBlocksFormatPreExample')}
                  </pre>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                    {t('settings.textBlocksFormatTypes')}
                  </p>
                </div>
              )}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label
                htmlFor="settings-custom-instructions-translation"
                style={{ display: 'block', fontWeight: 500, marginBottom: '0.35rem' }}
              >
                {t('settings.customInstructionsTranslation')}
              </label>
              <textarea
                id="settings-custom-instructions-translation"
                value={customInstructionsLocal.translation ?? customInstructions.translation ?? ''}
                onBlur={(e) =>
                  handleCustomInstructionsChange(
                    'translation',
                    (e.target as HTMLTextAreaElement).value
                  )
                }
                onInput={(e) => {
                  const v = (e.target as HTMLTextAreaElement).value;
                  setCustomInstructionsLocal((p) => ({ ...p, translation: v }));
                }}
                placeholder={t('settings.customInstructionsTranslationPlaceholder')}
                rows={2}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.35rem' }}>
                {t('settings.editingFocus')}
              </label>
              <select
                class="setting-select"
                value={normalizeEditingFocus(settings.editingFocus)}
                onChange={async (e) => {
                  const value = (e.target as HTMLSelectElement).value as EditingFocus;
                  const updated = await api.updateSettings(project.id, {
                    editingFocus: value,
                  });
                  onSettingsChange(updated);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
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
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.35rem' }}>
                {t('settings.editingStylePreset')}
              </label>
              <select
                class="setting-select"
                value={settings.editingStylePreset ?? 'default'}
                onChange={async (e) => {
                  const value = (e.target as HTMLSelectElement).value as
                    | 'default'
                    | 'literary'
                    | 'minimal'
                    | 'ai_revivification';
                  const updated = await api.updateSettings(project.id, {
                    editingStylePreset: value,
                  });
                  onSettingsChange(updated);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
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
            <div style={{ marginTop: '0.75rem' }}>
              <label
                htmlFor="settings-custom-instructions-editing"
                style={{ display: 'block', fontWeight: 500, marginBottom: '0.35rem' }}
              >
                {t('settings.customInstructionsEditing')}
              </label>
              <textarea
                id="settings-custom-instructions-editing"
                value={customInstructionsLocal.editing ?? customInstructions.editing ?? ''}
                onBlur={(e) =>
                  handleCustomInstructionsChange('editing', (e.target as HTMLTextAreaElement).value)
                }
                onInput={(e) => {
                  const v = (e.target as HTMLTextAreaElement).value;
                  setCustomInstructionsLocal((p) => ({ ...p, editing: v }));
                }}
                placeholder={t('settings.customInstructionsEditingPlaceholder')}
                rows={2}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>
        )}

        {/* Settings Panel: one row per stage = model + creativity */}
        <div class="settings-panel">
          <div class="setting-group setting-group-unified">
            <label class="setting-label">
              {t('settings.modelsByStage')} · {t('settings.creativityByStage', 'Креативность')}
            </label>
            <div class="stage-rows">
              {/* Analysis - always visible */}
              <div class="stage-row">
                <span class="stage-row-label">{t('settings.analysisStage')}</span>
                <select
                  class="setting-select stage-row-select"
                  value={getStageModel('analysis')}
                  onChange={(e) =>
                    handleStageModelChange('analysis', (e.target as HTMLSelectElement).value)
                  }
                >
                  {renderProdModelOptions('analysis')}
                </select>
                <div
                  class={`slider-container stage-row-slider${modelUsesDefaultTemperature(getStageModel('analysis')) ? ' slider-disabled' : ''}`}
                >
                  <input
                    type="range"
                    class="slider"
                    min="0"
                    max="100"
                    value={Math.round(getStageTemperature('analysis') * 100)}
                    disabled={modelUsesDefaultTemperature(getStageModel('analysis'))}
                    onInput={(e) => {
                      const v = parseInt((e.target as HTMLInputElement).value, 10);
                      const el = e.currentTarget.parentElement?.querySelector('.slider-value');
                      if (el) el.textContent = (v / 100).toFixed(1);
                    }}
                    onChange={(e) => handleStageTemperatureChange('analysis', e)}
                  />
                  <span class="slider-value">{getStageTemperature('analysis').toFixed(1)}</span>
                  {modelUsesDefaultTemperature(getStageModel('analysis')) && (
                    <span class="slider-hint" title={t('settings.creativityNotConfigurable')}>
                      {t('settings.creativityNotConfigurable')}
                    </span>
                  )}
                </div>
              </div>

              {!isOriginalReadingMode && (
                <>
                  <div class="stage-row">
                    <span class="stage-row-label">{t('settings.translationStage')}</span>
                    <select
                      class="setting-select stage-row-select"
                      value={getStageModel('translation')}
                      onChange={(e) =>
                        handleStageModelChange('translation', (e.target as HTMLSelectElement).value)
                      }
                    >
                      {renderProdModelOptions('translation')}
                    </select>
                    <div
                      class={`slider-container stage-row-slider${modelUsesDefaultTemperature(getStageModel('translation')) ? ' slider-disabled' : ''}`}
                    >
                      <input
                        type="range"
                        class="slider"
                        min="0"
                        max="100"
                        value={Math.round(getStageTemperature('translation') * 100)}
                        disabled={modelUsesDefaultTemperature(getStageModel('translation'))}
                        onInput={(e) => {
                          const v = parseInt((e.target as HTMLInputElement).value, 10);
                          const el = e.currentTarget.parentElement?.querySelector('.slider-value');
                          if (el) el.textContent = (v / 100).toFixed(1);
                        }}
                        onChange={(e) => handleStageTemperatureChange('translation', e)}
                      />
                      <span class="slider-value">
                        {getStageTemperature('translation').toFixed(1)}
                      </span>
                      {modelUsesDefaultTemperature(getStageModel('translation')) && (
                        <span class="slider-hint" title={t('settings.creativityNotConfigurable')}>
                          {t('settings.creativityNotConfigurable')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div class="stage-row">
                    <span class="stage-row-label">{t('settings.editingStage')}</span>
                    <select
                      class="setting-select stage-row-select"
                      value={getStageModel('editing')}
                      onChange={(e) =>
                        handleStageModelChange('editing', (e.target as HTMLSelectElement).value)
                      }
                    >
                      {renderProdModelOptions('editing')}
                    </select>
                    <div
                      class={`slider-container stage-row-slider${modelUsesDefaultTemperature(getStageModel('editing')) ? ' slider-disabled' : ''}`}
                    >
                      <input
                        type="range"
                        class="slider"
                        min="0"
                        max="100"
                        value={Math.round(getStageTemperature('editing') * 100)}
                        disabled={modelUsesDefaultTemperature(getStageModel('editing'))}
                        onInput={(e) => {
                          const v = parseInt((e.target as HTMLInputElement).value, 10);
                          const el = e.currentTarget.parentElement?.querySelector('.slider-value');
                          if (el) el.textContent = (v / 100).toFixed(1);
                        }}
                        onChange={(e) => handleStageTemperatureChange('editing', e)}
                      />
                      <span class="slider-value">{getStageTemperature('editing').toFixed(1)}</span>
                      {modelUsesDefaultTemperature(getStageModel('editing')) && (
                        <span class="slider-hint" title={t('settings.creativityNotConfigurable')}>
                          {t('settings.creativityNotConfigurable')}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            {!isOriginalReadingMode && (
              <div class="settings-engine-execution">
                <label class="setting-label">{t('settings.engineExecutionTitle')}</label>
                <div class="setting-row">
                  <label class="setting-label setting-label-inline">
                    {t('settings.translateExecutionMode')}
                  </label>
                  <select
                    class="setting-select"
                    value={effectiveTranslateMode}
                    onChange={(e) =>
                      void handleExecutionModeChange(
                        'translateExecutionMode',
                        (e.target as HTMLSelectElement).value as TranslateExecutionMode
                      )
                    }
                  >
                    {TRANSLATE_EXECUTION_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {t(`settings.executionPreset.${executionPresetI18nKey(m.value)}`)}
                      </option>
                    ))}
                  </select>
                  <span class="setting-hint">
                    {t(
                      `settings.executionPreset.${executionPresetHintI18nKey(effectiveTranslateMode)}`
                    )}
                  </span>
                </div>
                <div class="setting-row">
                  <label class="setting-label setting-label-inline">
                    {t('settings.editExecutionMode')}
                  </label>
                  <select
                    class="setting-select"
                    value={effectiveEditMode}
                    onChange={(e) =>
                      void handleExecutionModeChange(
                        'editExecutionMode',
                        (e.target as HTMLSelectElement).value as EditExecutionMode
                      )
                    }
                  >
                    {EDIT_EXECUTION_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {t(`settings.executionPreset.${executionPresetI18nKey(m.value)}`)}
                      </option>
                    ))}
                  </select>
                  <span class="setting-hint">
                    {t(`settings.executionPreset.${executionPresetHintI18nKey(effectiveEditMode)}`)}
                  </span>
                </div>
              </div>
            )}
            <span class="setting-hint">{t('settings.temperatureHint')}</span>
            {!isOriginalReadingMode && (
              <span class="setting-hint" style={{ marginTop: '0.25rem', display: 'block' }}>
                {t('settings.differentStagesHint')}
              </span>
            )}
          </div>
        </div>

        {/* Stages summary: which models are used per stage (read-only reminder) */}
        {!isOriginalReadingMode && (
          <div class="stages-panel">
            <div class="stages-title">{t('settings.stageModelsTitle', 'Модели по стадиям')}</div>
            <div class="stages-grid" style={{ pointerEvents: 'none', opacity: 0.9 }}>
              <div class="stage-toggle active">
                <span class="stage-icon">
                  <Icon name="manage_search" size="sm" />
                </span>
                <span class="stage-name">{t('settings.stageAnalysis')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {getStageModel('analysis')}
                </span>
              </div>
              <span class="stage-arrow">
                <Icon name="chevron_right" size="sm" />
              </span>
              <div class="stage-toggle active">
                <span class="stage-icon">
                  <Icon name="translate" size="sm" />
                </span>
                <span class="stage-name">{t('settings.stageTranslation')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {getStageModel('translation')}
                </span>
              </div>
              <span class="stage-arrow">
                <Icon name="chevron_right" size="sm" />
              </span>
              <div class="stage-toggle active">
                <span class="stage-icon">
                  <Icon name="edit" size="sm" />
                </span>
                <span class="stage-name">{t('settings.stageEditing')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {getStageModel('editing')}
                </span>
              </div>
            </div>
            <span class="setting-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              {t(
                'settings.stageModelsHint',
                'Стадии перевода выбираются при запуске (панель «Перевод» на главе).'
              )}
            </span>
          </div>
        )}
        {isOriginalReadingMode && (
          <div class="stages-panel">
            <div class="stages-title">{t('settings.stagesTitle')}</div>
            <span class="setting-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              {t('settings.stagesOriginalOnly')}
            </span>
          </div>
        )}

        <div class="settings-modal-footer">
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      </div>
    </Modal>
  );
}
