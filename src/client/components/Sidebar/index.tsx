import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { ChapterList } from './ChapterList';
import { ProcessChapters } from './ProcessChapters';
import { Button, Icon } from '../ui';
import { route } from 'preact-router';
import type { Chapter, Project, ProjectWithChapterList, ProjectSettings } from '../../types';
import { SettingsModal } from './SettingsModal';
import './Sidebar.css';

interface SidebarProps {
  project: Project | ProjectWithChapterList | null;
  selectedChapterId: string | null;
  onSelectChapter: (id: string) => void;
  onDeleteChapter?: (id: string) => void;
  onUploadChapter: (params: {
    file: File;
    title: string;
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
  }) => Promise<Chapter | { chapters: Chapter[]; count: number; warnings?: string[] }>;
  onOpenGlossary: () => void;
  onChaptersUpdate?: () => void | Promise<void>;
  onProjectUpdate?: (project: Project | ProjectWithChapterList) => void;
  onSettingsChange?: (settings: ProjectSettings) => void;
  onRefreshProject?: () => Promise<void>;
  isMobileOpen?: boolean;
}

export function Sidebar({
  project,
  selectedChapterId,
  onSelectChapter,
  onDeleteChapter,
  onUploadChapter,
  onOpenGlossary,
  onChaptersUpdate,
  onSettingsChange,
  onRefreshProject,
  onProjectUpdate,
  isMobileOpen = false,
}: SidebarProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);

  if (!project) {
    return null;
  }

  const handleSettingsChange = (settings: ProjectSettings) => {
    if (onSettingsChange) {
      onSettingsChange(settings);
    }
    // Also update project state if onChaptersUpdate is available (refresh)
    if (onChaptersUpdate) {
      onChaptersUpdate();
    }
  };

  const handleCloseSidebar = () => {
    (window as Window & { __arcaneSidebarOpen?: boolean }).__arcaneSidebarOpen = false;
    window.dispatchEvent(new CustomEvent('arcane:sidebar-close'));
  };

  return (
    <>
      <aside class={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        {/* Mobile header with close button (only on mobile when open) */}
        {isMobileOpen && (
          <div class="sidebar-mobile-header">
            <div class="sidebar-mobile-title">
              <img src="/arcane_icon.png" alt="Arcane" class="sidebar-mobile-logo" />
              <span>ARCANE</span>
            </div>
            <button
              class="sidebar-mobile-close"
              onClick={handleCloseSidebar}
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>
        )}

        {/* Quick link to projects dashboard */}
        <Button
          variant="secondary"
          onClick={() => {
            // Close sidebar on mobile
            if (isMobileOpen) {
              (window as Window & { __arcaneSidebarOpen?: boolean }).__arcaneSidebarOpen = false;
              window.dispatchEvent(new CustomEvent('arcane:sidebar-close'));
            }
            route('/projects');
          }}
          className="sidebar-dashboard-link"
        >
          <Icon name="arrow_back" size="sm" /> {t('sidebar.allProjects')}
        </Button>

        {/* Project name/header */}
        <div class="sidebar-project-header">
          <h3 class="sidebar-project-name" title={project.name}>
            {project.name}
          </h3>
        </div>

        {/* Project Settings Button */}
        <Button
          variant="secondary"
          onClick={() => {
            // Close sidebar on mobile
            if (isMobileOpen) {
              (window as Window & { __arcaneSidebarOpen?: boolean }).__arcaneSidebarOpen = false;
              window.dispatchEvent(new CustomEvent('arcane:sidebar-close'));
            }
            route(`/projects/${project.id}`);
          }}
          className="sidebar-settings-link"
          style={{ marginBottom: '0.75rem' }}
        >
          <Icon name="description" size="sm" /> {t('sidebar.aboutProject')}
        </Button>

        {/* Settings Button */}
        <Button
          variant="secondary"
          onClick={() => setShowSettings(true)}
          className="sidebar-settings-link"
          style={{ marginBottom: '1rem' }}
        >
          <Icon name="settings" size="sm" /> {t('sidebar.projectSettings')}
        </Button>

        {onRefreshProject && (
          <ProcessChapters
            project={project}
            onRefreshProject={onRefreshProject}
            onSettingsChange={onSettingsChange}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        <ChapterList
          chapters={project.chapters}
          selectedId={selectedChapterId}
          projectId={project.id}
          originalReadingMode={project.settings?.originalReadingMode ?? false}
          onSelect={onSelectChapter}
          onDelete={onDeleteChapter}
          onUpload={onUploadChapter}
          onChaptersUpdate={onChaptersUpdate}
          onProjectUpdate={onProjectUpdate}
        />

        <Button variant="glossary" onClick={onOpenGlossary}>
          <Icon name="menu_book" size="sm" /> {t('sidebar.glossary')}{' '}
          <span class="glossary-count">{project.glossary.length}</span>
        </Button>
      </aside>

      {showSettings && (
        <SettingsModal
          project={project}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onSettingsChange={handleSettingsChange}
          onRefreshProject={onRefreshProject}
        />
      )}
    </>
  );
}

export { ChapterList } from './ChapterList';
