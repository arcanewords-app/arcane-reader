import { useState } from 'preact/hooks';
import type { Project, ProjectSettings } from '../types';
import { Card, Button, Modal } from './ui';
import { api } from '../api/client';

interface ProjectInfoProps {
  project: Project;
  onSettingsChange: (settings: ProjectSettings) => void;
  onDelete: () => void;
}

export function ProjectInfo({ project, onSettingsChange, onDelete }: ProjectInfoProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const stats = {
    chapters: project.chapters.length,
    translated: project.chapters.filter((c) => c.status === 'completed').length,
    glossary: project.glossary.length,
  };

  const settings = project.settings;

  const handleModelChange = async (e: Event) => {
    const model = (e.target as HTMLSelectElement).value;
    const updated = await api.updateSettings(project.id, { model });
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteProject(project.id);
      setShowDeleteModal(false);
      onDelete();
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{project.name}</h2>
            <span style={{ color: 'var(--text-dim)' }}>EN → RU</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteModal(true)}>
            🗑️ Удалить
          </Button>
        </div>

        <div class="stats">
          <div class="stat-item">
            <div class="stat-value">{stats.chapters}</div>
            <div class="stat-label">Глав</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{stats.translated}</div>
            <div class="stat-label">Переведено</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{stats.glossary}</div>
            <div class="stat-label">В глоссарии</div>
          </div>
        </div>

        {/* Settings Panel */}
        <div class="settings-panel">
          <div class="setting-group">
            <label class="setting-label">🤖 Модель</label>
            <select
              class="setting-select"
              value={settings.model}
              onChange={handleModelChange}
            >
              <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini (быстрая)</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo (экономная)</option>
            </select>
            <span class="setting-hint">Влияет на качество и стоимость</span>
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

        {/* Pipeline Stages */}
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
      </Card>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="🗑️ Удалить проект?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleDelete} loading={deleting}>
              Удалить
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          Вы уверены, что хотите удалить проект <strong>{project.name}</strong>?
          Это действие нельзя отменить.
        </p>
      </Modal>
    </>
  );
}

