import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { useUserRole } from '../hooks/useUserRole';
import { ProjectGrid } from '../components/Dashboard/ProjectGrid';
import { ReadingHistorySection } from '../components/Cabinet/ReadingHistorySection';
import { ReaderSettingsPanel } from '../components/ChapterView/ReaderSettings';
import { Button, Input, Modal, LoadingSpinner, Icon } from '../components/ui';
import { projectsCache, projectsLoading, loadProjects } from '../store/projects';
import { api } from '../api/client';
import type { ReaderSettings } from '../types';
import { DEFAULT_READER_SETTINGS, LEGACY_FONT_MAP } from '../types';
import '../components/Dashboard/Dashboard.css';
import './CabinetPage.css';

type CabinetTab = 'reading' | 'projects' | 'settings';

export function CabinetPage() {
  const { t } = useTranslation();
  const { isAtLeast } = useUserRole();
  const isAuthor = isAtLeast('author');

  const [activeTab, setActiveTab] = useState<CabinetTab>('reading');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'book' | 'text'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => ({
    ...DEFAULT_READER_SETTINGS,
  }));
  const [readerSettingsLoaded, setReaderSettingsLoaded] = useState(false);

  useEffect(() => {
    if (isAuthor) {
      loadProjects();
    }
  }, [isAuthor]);

  useEffect(() => {
    let cancelled = false;
    api
      .getUserReaderSettings()
      .then((userSettings) => {
        if (!cancelled && userSettings) {
          let fontFamily = userSettings.fontFamily ?? DEFAULT_READER_SETTINGS.fontFamily;
          const legacy = LEGACY_FONT_MAP[fontFamily as keyof typeof LEGACY_FONT_MAP];
          if (legacy) fontFamily = legacy;
          setReaderSettings({ ...DEFAULT_READER_SETTINGS, ...userSettings, fontFamily });
        }
        if (!cancelled) setReaderSettingsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setReaderSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
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

  const handleReaderSettingsChange = async (updates: Partial<ReaderSettings>) => {
    const newSettings = { ...readerSettings, ...updates };
    setReaderSettings(newSettings);
    await api.updateUserReaderSettings(newSettings).catch(() => {});
  };

  const projects = projectsCache.value;

  const tabs: { id: CabinetTab; labelKey: string; show: boolean }[] = [
    { id: 'reading', labelKey: 'cabinet.reading', show: true },
    { id: 'projects', labelKey: 'cabinet.projects', show: isAuthor },
    { id: 'settings', labelKey: 'cabinet.settings', show: true },
  ].filter((tab) => tab.show);

  return (
    <div class="cabinet-page">
      <div class="cabinet-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            class={`cabinet-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div class="cabinet-content">
        {activeTab === 'reading' && (
          <div class="cabinet-section">
            <h2 class="cabinet-section-title">{t('cabinet.readingTitle')}</h2>
            <ReadingHistorySection />
          </div>
        )}

        {activeTab === 'projects' && isAuthor && (
          <div class="cabinet-section cabinet-section-projects">
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
                    <Icon name="grid_view" size="sm" /> {t('dashboard.filterAll')} (
                    {projects.length})
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

            <ProjectGrid
              projects={projects}
              loading={projectsLoading.value}
              onSelectProject={handleSelectProject}
              searchQuery={searchQuery}
              filterType={filterType}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div class="cabinet-section cabinet-section-settings">
            <h2 class="cabinet-section-title">{t('cabinet.settingsTitle')}</h2>
            {readerSettingsLoaded ? (
              <div class="cabinet-settings-panel">
                <ReaderSettingsPanel
                  settings={readerSettings}
                  onChange={handleReaderSettingsChange}
                />
              </div>
            ) : (
              <div class="cabinet-settings-loading">
                <LoadingSpinner size="sm" text={t('common.loading')} />
              </div>
            )}
          </div>
        )}
      </div>

      {isAuthor && (
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
        </Modal>
      )}
    </div>
  );
}
