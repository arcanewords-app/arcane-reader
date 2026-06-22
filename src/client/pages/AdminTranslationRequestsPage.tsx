import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { AdminCatalogTranslationRequest, CatalogTranslationRequestStatus } from '../types';
import { formatLanguagePairLabel } from '../constants/translationLanguages';
import { Button, Input, Select, ConfirmModal } from '../components/ui';
import { AdminLayout, AdminSection, AdminFlash } from '../components/Admin';
import '../components/Admin/admin-shared.css';
import './AdminTranslationRequestsPage.css';
import './TranslationRequestsPage.css';

const STATUS_OPTIONS: Array<CatalogTranslationRequestStatus | ''> = [
  '',
  'pending',
  'reviewed',
  'accepted',
  'rejected',
  'fulfilled',
];

const EDITABLE_STATUSES: CatalogTranslationRequestStatus[] = [
  'pending',
  'reviewed',
  'accepted',
  'rejected',
  'fulfilled',
];

const REJECTABLE_STATUSES: CatalogTranslationRequestStatus[] = ['pending', 'reviewed', 'accepted'];

const DELETABLE_STATUSES: CatalogTranslationRequestStatus[] = ['rejected', 'fulfilled'];

export function AdminTranslationRequestsPage() {
  const { t } = useTranslation();

  const [requests, setRequests] = useState<AdminCatalogTranslationRequest[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<CatalogTranslationRequestStatus | ''>('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const [drafts, setDrafts] = useState<
    Record<
      string,
      { status: CatalogTranslationRequestStatus; adminNotes: string; linkedPublicationId: string }
    >
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCatalogTranslationRequest | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const statusSelectOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((s) => ({
        value: s,
        label: s ? t(`translationRequests.status.${s}`) : t('admin.filter.all'),
      })),
    [t]
  );

  const statusEditOptions = useMemo(
    () =>
      EDITABLE_STATUSES.map((s) => ({
        value: s,
        label: t(`translationRequests.status.${s}`),
      })),
    [t]
  );

  const reload = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await api.getAdminTranslationRequests({
        status: statusFilter || undefined,
        search: searchDebounced || undefined,
        limit: 100,
      });
      setRequests(list);
      setDrafts(
        Object.fromEntries(
          list.map((item) => [
            item.id,
            {
              status: item.status,
              adminNotes: item.adminNotes ?? '',
              linkedPublicationId: item.linkedPublicationId ?? '',
            },
          ])
        )
      );
    } catch {
      setRequests([]);
      setError(t('admin.translationRequests.loadFailed'));
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

  const updateDraft = (
    id: string,
    patch: Partial<{
      status: CatalogTranslationRequestStatus;
      adminNotes: string;
      linkedPublicationId: string;
    }>
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const handleSave = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await api.updateAdminTranslationRequest(id, {
        status: draft.status,
        adminNotes: draft.adminNotes.trim() || null,
        linkedPublicationId: draft.linkedPublicationId.trim() || null,
      });
      setSuccess(t('admin.translationRequests.saved'));
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(t('admin.translationRequests.notFound'));
      } else {
        setError(t('admin.translationRequests.saveFailed'));
      }
    } finally {
      setSavingId(null);
    }
  };

  const handleReject = async (item: AdminCatalogTranslationRequest) => {
    const draft = drafts[item.id];
    setRejectingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.updateAdminTranslationRequest(item.id, {
        status: 'rejected',
        adminNotes: draft?.adminNotes.trim() || null,
        linkedPublicationId: draft?.linkedPublicationId.trim() || null,
      });
      setSuccess(t('admin.translationRequests.rejected'));
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(t('admin.translationRequests.notFound'));
      } else {
        setError(t('admin.translationRequests.saveFailed'));
      }
    } finally {
      setRejectingId(null);
    }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!deleting) return true;
    setDeleteLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.deleteAdminTranslationRequest(deleting.id);
      setDeleting(null);
      setSuccess(t('admin.translationRequests.deleted'));
      await reload();
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.data as { error?: string } | undefined;
        if (err.status === 409 || body?.error?.includes('cannot be deleted')) {
          setError(t('admin.translationRequests.deleteForbidden'));
        } else if (err.status === 404) {
          setError(t('admin.translationRequests.notFound'));
        } else {
          setError(t('admin.translationRequests.deleteFailed'));
        }
      } else {
        setError(t('admin.translationRequests.deleteFailed'));
      }
      return false;
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <AdminLayout activeTab="translationRequests">
      <div class="admin-page admin-translation-requests-page">
        <p class="admin-intro">{t('admin.translationRequests.subtitle')}</p>

        <AdminFlash error={error} success={success} />

        <AdminSection title={t('admin.tabs.translationRequests')}>
          <div class="admin-list-filters">
            <Input
              placeholder={t('admin.translationRequests.searchPlaceholder')}
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
            <Select
              label={t('admin.translationRequests.statusFilter')}
              options={statusSelectOptions}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  (e.target as HTMLSelectElement).value as CatalogTranslationRequestStatus | ''
                )
              }
            />
          </div>

          {listLoading ? (
            <p class="admin-list-empty">{t('common.loading')}</p>
          ) : requests.length === 0 ? (
            <p class="admin-list-empty">{t('admin.translationRequests.empty')}</p>
          ) : (
            <div class="admin-list">
              {requests.map((item) => {
                const draft = drafts[item.id];
                if (!draft) return null;
                const canReject = REJECTABLE_STATUSES.includes(item.status);
                const canDelete = DELETABLE_STATUSES.includes(item.status);
                return (
                  <article key={item.id} class="admin-list-card">
                    <div class="admin-list-card-header">
                      <h3 class="admin-list-card-title">{item.title}</h3>
                      <span
                        class={`translation-request-status translation-request-status--${item.status}`}
                      >
                        {t(`translationRequests.status.${item.status}`)}
                      </span>
                    </div>
                    {item.authorName && (
                      <p class="admin-translation-request-card-meta">
                        {t('translationRequests.authorLabel')}: {item.authorName}
                      </p>
                    )}
                    <p class="admin-translation-request-card-meta">
                      {item.sourceLanguage
                        ? formatLanguagePairLabel(t, item.sourceLanguage, item.targetLanguage)
                        : t('translationRequests.targetOnly', {
                            target: t(`language.${item.targetLanguage}`) || item.targetLanguage,
                          })}
                    </p>
                    <p class="admin-translation-request-card-meta">
                      {t('admin.translationRequests.userEmail')}: {item.userEmail || '—'}
                    </p>
                    <p class="admin-translation-request-card-meta">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                    {item.comment && (
                      <p class="admin-translation-request-comment">{item.comment}</p>
                    )}
                    {item.sourceUrl && (
                      <p class="admin-translation-request-card-meta">
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {item.sourceUrl}
                        </a>
                      </p>
                    )}
                    {(canReject || canDelete) && (
                      <div class="admin-list-card-actions admin-translation-request-quick-actions">
                        {canReject && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleReject(item)}
                            loading={rejectingId === item.id}
                          >
                            {t('admin.translationRequests.reject')}
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="secondary" size="sm" onClick={() => setDeleting(item)}>
                            {t('admin.translationRequests.delete')}
                          </Button>
                        )}
                      </div>
                    )}
                    <div class="admin-translation-request-actions">
                      <Select
                        label={t('admin.translationRequests.statusLabel')}
                        options={statusEditOptions}
                        value={draft.status}
                        onChange={(e) =>
                          updateDraft(item.id, {
                            status: (e.target as HTMLSelectElement)
                              .value as CatalogTranslationRequestStatus,
                          })
                        }
                      />
                      <Input
                        label={t('admin.translationRequests.linkedPublication')}
                        placeholder={t('admin.translationRequests.linkedPublicationPlaceholder')}
                        value={draft.linkedPublicationId}
                        onInput={(e) =>
                          updateDraft(item.id, {
                            linkedPublicationId: (e.target as HTMLInputElement).value,
                          })
                        }
                      />
                      <div class="form-group admin-translation-request-notes">
                        <label class="form-label" for={`admin-notes-${item.id}`}>
                          {t('admin.translationRequests.adminNotes')}
                        </label>
                        <textarea
                          id={`admin-notes-${item.id}`}
                          class="form-input translation-request-form-comment"
                          value={draft.adminNotes}
                          onInput={(e) =>
                            updateDraft(item.id, {
                              adminNotes: (e.target as HTMLTextAreaElement).value,
                            })
                          }
                        />
                      </div>
                      <Button
                        variant="primary"
                        onClick={() => handleSave(item.id)}
                        loading={savingId === item.id}
                      >
                        {t('common.save')}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </AdminSection>
      </div>

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('admin.translationRequests.deleteTitle')}
        message={
          deleting ? t('admin.translationRequests.deleteMessage', { title: deleting.title }) : ''
        }
        confirmLabel={t('admin.translationRequests.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={deleteLoading}
      />
    </AdminLayout>
  );
}
