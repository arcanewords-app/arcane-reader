import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type {
  AnnouncementAlert,
  AnnouncementMinRole,
  AnnouncementVariant,
  NewsCategory,
  NewsPost,
  NewsStatus,
} from '../types';
import { AdminLayout, AdminSection, AdminFlash } from '../components/Admin';
import '../components/Admin/admin-shared.css';
import { Button, Input, Select, Modal, ConfirmModal } from '../components/ui';
import './AdminNewsPage.css';

const categoryOptions: NewsCategory[] = ['feature', 'discount', 'update', 'other'];
const statusOptions: Array<NewsStatus | ''> = ['', 'draft', 'published', 'archived'];
const variantOptions: AnnouncementVariant[] = ['info', 'promo', 'neutral'];
const minRoleOptions: AnnouncementMinRole[] = [
  'guest',
  'user',
  'author',
  'author_plus',
  'super_author',
  'admin',
];

export function AdminNewsPage() {
  const { t } = useTranslation();

  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [alerts, setAlerts] = useState<AnnouncementAlert[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<NewsCategory>('feature');
  const [slug, setSlug] = useState('');

  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<NewsCategory>('feature');
  const [editSlug, setEditSlug] = useState('');

  const [alertModalPost, setAlertModalPost] = useState<NewsPost | null>(null);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertVariant, setAlertVariant] = useState<AnnouncementVariant>('info');
  const [alertMinRole, setAlertMinRole] = useState<AnnouncementMinRole>('guest');
  const [alertPriority, setAlertPriority] = useState(0);
  const [alertLoading, setAlertLoading] = useState(false);

  const [deletingPost, setDeletingPost] = useState<NewsPost | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [bumpingAlert, setBumpingAlert] = useState<AnnouncementAlert | null>(null);

  const [statusFilter, setStatusFilter] = useState<NewsStatus | ''>('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const categorySelectOptions = useMemo(
    () => categoryOptions.map((c) => ({ value: c, label: t(`news.category.${c}`) })),
    [t]
  );

  const variantSelectOptions = useMemo(
    () => variantOptions.map((v) => ({ value: v, label: t(`admin.news.variant.${v}`) })),
    [t]
  );

  const minRoleSelectOptions = useMemo(
    () => minRoleOptions.map((r) => ({ value: r, label: t(`admin.news.minRole.${r}`) })),
    [t]
  );

  const statusSelectOptions = useMemo(
    () =>
      statusOptions.map((s) => ({
        value: s,
        label: s ? t(`admin.news.status.${s}`) : t('admin.filter.all'),
      })),
    [t]
  );

  const reload = useCallback(async () => {
    setListLoading(true);
    try {
      const [newsList, alertList] = await Promise.all([
        api.getAdminNewsPosts({
          status: statusFilter || undefined,
          search: searchDebounced || undefined,
          limit: 100,
        }),
        api.getAdminAnnouncements(),
      ]);
      setPosts(newsList);
      setAlerts(alertList);
    } catch {
      setPosts([]);
      setAlerts([]);
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, searchDebounced]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const clearForm = () => {
    setTitle('');
    setSummary('');
    setBody('');
    setCategory('feature');
    setSlug('');
  };

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFormLoading(true);
    try {
      await api.createNewsPost({
        title: title.trim(),
        summary: summary.trim(),
        body,
        category,
        slug: slug.trim() || null,
      });
      clearForm();
      setSuccess(t('admin.news.created'));
      await reload();
    } catch {
      setError(t('admin.news.createFailed'));
    } finally {
      setFormLoading(false);
    }
  };

  const openEdit = (post: NewsPost) => {
    setEditingPost(post);
    setEditTitle(post.title);
    setEditSummary(post.summary);
    setEditBody(post.body);
    setEditCategory(post.category);
    setEditSlug(post.slug ?? '');
    setError(null);
  };

  const handleEditSave = async () => {
    if (!editingPost) return;
    setFormLoading(true);
    setError(null);
    try {
      await api.updateNewsPost(editingPost.id, {
        title: editTitle.trim(),
        summary: editSummary.trim(),
        body: editBody,
        category: editCategory,
        slug: editSlug.trim() || null,
      });
      setEditingPost(null);
      setSuccess(t('admin.news.updated'));
      await reload();
    } catch {
      setError(t('admin.news.updateFailed'));
    } finally {
      setFormLoading(false);
    }
  };

  const handlePublish = async (post: NewsPost) => {
    setError(null);
    try {
      await api.publishNewsPost(post.id);
      setSuccess(t('admin.news.published'));
      await reload();
    } catch {
      setError(t('admin.news.publishFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deletingPost) return;
    setDeleteLoading(true);
    setError(null);
    try {
      await api.deleteNewsPost(deletingPost.id);
      setDeletingPost(null);
      setSuccess(t('admin.news.deleted'));
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t('admin.news.deleteBlocked'));
      } else {
        setError(t('admin.news.deleteFailed'));
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const openAlertModal = (post: NewsPost) => {
    setAlertModalPost(post);
    setAlertMessage(post.summary);
    setAlertVariant('info');
    setAlertMinRole('guest');
    setAlertPriority(0);
    setError(null);
  };

  const handleCreateAlert = async () => {
    if (!alertModalPost) return;
    setAlertLoading(true);
    setError(null);
    try {
      await api.createAnnouncementFromNews(alertModalPost.id, {
        message: alertMessage.trim() || alertModalPost.summary,
        ctaLabel: t('announcement.ctaDefault'),
        variant: alertVariant,
        minRole: alertMinRole,
        priority: alertPriority,
      });
      setAlertModalPost(null);
      setSuccess(t('admin.news.alertCreated'));
      await reload();
    } catch {
      setError(t('admin.news.alertCreateFailed'));
    } finally {
      setAlertLoading(false);
    }
  };

  const toggleAlert = async (alert: AnnouncementAlert) => {
    try {
      await api.updateAnnouncement(alert.id, { isActive: !alert.isActive });
      await reload();
    } catch {
      setError(t('admin.news.alertUpdateFailed'));
    }
  };

  const bumpAlertVersion = async () => {
    if (!bumpingAlert) return;
    try {
      await api.updateAnnouncement(bumpingAlert.id, {
        contentVersion: bumpingAlert.contentVersion + 1,
      });
      setBumpingAlert(null);
      setSuccess(t('admin.news.alertVersionBumped'));
      await reload();
    } catch {
      setError(t('admin.news.alertUpdateFailed'));
    }
  };

  const statusLabel = (status: NewsPost['status']) => t(`admin.news.status.${status}`);

  return (
    <AdminLayout activeTab="news">
      <div class="admin-page admin-news-page">
        <p class="admin-intro">{t('admin.news.subtitle')}</p>

        <AdminFlash error={error} success={success} />

        <AdminSection title={t('admin.news.createTitle')} as="form" onSubmit={handleCreate}>
          <Input
            label={t('admin.news.form.title')}
            value={title}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            maxLength={200}
            required
          />
          <Input
            label={t('admin.news.form.summary')}
            value={summary}
            onInput={(e) => setSummary((e.target as HTMLInputElement).value)}
            maxLength={300}
            required
          />
          <div class="form-group">
            <label class="form-label" for="admin-news-body">
              {t('admin.news.form.body')}
            </label>
            <textarea
              id="admin-news-body"
              class="form-input admin-textarea admin-textarea--lg"
              value={body}
              onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
              rows={8}
            />
          </div>
          <Select
            label={t('admin.news.form.category')}
            options={categorySelectOptions}
            value={category}
            onChange={(e) => setCategory((e.target as HTMLSelectElement).value as NewsCategory)}
          />
          <Input
            label={t('admin.news.form.slug')}
            value={slug}
            onInput={(e) => setSlug((e.target as HTMLInputElement).value)}
            placeholder={t('admin.news.form.slugPlaceholder')}
            maxLength={120}
          />
          <div class="admin-form-actions">
            <Button type="submit" variant="primary" loading={formLoading} disabled={formLoading}>
              {t('admin.news.form.create')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled
              title={t('admin.news.translateSoon')}
            >
              {t('admin.news.translateSoon')}
            </Button>
          </div>
        </AdminSection>

        <AdminSection title={t('admin.news.listTitle')}>
          <div class="admin-list-filters">
            <Select
              label={t('admin.news.statusFilter')}
              options={statusSelectOptions}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter((e.target as HTMLSelectElement).value as NewsStatus | '')
              }
            />
            <Input
              placeholder={t('admin.news.searchPlaceholder')}
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              aria-label={t('admin.news.searchPlaceholder')}
            />
          </div>

          {listLoading ? (
            <p class="admin-empty">{t('common.loading')}</p>
          ) : posts.length === 0 ? (
            <p class="admin-empty">{t('admin.news.empty')}</p>
          ) : (
            <ul class="admin-list">
              {posts.map((post) => (
                <li key={post.id} class="admin-list-card">
                  <div class="admin-news-card-header">
                    <span class={`admin-news-status admin-news-status--${post.status}`}>
                      {statusLabel(post.status)}
                    </span>
                    <span class="admin-news-card-category">
                      {t(`news.category.${post.category}`)}
                    </span>
                  </div>
                  <h3 class="admin-news-card-title">{post.title}</h3>
                  <p class="admin-news-card-summary">{post.summary}</p>
                  <div class="admin-list-card-actions">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(post)}>
                      {t('admin.form.edit')}
                    </Button>
                    {post.status === 'draft' && (
                      <Button variant="primary" size="sm" onClick={() => handlePublish(post)}>
                        {t('admin.news.publish')}
                      </Button>
                    )}
                    {post.status === 'published' && (
                      <Button variant="secondary" size="sm" onClick={() => openAlertModal(post)}>
                        {t('admin.news.createAlert')}
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => setDeletingPost(post)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>

        <AdminSection title={t('admin.news.alertsTitle')}>
          {alerts.length === 0 ? (
            <p class="admin-empty">{t('admin.news.alertsEmpty')}</p>
          ) : (
            <ul class="admin-news-alerts">
              {alerts.map((alert) => (
                <li key={alert.id} class="admin-news-alert-row">
                  <div class="admin-news-alert-main">
                    <span class={`admin-news-alert-badge ${alert.isActive ? 'active' : ''}`}>
                      {alert.isActive ? t('admin.news.alertActive') : t('admin.news.alertInactive')}
                    </span>
                    <span class="admin-news-alert-message">
                      {alert.message || t('admin.news.alertUsesSummary')}
                    </span>
                    <span class="admin-news-alert-meta">
                      {t('admin.news.alertVersion', { version: alert.contentVersion })} ·{' '}
                      {t(`admin.news.minRole.${alert.minRole}`)}
                    </span>
                  </div>
                  <div class="admin-news-alert-actions">
                    <Button variant="secondary" size="sm" onClick={() => toggleAlert(alert)}>
                      {alert.isActive ? t('admin.news.deactivate') : t('admin.news.activate')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setBumpingAlert(alert)}>
                      {t('admin.news.bumpVersion')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        try {
                          await api.deleteAnnouncement(alert.id);
                          await reload();
                        } catch {
                          setError(t('admin.news.alertDeleteFailed'));
                        }
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>

      <Modal
        isOpen={!!editingPost}
        onClose={() => setEditingPost(null)}
        title={t('admin.news.editTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingPost(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleEditSave} loading={formLoading}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div class="admin-news-modal-form">
          <Input
            label={t('admin.news.form.title')}
            value={editTitle}
            onInput={(e) => setEditTitle((e.target as HTMLInputElement).value)}
            maxLength={200}
          />
          <Input
            label={t('admin.news.form.summary')}
            value={editSummary}
            onInput={(e) => setEditSummary((e.target as HTMLInputElement).value)}
            maxLength={300}
          />
          <div class="form-group">
            <label class="form-label" for="admin-news-edit-body">
              {t('admin.news.form.body')}
            </label>
            <textarea
              id="admin-news-edit-body"
              class="form-input admin-textarea admin-textarea--lg"
              value={editBody}
              onInput={(e) => setEditBody((e.target as HTMLTextAreaElement).value)}
              rows={8}
            />
          </div>
          <Select
            label={t('admin.news.form.category')}
            options={categorySelectOptions}
            value={editCategory}
            onChange={(e) => setEditCategory((e.target as HTMLSelectElement).value as NewsCategory)}
          />
          <Input
            label={t('admin.news.form.slug')}
            value={editSlug}
            onInput={(e) => setEditSlug((e.target as HTMLInputElement).value)}
            maxLength={120}
          />
        </div>
      </Modal>

      <Modal
        isOpen={!!alertModalPost}
        onClose={() => setAlertModalPost(null)}
        title={t('admin.news.alertModalTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAlertModalPost(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleCreateAlert} loading={alertLoading}>
              {t('admin.news.createAlert')}
            </Button>
          </>
        }
      >
        <div class="admin-news-modal-form">
          <Input
            label={t('admin.news.alertMessage')}
            value={alertMessage}
            onInput={(e) => setAlertMessage((e.target as HTMLInputElement).value)}
            maxLength={160}
          />
          <Select
            label={t('admin.news.alertVariant')}
            options={variantSelectOptions}
            value={alertVariant}
            onChange={(e) =>
              setAlertVariant((e.target as HTMLSelectElement).value as AnnouncementVariant)
            }
          />
          <Select
            label={t('admin.news.alertMinRole')}
            options={minRoleSelectOptions}
            value={alertMinRole}
            onChange={(e) =>
              setAlertMinRole((e.target as HTMLSelectElement).value as AnnouncementMinRole)
            }
          />
          <Input
            label={t('admin.news.alertPriority')}
            type="number"
            value={String(alertPriority)}
            onInput={(e) => setAlertPriority(Number((e.target as HTMLInputElement).value) || 0)}
          />
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deletingPost}
        onClose={() => setDeletingPost(null)}
        onConfirm={handleDelete}
        title={t('admin.news.deleteTitle')}
        message={deletingPost ? t('admin.news.deleteMessage', { title: deletingPost.title }) : ''}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={deleteLoading}
      />

      <ConfirmModal
        isOpen={!!bumpingAlert}
        onClose={() => setBumpingAlert(null)}
        onConfirm={bumpAlertVersion}
        title={t('admin.news.bumpVersionTitle')}
        message={t('admin.news.bumpVersionMessage')}
        confirmLabel={t('admin.news.bumpVersion')}
        cancelLabel={t('common.cancel')}
      />
    </AdminLayout>
  );
}
