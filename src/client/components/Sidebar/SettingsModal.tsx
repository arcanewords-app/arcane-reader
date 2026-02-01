import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Project, ProjectSettings } from '../../types';
import { Modal, Button } from '../ui';
import { api } from '../../api/client';
import './SettingsModal.css';

/** Free-tier models (2.5M tokens/day). Id, label. Description from i18n settings.modelDesc.<value>. */
const MODELS: { value: string; label: string }[] = [
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'o1-mini', label: 'O1 Mini' },
  { value: 'o3-mini', label: 'O3 Mini' },
  { value: 'o4-mini', label: 'O4 Mini' },
  { value: 'codex-mini-latest', label: 'Codex Mini Latest' },
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

  // Get current model for a stage (with fallbacks)
  const getStageModel = (stage: 'analysis' | 'translation' | 'editing'): string => {
    if (settings.stageModels) {
      const current = settings.stageModels[stage];
      if (MODELS.some((m) => m.value === current)) return current;
    }
    return settings.model || 'gpt-4.1-mini';
  };

  const handleStageModelChange = async (
    stage: 'analysis' | 'translation' | 'editing',
    model: string
  ) => {
    const currentStageModels = settings.stageModels || {
      analysis: settings.model || MODELS[3].value,
      translation: settings.model || MODELS[0].value,
      editing: settings.model || MODELS[3].value,
    };
    
    const updated = await api.updateSettings(project.id, {
      stageModels: {
        ...currentStageModels,
        [stage]: model,
      },
    });
    onSettingsChange(updated);
  };

  const handleTemperatureChange = async (e: Event) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    const temperature = value / 100;
    const updated = await api.updateSettings(project.id, { temperature });
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
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>📖 {t('settings.originalReadingMode')}</div>
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
              />
            </label>
          </div>
        </div>

        {/* Settings Panel */}
        <div class="settings-panel">
          <div class="setting-group">
            <label class="setting-label">🤖 {t('settings.modelsByStage')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Analysis Model - always visible */}
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
                  🔍 {t('settings.analysisStage')}
                </label>
                <select
                  class="setting-select"
                  value={getStageModel('analysis')}
                  onChange={(e) => handleStageModelChange('analysis', (e.target as HTMLSelectElement).value)}
                >
                  <optgroup label={`⭐ ${t('settings.recommendedForAnalysis')}`}>
                    {MODELS.filter((m) => ['gpt-4.1-mini', 'gpt-5.1-codex-mini', 'o3-mini', 'gpt-4o-mini'].includes(m.value)).map((m) => (
                      <option key={m.value} value={m.value}>{m.label} — {t(`settings.modelDesc.${m.value}`)}</option>
                    ))}
                  </optgroup>
                  <optgroup label={t('settings.otherModels')}>
                    {MODELS.filter((m) => !['gpt-4.1-mini', 'gpt-5.1-codex-mini', 'o3-mini', 'gpt-4o-mini'].includes(m.value)).map((m) => (
                      <option key={m.value} value={m.value}>{m.label} — {t(`settings.modelDesc.${m.value}`)}</option>
                    ))}
                  </optgroup>
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '0.25rem' }}>
                  {t('settings.analysisHint')}
                </span>
              </div>
              
              {/* Translation Model - hidden in original reading mode */}
              {!isOriginalReadingMode && (
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
                    🔮 {t('settings.translationStage')}
                  </label>
                  <select
                    class="setting-select"
                    value={getStageModel('translation')}
                    onChange={(e) => handleStageModelChange('translation', (e.target as HTMLSelectElement).value)}
                  >
                    <optgroup label={`⭐ ${t('settings.recommendedForTranslation')}`}>
                      {MODELS.filter((m) => ['gpt-5-mini', 'gpt-4.1-mini', 'o3-mini', 'o4-mini'].includes(m.value)).map((m) => (
                        <option key={m.value} value={m.value}>{m.label} — {t(`settings.modelDesc.${m.value}`)}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('settings.otherModels')}>
                      {MODELS.filter((m) => !['gpt-5-mini', 'gpt-4.1-mini', 'o3-mini', 'o4-mini'].includes(m.value)).map((m) => (
                        <option key={m.value} value={m.value}>{m.label} — {t(`settings.modelDesc.${m.value}`)}</option>
                      ))}
                    </optgroup>
                  </select>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '0.25rem' }}>
                    {t('settings.translationHint')}
                  </span>
                </div>
              )}
              
              {/* Editing Model - hidden in original reading mode */}
              {!isOriginalReadingMode && (
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
                    ✨ {t('settings.editingStage')}
                  </label>
                  <select
                    class="setting-select"
                    value={getStageModel('editing')}
                    onChange={(e) => handleStageModelChange('editing', (e.target as HTMLSelectElement).value)}
                  >
                    <optgroup label={`⭐ ${t('settings.recommendedForEditing')}`}>
                      {MODELS.filter((m) => ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1-nano', 'gpt-5-nano'].includes(m.value)).map((m) => (
                        <option key={m.value} value={m.value}>{m.label} — {t(`settings.modelDesc.${m.value}`)}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('settings.otherModels')}>
                      {MODELS.filter((m) => !['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1-nano', 'gpt-5-nano'].includes(m.value)).map((m) => (
                        <option key={m.value} value={m.value}>{m.label} — {t(`settings.modelDesc.${m.value}`)}</option>
                      ))}
                    </optgroup>
                  </select>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '0.25rem' }}>
                    {t('settings.editingHint')}
                  </span>
                </div>
              )}
            </div>
            {!isOriginalReadingMode && (
              <span class="setting-hint" style={{ marginTop: '0.5rem', display: 'block' }}>
                {t('settings.differentStagesHint')}
              </span>
            )}
          </div>
          <div class="setting-group">
            <label class="setting-label">🎨 {t('settings.creativity')}</label>
            <div class="slider-container">
              <input
                type="range"
                class="slider"
                min="0"
                max="100"
                value={Math.round(settings.temperature * 100)}
                onInput={(e) => {
                  const value = parseInt((e.target as HTMLInputElement).value, 10);
                  // Update display immediately
                  const display = e.currentTarget.parentElement?.querySelector('.slider-value');
                  if (display) display.textContent = (value / 100).toFixed(1);
                }}
                onChange={handleTemperatureChange}
              />
              <span class="slider-value">{settings.temperature.toFixed(1)}</span>
            </div>
            <span class="setting-hint">{t('settings.temperatureHint')}</span>
          </div>
        </div>

        {/* Stage models info - stages are chosen per request (Translation panel), not in settings */}
        {!isOriginalReadingMode && (
          <div class="stages-panel">
            <div class="stages-title">⚙️ {t('settings.stageModelsTitle', 'Модели по стадиям')}</div>
            <div class="stages-grid" style={{ pointerEvents: 'none', opacity: 0.9 }}>
              <div class="stage-toggle active">
                <span class="stage-icon">🔍</span>
                <span class="stage-name">{t('settings.stageAnalysis')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{getStageModel('analysis')}</span>
              </div>
              <span class="stage-arrow">→</span>
              <div class="stage-toggle active">
                <span class="stage-icon">🔮</span>
                <span class="stage-name">{t('settings.stageTranslation')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{getStageModel('translation')}</span>
              </div>
              <span class="stage-arrow">→</span>
              <div class="stage-toggle active">
                <span class="stage-icon">✨</span>
                <span class="stage-name">{t('settings.stageEditing')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{getStageModel('editing')}</span>
              </div>
            </div>
            <span class="setting-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              {t('settings.stageModelsHint', 'Стадии перевода выбираются при запуске (панель «Перевод» на главе).')}
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
