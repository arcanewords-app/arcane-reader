import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import type { ProjectListItem } from '../../types';
import { projectsCache, loadProjects as loadProjectsStore } from '../../store/projects';
import { Button, Card, Modal, Input, Icon } from '../ui';
import { getProjectTypeColor } from '../../utils/project-type';
import './ProjectList.css';

interface ProjectListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProjectCreated?: () => void;
  refreshTrigger?: number; // Increment to trigger refresh
}

export function ProjectList({
  selectedId,
  onSelect,
  onProjectCreated,
  refreshTrigger,
}: ProjectListProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const getProjectTypeMaterialIcon = (projectType: string) => {
    if (projectType === 'epub') return 'menu_book';
    if (projectType === 'fb2') return 'auto_stories';
    if (projectType === 'csv') return 'table_chart';
    if (projectType === 'txt') return 'description';
    return 'article';
  };

  const loadProjects = async () => {
    try {
      await loadProjectsStore();
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
  const projects = projectsCache.value as ProjectListItem[];

  return (
    <>
      <Card title={t('project.projects')}>
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
              const typeIcon = getProjectTypeMaterialIcon(projectType);
              const typeColor = getProjectTypeColor(projectType);

              return (
                <div
                  key={project.id}
                  class={`project-item ${selectedId === project.id ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(project.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(project.id);
                    }
                  }}
                  style={{
                    borderLeftColor: selectedId === project.id ? typeColor : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Icon name={typeIcon} size="sm" />
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
          <Icon name="add" size="sm" /> {t('project.newProject')}
        </Button>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={t('project.newProjectTitle')}
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
        />
      </Modal>
    </>
  );
}
