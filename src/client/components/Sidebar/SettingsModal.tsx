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
import {
  DEFAULT_TEXT_BLOCK_TYPES,
  LITRPG_PRESET,
  EPISTOLARY_PRESET,
  BLOCK_PREVIEW_SAMPLES,
  getCustomBlockPreview,
} from '../../constants/text-block-presets';
import './SettingsModal.css';

/**
 * Promo models (2.5M tokens/day) that support Chat Completions API.
 * Excludes responses-only models (gpt-5.1-codex-mini, codex-mini-latest).
 * Descriptions from i18n settings.modelDesc.<value>.
 */
const MODELS: { value: string; label: string }[] = [
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'o1-mini', label: 'O1 Mini' },
  { value: 'o3-mini', label: 'O3 Mini' },
  { value: 'o4-mini', label: 'O4 Mini' },
];

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
    return settings.model || 'gpt-4.1-mini';
  };

  const isModelInList = (modelId: string) => MODELS.some((m) => m.value === modelId);

  /** Models that only support default temperature (gpt-5*, o1-, o3-, o4-). Match backend provider. */
  const modelUsesDefaultTemperature = (modelId: string) => {
    const m = (modelId || '').toLowerCase();
    return (
      m.startsWith('o1-') || m.startsWith('o3-') || m.startsWith('o4-') || m.startsWith('gpt-5')
    );
  };

  /** Reasoning/long-thinking models: not allowed for analysis (too slow, 1–5 min per request). */
  const isReasoningModel = (modelId: string) => modelUsesDefaultTemperature(modelId);
  const ANALYSIS_ALLOWED_MODELS = MODELS.filter((m) => !isReasoningModel(m.value));
  const ANALYSIS_RECOMMENDED = ['gpt-4.1-mini', 'gpt-4o-mini'];

  const handleStageModelChange = async (
    stage: 'analysis' | 'translation' | 'editing',
    model: string
  ) => {
    const currentStageModels = settings.stageModels || {
      analysis: settings.model || 'gpt-4.1-mini',
      translation: settings.model || 'gpt-4.1-mini',
      editing: settings.model || 'gpt-4.1-mini',
    };

    const updated = await api.updateSettings(project.id, {
      stageModels: {
        ...currentStageModels,
        [stage]: model,
      },
    });
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
              Text Blocks & Custom Instructions
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              Special formatting (system messages, notes, letters) and extra rules for
              translator/editor.
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Presets:</span>{' '}
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => handleLoadPreset(LITRPG_PRESET)}
                style={{ marginRight: '0.5rem' }}
              >
                LitRPG
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => handleLoadPreset(EPISTOLARY_PRESET)}
              >
                Epistolary
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
                      <span class="text-block-preview-label">Пример:</span>
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
              Для кастомных типов: при создании выберите пресет стиля (system-message, note, skill и
              т.д.) — он задаст внешний вид.
            </div>
            <div class="text-blocks-format-help">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => setShowFormatHelp(!showFormatHelp)}
                style={{ marginTop: '0.75rem' }}
              >
                {showFormatHelp ? t('common.close') : t('chapterList.viewQueue', 'View')} Формат для
                интеграции
              </button>
              {showFormatHelp && (
                <div class="text-blocks-format-content">
                  <p style={{ marginBottom: '0.5rem' }}>
                    Если перевод уже содержит выделения, используйте маркеры (не HTML):
                  </p>
                  <code class="text-blocks-format-code">
                    {'{{block:тип-id}}'}текст{'{{/block:тип-id}}'}
                  </code>
                  <p style={{ marginTop: '0.75rem', marginBottom: '0.35rem' }}>Примеры:</p>
                  <pre class="text-blocks-format-pre">
                    {`{{block:system-message}}Level Up! Сила +5{{/block:system-message}}
{{block:note}}Дорогой друг, надеюсь это письмо...{{/block:note}}
Маг призвал {{block:skill}}Огненный шар{{/block:skill}} к врагу.`}
                  </pre>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                    Типы: system-message, note, notification, skill, inner-voice. HTML не
                    поддерживается.
                  </p>
                </div>
              )}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label
                htmlFor="settings-custom-instructions-translation"
                style={{ display: 'block', fontWeight: 500, marginBottom: '0.35rem' }}
              >
                Custom instructions for translator
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
                placeholder="e.g. Wrap system messages in {{block:system-message}}..."
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
                value={settings.editingFocus ?? 'both'}
                onChange={async (e) => {
                  const value = (e.target as HTMLSelectElement).value as
                    | 'fix_problems'
                    | 'style_only'
                    | 'both';
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
                <option value="fix_problems">{t('settings.editingFocus.fix_problems')}</option>
                <option value="style_only">{t('settings.editingFocus.style_only')}</option>
                <option value="both">{t('settings.editingFocus.both')}</option>
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
                Custom instructions for editor
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
                placeholder="e.g. Preserve all {{block:...}} markers exactly."
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
                  {isReasoningModel(getStageModel('analysis')) && (
                    <option value={getStageModel('analysis')}>
                      {getStageModel('analysis')} — {t('settings.notRecommendedForAnalysis')}
                    </option>
                  )}
                  {!isModelInList(getStageModel('analysis')) &&
                    !isReasoningModel(getStageModel('analysis')) && (
                      <option value={getStageModel('analysis')}>{getStageModel('analysis')}</option>
                    )}
                  <optgroup label={`⭐ ${t('settings.recommendedForAnalysis')}`}>
                    {ANALYSIS_ALLOWED_MODELS.filter((m) =>
                      ANALYSIS_RECOMMENDED.includes(m.value)
                    ).map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label} — {t(`settings.modelDesc.${m.value}`)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t('settings.otherModels')}>
                    {ANALYSIS_ALLOWED_MODELS.filter(
                      (m) => !ANALYSIS_RECOMMENDED.includes(m.value)
                    ).map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label} — {t(`settings.modelDesc.${m.value}`)}
                      </option>
                    ))}
                  </optgroup>
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
                      {!isModelInList(getStageModel('translation')) && (
                        <option value={getStageModel('translation')}>
                          {getStageModel('translation')}
                        </option>
                      )}
                      <optgroup label={`⭐ ${t('settings.recommendedForTranslation')}`}>
                        {MODELS.filter((m) =>
                          ['gpt-5-mini', 'gpt-4.1-mini', 'o3-mini', 'o4-mini'].includes(m.value)
                        ).map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label} — {t(`settings.modelDesc.${m.value}`)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label={t('settings.otherModels')}>
                        {MODELS.filter(
                          (m) =>
                            !['gpt-5-mini', 'gpt-4.1-mini', 'o3-mini', 'o4-mini'].includes(m.value)
                        ).map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label} — {t(`settings.modelDesc.${m.value}`)}
                          </option>
                        ))}
                      </optgroup>
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
                      {!isModelInList(getStageModel('editing')) && (
                        <option value={getStageModel('editing')}>{getStageModel('editing')}</option>
                      )}
                      <optgroup label={`⭐ ${t('settings.recommendedForEditing')}`}>
                        {MODELS.filter((m) =>
                          ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1-nano', 'gpt-5-nano'].includes(
                            m.value
                          )
                        ).map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label} — {t(`settings.modelDesc.${m.value}`)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label={t('settings.otherModels')}>
                        {MODELS.filter(
                          (m) =>
                            !['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1-nano', 'gpt-5-nano'].includes(
                              m.value
                            )
                        ).map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label} — {t(`settings.modelDesc.${m.value}`)}
                          </option>
                        ))}
                      </optgroup>
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
