import { useState } from 'preact/hooks';
import type { Project, ProjectSettings } from '../../types';
import { Modal, Button } from '../ui';
import { api } from '../../api/client';
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
  const settings = project.settings || {};
  const isOriginalReadingMode = settings.originalReadingMode ?? false;

  // Get current model for a stage (with fallbacks)
  const getStageModel = (stage: 'analysis' | 'translation' | 'editing'): string => {
    if (settings.stageModels) {
      return settings.stageModels[stage];
    }
    return settings.model || 'gpt-4-turbo-preview';
  };

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

  const handleTemperatureChange = async (e: Event) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    const temperature = value / 100;
    const updated = await api.updateSettings(project.id, { temperature });
    onSettingsChange(updated);
  };

  const toggleStage = async (stage: 'analysis' | 'editing') => {
    const key = stage === 'analysis' ? 'enableAnalysis' : 'enableEditing';
    const current = settings[key] ?? true;
    const updated = await api.updateSettings(project.id, { [key]: !current });
    onSettingsChange(updated);
  };

  const toggleOriginalReadingMode = async () => {
    const current = settings.originalReadingMode ?? false;
    const updated = await api.updateSettings(project.id, { 
      originalReadingMode: !current,
      // When switching to original reading mode, disable translation and editing stages
      enableTranslation: current, // If turning OFF original mode, enable translation
      enableEditing: current,     // If turning OFF original mode, enable editing
    });
    onSettingsChange(updated);
    // Refresh project to get updated state
    if (onRefreshProject) {
      await onRefreshProject();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="⚙️ Настройки проекта" size="large">
      <div class="settings-modal">
        {/* Original Reading Mode Toggle */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>📖 Режим оригинального чтения</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                {isOriginalReadingMode 
                  ? 'Только анализ и чтение оригинала. Перевод отключен.'
                  : 'Включите для чтения оригинала без перевода'}
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
            <label class="setting-label">🤖 Модели по стадиям</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Analysis Model - always visible */}
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
                  🔍 Анализ (точность структурированного вывода)
                </label>
                <select
                  class="setting-select"
                  value={getStageModel('analysis')}
                  onChange={(e) => handleStageModelChange('analysis', (e.target as HTMLSelectElement).value)}
                >
                  <optgroup label="⭐ Рекомендуется (из акции)">
                    <option value="gpt-4.1-mini">GPT-4.1 Mini (лучшая цена/качество)</option>
                    <option value="o3-mini">O3 Mini (reasoning, максимальная точность)</option>
                    <option value="gpt-4o-mini">GPT-4o Mini (быстрая и дешевая)</option>
                  </optgroup>
                  <optgroup label="Альтернативы">
                    <option value="o4-mini">O4 Mini (reasoning, медленнее)</option>
                    <option value="gpt-5-mini">GPT-5 Mini (новая модель)</option>
                    <option value="gpt-4.1-nano">GPT-4.1 Nano (самая дешевая)</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                  </optgroup>
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '0.25rem' }}>
                  Нужна точность для структурированного JSON
                </span>
              </div>
              
              {/* Translation Model - hidden in original reading mode */}
              {!isOriginalReadingMode && (
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
                    🔮 Перевод (максимальное качество)
                  </label>
                  <select
                    class="setting-select"
                    value={getStageModel('translation')}
                    onChange={(e) => handleStageModelChange('translation', (e.target as HTMLSelectElement).value)}
                  >
                    <optgroup label="⭐ Рекомендуется (из акции)">
                      <option value="gpt-5-mini">GPT-5 Mini (лучшее качество)</option>
                      <option value="gpt-4.1-mini">GPT-4.1 Mini (отличный баланс)</option>
                      <option value="o3-mini">O3 Mini (reasoning, точный перевод)</option>
                    </optgroup>
                    <optgroup label="Альтернативы">
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="o4-mini">O4 Mini (reasoning)</option>
                      <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (экономия)</option>
                      <option value="gpt-4.1-nano">GPT-4.1 Nano</option>
                    </optgroup>
                  </select>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '0.25rem' }}>
                    Основная стадия - инвестируем в качество
                  </span>
                </div>
              )}
              
              {/* Editing Model - hidden in original reading mode */}
              {!isOriginalReadingMode && (
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
                    ✨ Редактура (полировка уже готового)
                  </label>
                  <select
                    class="setting-select"
                    value={getStageModel('editing')}
                    onChange={(e) => handleStageModelChange('editing', (e.target as HTMLSelectElement).value)}
                  >
                    <optgroup label="⭐ Рекомендуется (из акции)">
                      <option value="gpt-4.1-mini">GPT-4.1 Mini (лучший баланс)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (экономия, достаточно)</option>
                      <option value="gpt-4.1-nano">GPT-4.1 Nano (максимальная экономия)</option>
                    </optgroup>
                    <optgroup label="Для лучшего качества">
                      <option value="gpt-5-mini">GPT-5 Mini</option>
                      <option value="o3-mini">O3 Mini (reasoning)</option>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                    </optgroup>
                  </select>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '0.25rem' }}>
                    Улучшение уже переведенного текста
                  </span>
                </div>
              )}
            </div>
            {!isOriginalReadingMode && (
              <span class="setting-hint" style={{ marginTop: '0.5rem', display: 'block' }}>
                Разные модели для разных стадий снижают стоимость при сохранении качества
              </span>
            )}
          </div>
          <div class="setting-group">
            <label class="setting-label">🎨 Креативность</label>
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
            <span class="setting-hint">0 = точный, 1 = творческий</span>
          </div>
        </div>

        {/* Pipeline Stages - hidden in original reading mode */}
        {!isOriginalReadingMode && (
          <div class="stages-panel">
            <div class="stages-title">⚙️ Этапы перевода</div>
            <div class="stages-grid">
              <div
                class={`stage-toggle ${settings.enableAnalysis !== false ? 'active' : ''}`}
                onClick={() => toggleStage('analysis')}
              >
                <span class="stage-checkbox">✓</span>
                <span class="stage-icon">🔍</span>
                <span class="stage-name">Анализ</span>
              </div>
              <span class="stage-arrow">→</span>
              <div class="stage-toggle active disabled">
                <span class="stage-checkbox">✓</span>
                <span class="stage-icon">🔮</span>
                <span class="stage-name">Перевод</span>
              </div>
              <span class="stage-arrow">→</span>
              <div
                class={`stage-toggle ${settings.enableEditing !== false ? 'active' : ''}`}
                onClick={() => toggleStage('editing')}
              >
                <span class="stage-checkbox">✓</span>
                <span class="stage-icon">✨</span>
                <span class="stage-name">Редактура</span>
              </div>
            </div>
            <span class="setting-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              Нажмите, чтобы включить/выключить этапы. Перевод всегда обязателен.
            </span>
          </div>
        )}
        
        {/* Analysis Only Panel - shown in original reading mode */}
        {isOriginalReadingMode && (
          <div class="stages-panel">
            <div class="stages-title">⚙️ Этапы</div>
            <div class="stages-grid">
              <div class="stage-toggle active disabled">
                <span class="stage-checkbox">✓</span>
                <span class="stage-icon">🔍</span>
                <span class="stage-name">Анализ</span>
              </div>
            </div>
            <span class="setting-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              В режиме оригинального чтения доступен только анализ текста
            </span>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </Modal>
  );
}
