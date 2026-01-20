import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { ProjectGrid } from './ProjectGrid';
import { Button, Input, Modal, Card } from '../ui';
import { projectsCache, projectsLoading, loadProjects } from '../../store/projects';
import { api } from '../../api/client';
import type { ProjectListItem } from '../../types';
import './Dashboard.css';

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'book' | 'text'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  // Load projects on mount
  useEffect(() => {
    if (projectsCache.value.length === 0 && !projectsLoading.value) {
      loadProjects();
    }
  }, []);

  // Handle project creation
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const project = await api.createProject(newProjectName.trim());
      setShowCreateModal(false);
      setNewProjectName('');
      
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
          <h1>Мои проекты</h1>
          <p class="dashboard-subtitle">
            {projects.length > 0 
              ? `${projects.length} ${projects.length === 1 ? 'проект' : projects.length < 5 ? 'проекта' : 'проектов'}`
              : 'Начните создавать проекты для перевода'
            }
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowCreateModal(true)}
          className="dashboard-create-btn"
        >
          + Новый проект
        </Button>
      </div>

      {/* Filters and Search */}
      {projects.length > 0 && (
        <div class="dashboard-filters">
          <div class="dashboard-search">
            <Input
              placeholder="Поиск проектов..."
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
              Все ({projects.length})
            </button>
            <button
              class={`dashboard-filter-btn ${filterType === 'book' ? 'active' : ''}`}
              onClick={() => setFilterType('book')}
            >
              📚 Книги ({projects.filter(p => p.type === 'book').length})
            </button>
            <button
              class={`dashboard-filter-btn ${filterType === 'text' ? 'active' : ''}`}
              onClick={() => setFilterType('text')}
            >
              📝 Текст ({projects.filter(p => p.type === 'text' || !p.type).length})
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
        title="📁 Новый проект"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreateProject} loading={creating}>
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCreateProject();
            }
          }}
          autoFocus
        />
      </Modal>
    </div>
  );
}
