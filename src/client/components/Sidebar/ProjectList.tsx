import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import type { ProjectListItem } from '../../types';
import { Button, Card, Modal, Input } from '../ui';
import { getProjectTypeIcon, getProjectTypeColor } from '../../utils/project-type';
import './ProjectList.css';

interface ProjectListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProjectCreated?: () => void;
  refreshTrigger?: number; // Increment to trigger refresh
}

export function ProjectList({ selectedId, onSelect, onProjectCreated, refreshTrigger }: ProjectListProps) {
  const { t } = useTranslation();
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
      // Ignore 401 errors - they are handled globally and will show login page
      if (error instanceof ApiError && error.status === 401) {
        // Auth error - handled globally, just stop loading
        return;
      }
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
      // Ignore 401 errors - they are handled globally and will show login page
      if (error instanceof ApiError && error.status === 401) {
        // Auth error - handled globally
        return;
      }
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

  // Helper for declension (Russian: 1 глава, 2 главы, 5 глав; EN/PL use same form or count)
  const declension = (n: number, forms: [string, string, string]) => {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  };

  const chapterForms: [string, string, string] = [
    t('project.chapterOne'),
    t('project.chapterFew'),
    t('project.chapterMany'),
  ];

  return (
    <>
      <Card title={`📁 ${t('project.projects')}`}>
        <div class="project-list">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <span class="spinner" />
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-dim)' }}>
              {t('project.noProjects')}
            </div>
          ) : (
            projects.map((project) => {
              const projectType = project.type || 'text';
              const typeIcon = getProjectTypeIcon(projectType);
              const typeColor = getProjectTypeColor(projectType);
              
              return (
                <div
                  key={project.id}
                  class={`project-item ${selectedId === project.id ? 'active' : ''}`}
                  onClick={() => onSelect(project.id)}
                  style={{
                    borderLeftColor: selectedId === project.id ? typeColor : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>{typeIcon}</span>
                    <div class="project-name">{project.name}</div>
                  </div>
                  <div class="project-meta">
                    {project.translatedCount}/{project.chapterCount}{' '}
                    {declension(project.chapterCount, chapterForms)}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <Button
          variant="primary"
          size="full"
          style={{ marginTop: '1rem' }}
          onClick={() => setShowModal(true)}
        >
          ＋ {t('project.newProject')}
        </Button>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={`📁 ${t('project.newProjectTitle')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} loading={creating}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <Input
          label={t('project.projectName')}
          placeholder={t('project.projectNamePlaceholder')}
          value={newProjectName}
          onInput={(e) => setNewProjectName((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </Modal>
    </>
  );
}

