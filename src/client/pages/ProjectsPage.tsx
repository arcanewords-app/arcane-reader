import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { ProjectGrid } from '../components/Dashboard/ProjectGrid';
import { Button, Input, Modal } from '../components/ui';
import { projectsCache, projectsLoading, loadProjects } from '../store/projects';
import { api } from '../api/client';
import '../components/Dashboard/Dashboard.css';
import './ProjectsPage.css';

export function ProjectsPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'book' | 'text'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const project = await api.createProject(newProjectName.trim());
      setShowCreateModal(false);
      setNewProjectName('');
      await loadProjects();
      route(`/projects/${project.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleSelectProject = (id: string) => {
    route(`/projects/${id}`);
  };

  const projects = projectsCache.value;

  return (
    <div class="projects-page">
      <div class="dashboard-header">
        <div class="dashboard-title">
          <h1>{t('dashboard.myProjects')}</h1>
          <p class="dashboard-subtitle">
            {projects.length > 0
              ? `${projects.length} ${projects.length === 1 ? t('projectCount.one') : projects.length < 5 ? t('projectCount.few') : t('projectCount.many')}`
              : t('dashboard.subtitleEmpty')}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowCreateModal(true)}
          className="dashboard-create-btn"
        >
          + {t('dashboard.newProjectButton')}
        </Button>
      </div>

      {projects.length > 0 && (
        <div class="dashboard-filters">
          <div class="dashboard-search">
            <Input
              placeholder={t('dashboard.searchPlaceholder')}
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              className="dashboard-search-input"
            />
          </div>
          <div class="dashboard-type-filters">
            <button
              class={`dashboard-filter-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              {t('dashboard.filterAll')} ({projects.length})
            </button>
            <button
              class={`dashboard-filter-btn ${filterType === 'book' ? 'active' : ''}`}
              onClick={() => setFilterType('book')}
            >
              📚 {t('dashboard.filterBooks')} ({projects.filter((p) => p.type === 'book').length})
            </button>
            <button
              class={`dashboard-filter-btn ${filterType === 'text' ? 'active' : ''}`}
              onClick={() => setFilterType('text')}
            >
              📝 {t('dashboard.filterText')} (
              {projects.filter((p) => p.type === 'text' || !p.type).length})
            </button>
          </div>
        </div>
      )}

      <ProjectGrid
        projects={projects}
        loading={projectsLoading.value}
        onSelectProject={handleSelectProject}
        searchQuery={searchQuery}
        filterType={filterType}
      />

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={`📁 ${t('dashboard.newProjectModalTitle')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateProject} loading={creating}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <Input
          label={t('dashboard.projectNameLabel')}
          placeholder={t('dashboard.projectNamePlaceholder')}
          value={newProjectName}
          onInput={(e) => setNewProjectName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCreateProject();
            }
          }}
        />
      </Modal>
    </div>
  );
}
