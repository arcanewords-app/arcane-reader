import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { AdminProjectListItem, AdminProjectPublicationFilter } from '../types';
import { Button, Input, Select, ConfirmModal } from '../components/ui';
import { AdminLayout, AdminSection, AdminFlash } from '../components/Admin';
import '../components/Admin/admin-shared.css';
import './AdminPublicationsPage.css';
import './AdminProjectsPage.css';

const PUBLICATION_STATUS_OPTIONS: Array<AdminProjectPublicationFilter | ''> = [
  '',
  'published',
  'draft',
  'unpublished',
  'none',
];

export function AdminProjectsPage() {
  const { t } = useTranslation();

  const [projects, setProjects] = useState<AdminProjectListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<AdminProjectPublicationFilter | ''>('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const [unpublishing, setUnpublishing] = useState<AdminProjectListItem | null>(null);
  const [unpublishLoading, setUnpublishLoading] = useState(false);
  const [deleting, setDeleting] = useState<AdminProjectListItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const statusSelectOptions = useMemo(
    () =>
      PUBLICATION_STATUS_OPTIONS.map((s) => ({
        value: s,
        label: s ? t(`admin.projects.publicationStatus.${s}`) : t('admin.filter.all'),
      })),
    [t]
  );

  const reload = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await api.getAdminProjects({
        publicationStatus: statusFilter || undefined,
        search: searchDebounced || undefined,
        limit: 100,
      });
      setProjects(list);
    } catch {
      setProjects([]);
      setError(t('admin.projects.loadFailed'));
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, searchDebounced, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleUnpublish = async (): Promise<boolean> => {
    if (!unpublishing) return true;
    setUnpublishLoading(true);
    setError(null);
    try {
      await api.adminUnpublishProject(unpublishing.id);
      setUnpublishing(null);
      setSuccess(t('admin.projects.unpublished'));
      await reload();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(t('admin.projects.notFound'));
      } else {
        setError(t('admin.projects.unpublishFailed'));
      }
      return false;
    } finally {
      setUnpublishLoading(false);
    }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!deleting) return true;
    setDeleteLoading(true);
    setError(null);
    try {
      await api.adminDeleteProject(deleting.id);
      setDeleting(null);
      setSuccess(t('admin.projects.deleted'));
      await reload();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(t('admin.projects.notFound'));
      } else {
        setError(t('admin.projects.deleteFailed'));
      }
      return false;
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCopyId = async (projectId: string) => {
    try {
      await navigator.clipboard.writeText(projectId);
      setSuccess(t('admin.projects.idCopied'));
    } catch {
      setError(t('admin.projects.copyIdFailed'));
    }
  };

  const publicUrl = (project: AdminProjectListItem) =>
    `/p/${project.publicationSlug || project.publicationId || project.id}`;

  const publicationBadgeClass = (project: AdminProjectListItem) => {
    const status = project.publicationStatus ?? 'none';
    return `admin-pub-status admin-pub-status--${status}`;
  };

  const publicationBadgeLabel = (project: AdminProjectListItem) => {
    const status = project.publicationStatus ?? 'none';
    return t(`admin.projects.publicationStatus.${status}`);
  };

  const deleteMessage = (project: AdminProjectListItem) => {
    if (project.publicationStatus === 'published') {
      return t('admin.projects.deleteMessagePublished', {
        name: project.name,
        count: project.chapterCount,
      });
    }
    return t('admin.projects.deleteMessage', {
      name: project.name,
      count: project.chapterCount,
    });
  };

  const unpublishTitle = (project: AdminProjectListItem) =>
    project.publicationTitle || project.name;

  return (
    <AdminLayout activeTab="projects">
      <div class="admin-page admin-projects-page">
        <p class="admin-intro">{t('admin.projects.subtitle')}</p>

        <AdminFlash error={error} success={success} />

        <AdminSection title={t('admin.projects.listTitle')}>
          <div class="admin-list-filters">
            <Select
              label={t('admin.projects.statusFilter')}
              options={statusSelectOptions}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  (e.target as HTMLSelectElement).value as AdminProjectPublicationFilter | ''
                )
              }
            />
            <Input
              placeholder={t('admin.projects.searchPlaceholder')}
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              aria-label={t('admin.projects.searchPlaceholder')}
            />
          </div>

          {listLoading ? (
            <p class="admin-empty">{t('common.loading')}</p>
          ) : projects.length === 0 ? (
            <p class="admin-empty">{t('admin.projects.empty')}</p>
          ) : (
            <ul class="admin-list">
              {projects.map((project) => (
                <li key={project.id} class="admin-list-card admin-project-card">
                  <div class="admin-project-main">
                    <div class="admin-project-meta">
                      <div class="admin-pub-header">
                        <span class={publicationBadgeClass(project)}>
                          {publicationBadgeLabel(project)}
                        </span>
                        <span class="admin-pub-lang">
                          {project.sourceLanguage} → {project.targetLanguage}
                        </span>
                      </div>
                      <h3>{project.name}</h3>
                      {project.ownerEmail && (
                        <p class="admin-project-owner">
                          {t('admin.projects.owner', { email: project.ownerEmail })}
                        </p>
                      )}
                      <p class="admin-pub-stats">
                        {t('admin.projects.chapters', { count: project.chapterCount })}
                        {' · '}
                        {t('admin.projects.translated', { count: project.translatedCount })}
                        {project.updatedAt &&
                          ` · ${t('admin.projects.updatedAt', {
                            date: new Date(project.updatedAt).toLocaleDateString(),
                          })}`}
                      </p>
                    </div>
                  </div>
                  <div class="admin-list-card-actions admin-project-actions">
                    <Button variant="secondary" size="sm" onClick={() => handleCopyId(project.id)}>
                      {t('admin.projects.copyId')}
                    </Button>
                    {project.publicationStatus === 'published' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(publicUrl(project), '_blank')}
                      >
                        {t('admin.projects.openCatalog')}
                      </Button>
                    )}
                    {project.publicationStatus === 'published' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setUnpublishing(project)}
                      >
                        {t('admin.projects.unpublish')}
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => setDeleting(project)}>
                      {t('admin.projects.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>

      <ConfirmModal
        isOpen={!!unpublishing}
        onClose={() => setUnpublishing(null)}
        onConfirm={handleUnpublish}
        title={t('admin.projects.unpublishTitle')}
        message={
          unpublishing
            ? t('admin.projects.unpublishMessage', { title: unpublishTitle(unpublishing) })
            : ''
        }
        confirmLabel={t('admin.projects.unpublish')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={unpublishLoading}
      />

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('admin.projects.deleteTitle')}
        message={deleting ? deleteMessage(deleting) : ''}
        confirmLabel={t('admin.projects.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={deleteLoading}
      />
    </AdminLayout>
  );
}
