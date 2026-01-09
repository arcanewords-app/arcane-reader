import { useState, useEffect } from 'preact/hooks';
import { api } from '../../api/client';
import type { ProjectListItem } from '../../types';
import { Button, Card, Modal, Input } from '../ui';

interface ProjectListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProjectCreated?: () => void;
  refreshTrigger?: number; // Increment to trigger refresh
}

export function ProjectList({ selectedId, onSelect, onProjectCreated, refreshTrigger }: ProjectListProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [refreshTrigger]);

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    
    setCreating(true);
    try {
      const project = await api.createProject(newProjectName.trim());
      setShowModal(false);
      setNewProjectName('');
      await loadProjects();
      onSelect(project.id);
      onProjectCreated?.();
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    }
  };

  // Helper for declension
  const declension = (n: number, forms: [string, string, string]) => {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  };

  return (
    <>
      <Card title="📁 Проекты">
        <div class="project-list">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <span class="spinner" />
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-dim)' }}>
              Нет проектов
            </div>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                class={`project-item ${selectedId === project.id ? 'active' : ''}`}
                onClick={() => onSelect(project.id)}
              >
                <div class="project-name">{project.name}</div>
                <div class="project-meta">
                  {project.translatedCount}/{project.chapterCount}{' '}
                  {declension(project.chapterCount, ['глава', 'главы', 'глав'])}
                </div>
              </div>
            ))
          )}
        </div>
        <Button
          variant="primary"
          size="full"
          style={{ marginTop: '1rem' }}
          onClick={() => setShowModal(true)}
        >
          ＋ Новый проект
        </Button>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="📁 Новый проект"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreate} loading={creating}>
              Создать
            </Button>
          </>
        }
      >
        <Input
          label="Название проекта"
          placeholder="Например: Властелин колец"
          value={newProjectName}
          onInput={(e) => setNewProjectName((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </Modal>
    </>
  );
}

