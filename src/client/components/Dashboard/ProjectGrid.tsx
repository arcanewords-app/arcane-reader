import { useMemo } from 'preact/hooks';
import type { ProjectListItem } from '../../types';
import { ProjectCard } from './ProjectCard';
import { LoadingSpinner } from '../ui';
import './ProjectGrid.css';

interface ProjectGridProps {
  projects: ProjectListItem[];
  loading?: boolean;
  onSelectProject: (id: string) => void;
  searchQuery?: string;
  filterType?: 'all' | 'book' | 'text';
}

export function ProjectGrid({ 
  projects, 
  loading, 
  onSelectProject,
  searchQuery = '',
  filterType = 'all',
}: ProjectGridProps) {
  // Filter and search projects
  const filteredProjects = useMemo(() => {
    let filtered = projects;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.type === filterType);
    }

    // Search by name
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.metadata?.title?.toLowerCase().includes(query) ||
        p.metadata?.authors?.some(a => a.toLowerCase().includes(query))
      );
    }

    // Sort by updated date (most recent first)
    return filtered.sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [projects, searchQuery, filterType]);

  if (loading) {
    return (
      <div class="project-grid-loading">
        <LoadingSpinner size="lg" text="Загрузка проектов..." />
      </div>
    );
  }

  if (filteredProjects.length === 0) {
    return (
      <div class="project-grid-empty">
        {searchQuery || filterType !== 'all' ? (
          <>
            <div class="project-grid-empty-icon">🔍</div>
            <div class="project-grid-empty-text">
              Проекты не найдены
            </div>
            <div class="project-grid-empty-hint">
              Попробуйте изменить параметры поиска
            </div>
          </>
        ) : (
          <>
            <div class="project-grid-empty-icon">📚</div>
            <div class="project-grid-empty-text">
              Нет проектов
            </div>
            <div class="project-grid-empty-hint">
              Создайте первый проект, чтобы начать работу
            </div>
          </>
        )}
      </div>
    );
  }

  // For large lists (>50 projects), consider virtualization
  // For now, we use simple grid with lazy loading images
  // Virtualization can be added later if needed using Intersection Observer or a library
  
  return (
    <div class="project-grid">
      {filteredProjects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onClick={onSelectProject}
        />
      ))}
    </div>
  );
}
