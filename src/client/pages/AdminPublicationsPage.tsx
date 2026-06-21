import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { AdminPublicationListItem, PublicationStatus } from '../types';
import { Button, Input, Select, ConfirmModal } from '../components/ui';
import { AdminLayout, AdminSection, AdminFlash } from '../components/Admin';
import '../components/Admin/admin-shared.css';
import './AdminPublicationsPage.css';

const STATUS_OPTIONS: Array<PublicationStatus | ''> = ['', 'published', 'draft', 'unpublished'];

export function AdminPublicationsPage() {
  const { t } = useTranslation();

  const [publications, setPublications] = useState<AdminPublicationListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<PublicationStatus | ''>('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const [unpublishing, setUnpublishing] = useState<AdminPublicationListItem | null>(null);
  const [unpublishLoading, setUnpublishLoading] = useState(false);

  const statusSelectOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((s) => ({
        value: s,
        label: s ? t(`admin.publications.status.${s}`) : t('admin.filter.all'),
      })),
    [t]
  );

  const reload = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await api.getAdminPublications({
        status: statusFilter || undefined,
        search: searchDebounced || undefined,
        limit: 100,
      });
      setPublications(list);
    } catch {
      setPublications([]);
      setError(t('admin.publications.loadFailed'));
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
      await api.adminUnpublishPublication(unpublishing.id);
      setUnpublishing(null);
      setSuccess(t('admin.publications.unpublished'));
      await reload();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(t('admin.publications.notFound'));
      } else {
        setError(t('admin.publications.unpublishFailed'));
      }
      return false;
    } finally {
      setUnpublishLoading(false);
    }
  };

  const publicUrl = (pub: AdminPublicationListItem) => `/p/${pub.slug || pub.id}`;

  const statusClass = (status: PublicationStatus) => `admin-pub-status admin-pub-status--${status}`;

  return (
    <AdminLayout activeTab="publications">
      <div class="admin-page admin-publications-page">
        <p class="admin-intro">{t('admin.publications.subtitle')}</p>

        <AdminFlash error={error} success={success} />

        <AdminSection title={t('admin.publications.listTitle')}>
          <div class="admin-list-filters">
            <Select
              label={t('admin.publications.statusFilter')}
              options={statusSelectOptions}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter((e.target as HTMLSelectElement).value as PublicationStatus | '')
              }
            />
            <Input
              placeholder={t('admin.publications.searchPlaceholder')}
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              aria-label={t('admin.publications.searchPlaceholder')}
            />
          </div>

          {listLoading ? (
            <p class="admin-empty">{t('common.loading')}</p>
          ) : publications.length === 0 ? (
            <p class="admin-empty">{t('admin.publications.empty')}</p>
          ) : (
            <ul class="admin-list">
              {publications.map((pub) => (
                <li key={pub.id} class="admin-list-card admin-pub-card">
                  <div class="admin-pub-card-main">
                    {pub.coverImageUrl && (
                      <img src={pub.coverImageUrl} alt="" class="admin-pub-cover" />
                    )}
                    <div class="admin-pub-meta">
                      <div class="admin-pub-header">
                        <span class={statusClass(pub.status)}>
                          {t(`admin.publications.status.${pub.status}`)}
                        </span>
                        <span class="admin-pub-lang">
                          {pub.sourceLanguage} → {pub.targetLanguage}
                        </span>
                      </div>
                      <h3>{pub.title || t('publication.untitled')}</h3>
                      {(pub.authorDisplay || pub.translatorDisplay) && (
                        <p class="admin-pub-people">
                          {pub.authorDisplay && (
                            <span>
                              {t('publication.authorLabel')}: {pub.authorDisplay}
                            </span>
                          )}
                          {pub.translatorDisplay && (
                            <span>
                              {t('publication.translatorLabel')}: {pub.translatorDisplay}
                            </span>
                          )}
                        </p>
                      )}
                      <p class="admin-pub-stats">
                        {t('admin.publications.chapters', {
                          count: pub.translatedChapterCount ?? 0,
                        })}
                        {pub.publishedAt &&
                          ` · ${t('admin.publications.publishedAt', {
                            date: new Date(pub.publishedAt).toLocaleDateString(),
                          })}`}
                      </p>
                    </div>
                  </div>
                  <div class="admin-list-card-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => window.open(publicUrl(pub), '_blank')}
                    >
                      {t('admin.publications.open')}
                    </Button>
                    {pub.status === 'published' && (
                      <Button variant="secondary" size="sm" onClick={() => setUnpublishing(pub)}>
                        {t('admin.publications.unpublish')}
                      </Button>
                    )}
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
        title={t('admin.publications.unpublishTitle')}
        message={
          unpublishing
            ? t('admin.publications.unpublishMessage', {
                title: unpublishing.title || t('publication.untitled'),
              })
            : ''
        }
        confirmLabel={t('admin.publications.unpublish')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={unpublishLoading}
      />
    </AdminLayout>
  );
}
