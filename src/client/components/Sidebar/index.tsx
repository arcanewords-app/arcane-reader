import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { ChapterList } from './ChapterList';
import { Button } from '../ui';
import { route } from 'preact-router';
import type { Project, ProjectSettings } from '../../types';
import { SettingsModal } from './SettingsModal';
import './Sidebar.css';

interface SidebarProps {
  project: Project | null;
  selectedChapterId: string | null;
  onSelectChapter: (id: string) => void;
  onDeleteChapter?: (id: string) => void;
  onUploadChapter: (file: File, title: string) => Promise<void>;
  onOpenGlossary: () => void;
  onChaptersUpdate?: () => void | Promise<void>;
  onProjectUpdate?: (project: Project) => void;
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

  return (
    <>
      <aside class={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        {/* Quick link to projects dashboard */}
        <Button 
          variant="secondary" 
          onClick={() => {
            // Close sidebar on mobile
            if (isMobileOpen) {
              (window as any).__arcaneSidebarOpen = false;
              window.dispatchEvent(new CustomEvent('arcane:sidebar-close'));
            }
            route('/');
          }}
          className="sidebar-dashboard-link"
        >
          ← {t('sidebar.allProjects')}
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
              (window as any).__arcaneSidebarOpen = false;
              window.dispatchEvent(new CustomEvent('arcane:sidebar-close'));
            }
            route(`/projects/${project.id}`);
          }}
          className="sidebar-settings-link"
          style={{ marginBottom: '0.75rem' }}
        >
          📄 {t('sidebar.aboutProject')}
        </Button>

        {/* Settings Button */}
        <Button 
          variant="secondary" 
          onClick={() => setShowSettings(true)}
          className="sidebar-settings-link"
          style={{ marginBottom: '1rem' }}
        >
          ⚙️ {t('sidebar.projectSettings')}
        </Button>

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
          📝 {t('sidebar.glossary')}{' '}
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

