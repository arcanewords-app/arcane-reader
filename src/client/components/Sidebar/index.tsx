import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { ChapterList } from './ChapterList';
import { ProcessChapters } from './ProcessChapters';
import { JobsPanel } from './JobsPanel';
import { ProjectSearchModal } from '../SearchReplace';
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
  /** Pending reports count (shown as badge when > 0). Callback to open reports modal. */
  reportsCount?: number;
  /** When provided, Reports button is shown (allows returning to view resolved reports). */
  onOpenReports?: () => void;
  onChaptersUpdate?: () => void | Promise<void>;
  onProjectUpdate?: (project: Project | ProjectWithChapterList) => void;
  onSettingsChange?: (settings: ProjectSettings) => void;
  onRefreshProject?: () => Promise<void>;
  isMobileOpen?: boolean;
  /** Controlled settings modal (optional). */
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
}

export function Sidebar({
  project,
  selectedChapterId,
  onSelectChapter,
  onDeleteChapter,
  onUploadChapter,
  onOpenGlossary,
  reportsCount = 0,
  onOpenReports,
  onChaptersUpdate,
  onSettingsChange,
  onRefreshProject,
  onProjectUpdate,
  isMobileOpen = false,
  settingsOpen: controlledSettingsOpen,
  onSettingsOpenChange,
}: SidebarProps) {
  const { t } = useTranslation();
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false);
  const showSettings = controlledSettingsOpen ?? internalSettingsOpen;
  const setShowSettings = (open: boolean) => {
    if (onSettingsOpenChange) {
      onSettingsOpenChange(open);
    } else {
      setInternalSettingsOpen(open);
    }
  };
  const [showProjectSearch, setShowProjectSearch] = useState(false);
  const [triggerJobsFetch, setTriggerJobsFetch] = useState(0);

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
          className="sidebar-action sidebar-dashboard-link"
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
          className="sidebar-action"
        >
          <Icon name="description" size="sm" /> {t('sidebar.aboutProject')}
        </Button>

        {/* Settings Button */}
        <Button
          variant="secondary"
          onClick={() => setShowSettings(true)}
          className="sidebar-action"
        >
          <Icon name="settings" size="sm" /> {t('sidebar.projectSettings')}
        </Button>

        {/* Find in project */}
        <Button
          variant="secondary"
          onClick={() => setShowProjectSearch(true)}
          className="sidebar-action"
        >
          <Icon name="search" size="sm" /> {t('searchReplace.findInProject', 'Find in project')}
        </Button>

        {/* Glossary - near top for quick access without scrolling */}
        <Button variant="secondary" onClick={onOpenGlossary} className="sidebar-action">
          <Icon name="menu_book" size="sm" /> {t('sidebar.glossary')}{' '}
          <span class="glossary-count">{project.glossary.length}</span>
        </Button>

        {onOpenReports && (
          <Button variant="secondary" onClick={onOpenReports} className="sidebar-action">
            <Icon name="flag" size="sm" /> {t('sidebar.reports')}{' '}
            {reportsCount > 0 && <span class="sidebar-reports-badge">{reportsCount}</span>}
          </Button>
        )}

        {onRefreshProject && (
          <>
            <JobsPanel
              project={project}
              onRefreshProject={onRefreshProject}
              triggerFetch={triggerJobsFetch}
            />
            <ProcessChapters
              project={project}
              onRefreshProject={onRefreshProject}
              onSettingsChange={onSettingsChange}
              onOpenSettings={() => setShowSettings(true)}
              onBatchStarted={() => setTriggerJobsFetch((c) => c + 1)}
              onBatchJobCreated={() => setTriggerJobsFetch((c) => c + 1)}
            />
          </>
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

      <ProjectSearchModal
        isOpen={showProjectSearch}
        onClose={() => setShowProjectSearch(false)}
        projectId={project.id}
        isOriginalReadingMode={project.settings?.originalReadingMode ?? false}
        chapters={project.chapters}
        textBlockTypes={project.settings?.textBlockTypes ?? []}
        onRefresh={onRefreshProject}
      />
    </>
  );
}

export { ChapterList } from './ChapterList';
