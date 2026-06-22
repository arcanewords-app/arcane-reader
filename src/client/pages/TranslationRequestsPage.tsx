import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api, ApiError } from '../api/client';
import { useUserRole } from '../hooks/useUserRole';
import type { CatalogTranslationRequest, UserRole } from '../types';
import {
  PROJECT_DEFAULT_SOURCE_LANGUAGE,
  PROJECT_DEFAULT_TARGET_LANGUAGE,
  formatLanguagePairLabel,
  type ProjectSourceLanguage,
  type ProjectTargetLanguage,
} from '../constants/translationLanguages';
import { ProjectLanguagePairFields } from '../components/Project/ProjectLanguagePairFields';
import { Button, Input, Modal, Icon, LoadingSpinner } from '../components/ui';
import '../components/Dashboard/Dashboard.css';
import './TranslationRequestsPage.css';

const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  guest: 'profile.roleUser',
  user: 'profile.roleUser',
  author: 'profile.roleAuthor',
  author_plus: 'profile.roleAuthorPlus',
  super_author: 'profile.roleSuperAuthor',
  admin: 'profile.roleAdmin',
};

function formatRequestDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function TranslationRequestsPage() {
  const { t, i18n } = useTranslation();
  const { role } = useUserRole();

  const [requests, setRequests] = useState<CatalogTranslationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<ProjectSourceLanguage>(
    PROJECT_DEFAULT_SOURCE_LANGUAGE
  );
  const [targetLanguage, setTargetLanguage] = useState<ProjectTargetLanguage>(
    PROJECT_DEFAULT_TARGET_LANGUAGE
  );
  const [comment, setComment] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getUserTranslationRequests();
      setRequests(list);
    } catch {
      setRequests([]);
      setError(t('translationRequests.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredRequests = useMemo(() => {
    let list = requests;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        return (
          item.title.toLowerCase().includes(q) ||
          (item.authorName || '').toLowerCase().includes(q) ||
          (item.comment || '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [requests, searchQuery]);

  const subtitle =
    requests.length > 0
      ? t('translationRequests.subtitleCount', { count: requests.length })
      : t('translationRequests.subtitleEmpty');

  const resetForm = () => {
    setTitle('');
    setAuthorName('');
    setSourceLanguage(PROJECT_DEFAULT_SOURCE_LANGUAGE);
    setTargetLanguage(PROJECT_DEFAULT_TARGET_LANGUAGE);
    setComment('');
    setSourceUrl('');
    setCreateError(null);
  };

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setCreateError(t('translationRequests.errors.titleRequired'));
      return;
    }
    const trimmedComment = comment.trim();
    if (trimmedComment.length > 0 && trimmedComment.length < 5) {
      setCreateError(t('translationRequests.errors.commentTooShort'));
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      await api.createCatalogTranslationRequest({
        title: trimmedTitle,
        authorName: authorName.trim() || undefined,
        sourceLanguage,
        targetLanguage,
        comment: trimmedComment || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setShowCreateModal(false);
      resetForm();
      setSuccess(t('translationRequests.created'));
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.data as { error?: string } | undefined;
        if (body?.error === 'Too many pending translation requests') {
          setCreateError(t('translationRequests.errors.pendingLimit'));
        } else {
          setCreateError(t('translationRequests.errors.createFailed'));
        }
      } else {
        setCreateError(t('translationRequests.errors.createFailed'));
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div class="translation-requests-page">
      <div class="home-nav">
        <a
          href="/catalog"
          onClick={(e) => {
            e.preventDefault();
            route('/catalog');
          }}
          class="home-back-projects"
        >
          <Icon name="arrow_back" size="sm" /> {t('nav.catalog')}
        </a>
      </div>

      <div class="dashboard-header">
        <div class="dashboard-title">
          <h1>{t('translationRequests.title')}</h1>
          <p class="dashboard-subtitle">{subtitle}</p>
          <span class="translation-requests-role-badge">{t(ROLE_LABEL_KEYS[role])}</span>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="dashboard-create-btn"
        >
          <Icon name="add" size="sm" /> {t('translationRequests.newButton')}
        </Button>
      </div>

      {success && (
        <p class="translation-requests-flash translation-requests-flash--success" role="status">
          {success}
        </p>
      )}
      {error && (
        <p class="translation-requests-flash translation-requests-flash--error" role="alert">
          {error}
        </p>
      )}

      {requests.length > 0 && (
        <div class="dashboard-filters">
          <div class="dashboard-search">
            <Input
              placeholder={t('translationRequests.searchPlaceholder')}
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              className="dashboard-search-input"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div class="project-grid-loading">
          <LoadingSpinner size="lg" text={t('translationRequests.loading')} />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div class="project-grid-empty">
          <div class="project-grid-empty-icon">
            <Icon name="menu_book" />
          </div>
          <div class="project-grid-empty-text">
            {searchQuery.trim()
              ? t('translationRequests.emptySearch')
              : t('translationRequests.emptyList')}
          </div>
          <div class="project-grid-empty-hint">{t('translationRequests.emptyHint')}</div>
        </div>
      ) : (
        <div class="translation-requests-list">
          {filteredRequests.map((item) => (
            <article key={item.id} class="translation-request-card">
              <h2 class="translation-request-card-title">{item.title}</h2>
              {item.authorName && (
                <p class="translation-request-card-meta">
                  {t('translationRequests.authorLabel')}: {item.authorName}
                </p>
              )}
              <p class="translation-request-card-meta">
                {item.sourceLanguage
                  ? formatLanguagePairLabel(t, item.sourceLanguage, item.targetLanguage)
                  : t('translationRequests.targetOnly', {
                      target: t(`language.${item.targetLanguage}`) || item.targetLanguage,
                    })}
              </p>
              {item.comment && <p class="translation-request-card-comment">{item.comment}</p>}
              <p class="translation-request-card-meta">
                {formatRequestDate(item.createdAt, i18n.language)}
              </p>
              <span class={`translation-request-status translation-request-status--${item.status}`}>
                {t(`translationRequests.status.${item.status}`)}
              </span>
            </article>
          ))}
        </div>
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('translationRequests.modalTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} loading={creating}>
              {t('translationRequests.submit')}
            </Button>
          </>
        }
      >
        {createError && (
          <p class="translation-requests-flash translation-requests-flash--error" role="alert">
            {createError}
          </p>
        )}
        <Input
          label={t('translationRequests.form.title')}
          placeholder={t('translationRequests.form.titlePlaceholder')}
          value={title}
          onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
        />
        <Input
          label={t('translationRequests.form.author')}
          placeholder={t('translationRequests.form.authorPlaceholder')}
          value={authorName}
          onInput={(e) => setAuthorName((e.target as HTMLInputElement).value)}
        />
        <ProjectLanguagePairFields
          idPrefix="translation-request"
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          onSourceLanguageChange={setSourceLanguage}
          onTargetLanguageChange={setTargetLanguage}
        />
        <div class="form-group">
          <label class="form-label" for="translation-request-comment">
            {t('translationRequests.form.comment')}
          </label>
          <textarea
            id="translation-request-comment"
            class="form-input translation-request-form-comment"
            placeholder={t('translationRequests.form.commentPlaceholder')}
            value={comment}
            onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
          />
        </div>
        <Input
          label={t('translationRequests.form.sourceUrl')}
          placeholder={t('translationRequests.form.sourceUrlPlaceholder')}
          value={sourceUrl}
          onInput={(e) => setSourceUrl((e.target as HTMLInputElement).value)}
        />
        <p class="project-language-pair-create-hint">{t('translationRequests.form.hint')}</p>
      </Modal>
    </div>
  );
}
