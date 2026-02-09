import { useTranslation } from 'react-i18next';
import type { Project, ProjectSettings } from '../../types';
import { Modal, Button } from '../ui';
import { api } from '../../api/client';
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
      translation: settings.model || 'gpt-5-mini',
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`⚙️ ${t('settings.title')}`} size="large">
      <div class="settings-modal">
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
                📖 {t('settings.originalReadingMode')}
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

        {/* Settings Panel: one row per stage = model + creativity */}
        <div class="settings-panel">
          <div class="setting-group setting-group-unified">
            <label class="setting-label">
              🤖 {t('settings.modelsByStage')} · 🎨{' '}
              {t('settings.creativityByStage', 'Креативность')}
            </label>
            <div class="stage-rows">
              {/* Analysis - always visible */}
              <div class="stage-row">
                <span class="stage-row-label">🔍 {t('settings.analysisStage')}</span>
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
                    <span class="stage-row-label">🔮 {t('settings.translationStage')}</span>
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
                    <span class="stage-row-label">✨ {t('settings.editingStage')}</span>
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
            <div class="stages-title">⚙️ {t('settings.stageModelsTitle', 'Модели по стадиям')}</div>
            <div class="stages-grid" style={{ pointerEvents: 'none', opacity: 0.9 }}>
              <div class="stage-toggle active">
                <span class="stage-icon">🔍</span>
                <span class="stage-name">{t('settings.stageAnalysis')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {getStageModel('analysis')}
                </span>
              </div>
              <span class="stage-arrow">→</span>
              <div class="stage-toggle active">
                <span class="stage-icon">🔮</span>
                <span class="stage-name">{t('settings.stageTranslation')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {getStageModel('translation')}
                </span>
              </div>
              <span class="stage-arrow">→</span>
              <div class="stage-toggle active">
                <span class="stage-icon">✨</span>
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
            <div class="stages-title">⚙️ {t('settings.stagesTitle')}</div>
            <span class="setting-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              {t('settings.stagesOriginalOnly')}
            </span>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      </div>
    </Modal>
  );
}
