import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { ProjectGrid } from './ProjectGrid';
import { Button, Input, Modal, Icon } from '../ui';
import { ProjectLanguagePairFields } from '../Project/ProjectLanguagePairFields';
import {
  PROJECT_DEFAULT_SOURCE_LANGUAGE,
  PROJECT_DEFAULT_TARGET_LANGUAGE,
  type ProjectSourceLanguage,
  type ProjectTargetLanguage,
} from '../../constants/translationLanguages';
import { projectsCache, projectsLoading, loadProjects } from '../../store/projects';
import { api } from '../../api/client';
import './Dashboard.css';

export function Dashboard() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'book' | 'text'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSourceLanguage, setNewProjectSourceLanguage] = useState<ProjectSourceLanguage>(
    PROJECT_DEFAULT_SOURCE_LANGUAGE
  );
  const [newProjectTargetLanguage, setNewProjectTargetLanguage] = useState<ProjectTargetLanguage>(
    PROJECT_DEFAULT_TARGET_LANGUAGE
  );
  const [creating, setCreating] = useState(false);

  // Load projects on mount and when returning to dashboard
  useEffect(() => {
    // Always refresh projects list when returning to dashboard
    // This ensures we see latest updates (new chapters, etc.)
    loadProjects();
  }, []);

  // Handle project creation
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const project = await api.createProject(newProjectName.trim(), {
        sourceLanguage: newProjectSourceLanguage,
        targetLanguage: newProjectTargetLanguage,
      });
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectSourceLanguage(PROJECT_DEFAULT_SOURCE_LANGUAGE);
      setNewProjectTargetLanguage(PROJECT_DEFAULT_TARGET_LANGUAGE);

      // Reload projects
      await loadProjects();

      // Navigate to project (will be handled by router)
      route(`/projects/${project.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setCreating(false);
    }
  };

  // Handle project selection
  const handleSelectProject = (id: string) => {
    route(`/projects/${id}`);
  };

  const projects = projectsCache.value;

  return (
    <div class="dashboard">
      {/* Header Section */}
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
          <Icon name="add" size="sm" /> {t('dashboard.newProjectButton')}
        </Button>
      </div>

      {/* Filters and Search */}
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
              <Icon name="grid_view" size="sm" /> {t('dashboard.filterAll')} ({projects.length})
            </button>
            <button
              class={`dashboard-filter-btn ${filterType === 'book' ? 'active' : ''}`}
              onClick={() => setFilterType('book')}
            >
              <Icon name="menu_book" size="sm" /> {t('dashboard.filterBooks')} (
              {projects.filter((p) => p.type === 'book').length})
            </button>
            <button
              class={`dashboard-filter-btn ${filterType === 'text' ? 'active' : ''}`}
              onClick={() => setFilterType('text')}
            >
              <Icon name="description" size="sm" /> {t('dashboard.filterText')} (
              {projects.filter((p) => p.type === 'text' || !p.type).length})
            </button>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      <ProjectGrid
        projects={projects}
        loading={projectsLoading.value}
        onSelectProject={handleSelectProject}
        searchQuery={searchQuery}
        filterType={filterType}
      />

      {/* Create Project Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('dashboard.newProjectModalTitle')}
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
        <ProjectLanguagePairFields
          idPrefix="create-project"
          sourceLanguage={newProjectSourceLanguage}
          targetLanguage={newProjectTargetLanguage}
          onSourceLanguageChange={setNewProjectSourceLanguage}
          onTargetLanguageChange={setNewProjectTargetLanguage}
        />
        <p class="project-language-pair-create-hint">{t('project.languagePairCreateHint')}</p>
      </Modal>
    </div>
  );
}
