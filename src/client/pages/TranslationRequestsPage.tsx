import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api, ApiError } from '../api/client';
import { useUserRole } from '../hooks/useUserRole';
import type {
  AdminCatalogTranslationRequest,
  BoardTranslationRequest,
  CatalogTranslationRequestStatus,
  PublicEntity,
} from '../types';
import {
  PROJECT_DEFAULT_SOURCE_LANGUAGE,
  PROJECT_DEFAULT_TARGET_LANGUAGE,
  formatLanguagePairLabel,
  type ProjectSourceLanguage,
  type ProjectTargetLanguage,
} from '../constants/translationLanguages';
import { ProjectLanguagePairFields } from '../components/Project/ProjectLanguagePairFields';
import { EntityPickerModal } from '../components/EntityCard/EntityPickerModal';
import { SuggestTranslationModal } from '../components/TranslationRequests/SuggestTranslationModal';
import {
  Button,
  Input,
  Modal,
  Icon,
  LoadingSpinner,
  Select,
  ConfirmModal,
  AlertModal,
} from '../components/ui';
import { getProjectLimitForRole } from '../../config/projectLimits';
import '../components/Dashboard/Dashboard.css';
import './TranslationRequestsPage.css';

type BoardTab = 'all' | 'mine';

const OPEN_BOARD_STATUSES: CatalogTranslationRequestStatus[] = ['pending', 'reviewed', 'accepted'];

const REJECTABLE_STATUSES: CatalogTranslationRequestStatus[] = ['pending', 'reviewed', 'accepted'];
const DELETABLE_STATUSES: CatalogTranslationRequestStatus[] = ['rejected', 'fulfilled'];
const EDITABLE_STATUSES: CatalogTranslationRequestStatus[] = [
  'pending',
  'reviewed',
  'accepted',
  'rejected',
  'fulfilled',
];

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
  const { isAtLeast } = useUserRole();
  const isAdmin = isAtLeast('admin');

  const [requests, setRequests] = useState<BoardTranslationRequest[]>([]);
  const [closedAdminRequests, setClosedAdminRequests] = useState<AdminCatalogTranslationRequest[]>(
    []
  );
  const [adminById, setAdminById] = useState<Record<string, AdminCatalogTranslationRequest>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [targetLanguageFilter, setTargetLanguageFilter] = useState('');
  const [boardTab, setBoardTab] = useState<BoardTab>('all');
  const [moderationMode, setModerationMode] = useState(false);
  const [showClosedForAdmin, setShowClosedForAdmin] = useState(false);

  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [pickerRequestId, setPickerRequestId] = useState<string | null>(null);
  const [interestLoadingId, setInterestLoadingId] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<BoardTranslationRequest | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const [createProjectTarget, setCreateProjectTarget] = useState<BoardTranslationRequest | null>(
    null
  );
  const [projectName, setProjectName] = useState('');
  const [projectSourceLanguage, setProjectSourceLanguage] = useState<ProjectSourceLanguage>(
    PROJECT_DEFAULT_SOURCE_LANGUAGE
  );
  const [projectTargetLanguage, setProjectTargetLanguage] = useState<ProjectTargetLanguage>(
    PROJECT_DEFAULT_TARGET_LANGUAGE
  );
  const [creatingProject, setCreatingProject] = useState(false);
  const [limitModal, setLimitModal] = useState<{ limit: number; current: number } | null>(null);

  const [adminDrafts, setAdminDrafts] = useState<
    Record<
      string,
      { status: CatalogTranslationRequestStatus; adminNotes: string; linkedPublicationId: string }
    >
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCatalogTranslationRequest | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getTranslationRequestsBoard({
        search: searchDebounced || undefined,
        targetLanguage: targetLanguageFilter || undefined,
        mine: boardTab === 'mine',
        limit: 100,
      });
      setRequests(list);

      if (isAdmin) {
        const adminList = await api.getAdminTranslationRequests({
          search: searchDebounced || undefined,
          targetLanguage: targetLanguageFilter || undefined,
          limit: 100,
        });
        const map: Record<string, AdminCatalogTranslationRequest> = {};
        const drafts: typeof adminDrafts = {};
        for (const item of adminList) {
          map[item.id] = item;
          drafts[item.id] = {
            status: item.status,
            adminNotes: item.adminNotes ?? '',
            linkedPublicationId: item.linkedPublicationId ?? '',
          };
        }
        setAdminById(map);
        setAdminDrafts(drafts);

        if (moderationMode && showClosedForAdmin) {
          const [rejected, fulfilled] = await Promise.all([
            api.getAdminTranslationRequests({ status: 'rejected', limit: 50 }),
            api.getAdminTranslationRequests({ status: 'fulfilled', limit: 50 }),
          ]);
          setClosedAdminRequests([...rejected, ...fulfilled]);
        } else {
          setClosedAdminRequests([]);
        }
      }
    } catch {
      setRequests([]);
      setError(t('requestBoard.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [
    searchDebounced,
    targetLanguageFilter,
    boardTab,
    isAdmin,
    moderationMode,
    showClosedForAdmin,
    t,
  ]);

  useEffect(() => {
    reload();
  }, [reload]);

  const targetLanguageOptions = useMemo(() => {
    const langs = new Set(requests.map((r) => r.targetLanguage));
    return [
      { value: '', label: t('requestBoard.filterAllLanguages') },
      ...[...langs].map((code) => ({
        value: code,
        label: t(`language.${code}`) || code,
      })),
    ];
  }, [requests, t]);

  const statusEditOptions = useMemo(
    () =>
      EDITABLE_STATUSES.map((s) => ({
        value: s,
        label: t(`translationRequests.status.${s}`),
      })),
    [t]
  );

  const handleTranslatorPick = async (entities: PublicEntity[]) => {
    const entity = entities[0];
    if (!entity || !pickerRequestId) return;
    setInterestLoadingId(pickerRequestId);
    setError(null);
    try {
      await api.createTranslationRequestInterest(pickerRequestId, entity.id);
      setSuccess(t('requestBoard.interestCreated'));
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INTEREST_EXISTS') {
          setError(t('requestBoard.errors.interestExists'));
        } else if (err.code === 'SELF_ASSIGN') {
          setError(t('requestBoard.errors.selfAssign'));
        } else if (err.code === 'REQUEST_CLOSED') {
          setError(t('requestBoard.errors.requestClosed'));
        } else {
          setError(t('requestBoard.errors.interestFailed'));
        }
      } else {
        setError(t('requestBoard.errors.interestFailed'));
      }
    } finally {
      setInterestLoadingId(null);
      setPickerRequestId(null);
    }
  };

  const openCreateProject = (item: BoardTranslationRequest) => {
    setCreateProjectTarget(item);
    setProjectName(item.title);
    setProjectSourceLanguage(
      (item.sourceLanguage as ProjectSourceLanguage) || PROJECT_DEFAULT_SOURCE_LANGUAGE
    );
    setProjectTargetLanguage(
      (item.targetLanguage as ProjectTargetLanguage) || PROJECT_DEFAULT_TARGET_LANGUAGE
    );
  };

  const handleCreateProject = async () => {
    if (!createProjectTarget?.myInterest) return;
    const trimmed = projectName.trim();
    if (!trimmed) return;

    setCreatingProject(true);
    setError(null);
    try {
      const project = await api.createProject(trimmed, {
        sourceLanguage: projectSourceLanguage,
        targetLanguage: projectTargetLanguage,
        catalogTranslationRequestId: createProjectTarget.id,
        translatorEntityId: createProjectTarget.myInterest.translatorEntityId,
      });
      setCreateProjectTarget(null);
      route(`/projects/${project.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PROJECT_LIMIT') {
        const data = err.data as { limit?: number; current?: number } | undefined;
        setLimitModal({
          limit: data?.limit ?? getProjectLimitForRole('author'),
          current: data?.current ?? 0,
        });
      } else {
        setError(t('requestBoard.errors.createProjectFailed'));
      }
    } finally {
      setCreatingProject(false);
    }
  };

  const handleWithdraw = async (): Promise<boolean> => {
    if (!withdrawTarget) return true;
    setWithdrawLoading(true);
    try {
      await api.withdrawTranslationRequestInterest(withdrawTarget.id);
      setWithdrawTarget(null);
      setSuccess(t('requestBoard.interestWithdrawn'));
      await reload();
      return true;
    } catch {
      setError(t('requestBoard.errors.withdrawFailed'));
      return false;
    } finally {
      setWithdrawLoading(false);
    }
  };

  const updateAdminDraft = (
    id: string,
    patch: Partial<{
      status: CatalogTranslationRequestStatus;
      adminNotes: string;
      linkedPublicationId: string;
    }>
  ) => {
    setAdminDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const handleAdminSave = async (id: string) => {
    const draft = adminDrafts[id];
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
    } catch {
      setError(t('admin.translationRequests.saveFailed'));
    } finally {
      setSavingId(null);
    }
  };

  const handleAdminReject = async (id: string) => {
    const draft = adminDrafts[id];
    setRejectingId(id);
    setError(null);
    try {
      await api.updateAdminTranslationRequest(id, {
        status: 'rejected',
        adminNotes: draft?.adminNotes.trim() || null,
        linkedPublicationId: draft?.linkedPublicationId.trim() || null,
      });
      setSuccess(t('admin.translationRequests.rejected'));
      await reload();
    } catch {
      setError(t('admin.translationRequests.saveFailed'));
    } finally {
      setRejectingId(null);
    }
  };

  const handleAdminDelete = async (): Promise<boolean> => {
    if (!deleting) return true;
    setDeleteLoading(true);
    try {
      await api.deleteAdminTranslationRequest(deleting.id);
      setDeleting(null);
      setSuccess(t('admin.translationRequests.deleted'));
      await reload();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t('admin.translationRequests.deleteForbidden'));
      } else {
        setError(t('admin.translationRequests.deleteFailed'));
      }
      return false;
    } finally {
      setDeleteLoading(false);
    }
  };

  const subtitle =
    requests.length > 0
      ? t('requestBoard.subtitleCount', { count: requests.length })
      : t('requestBoard.subtitleEmpty');

  return (
    <div class="translation-requests-page request-board-page">
      <div class="dashboard-header">
        <div class="dashboard-title">
          <h1>{t('requestBoard.title')}</h1>
          <p class="dashboard-subtitle">{subtitle}</p>
        </div>
        <div class="request-board-header-actions">
          {isAdmin && (
            <Button
              variant={moderationMode ? 'primary' : 'secondary'}
              onClick={() => setModerationMode((v) => !v)}
              className="request-board-moderation-toggle"
            >
              <Icon name="settings" size="sm" /> {t('requestBoard.moderation')}
            </Button>
          )}
          {isAdmin && moderationMode && (
            <Button
              variant={showClosedForAdmin ? 'primary' : 'secondary'}
              onClick={() => setShowClosedForAdmin((v) => !v)}
            >
              {t('requestBoard.showClosed')}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => setShowSuggestModal(true)}
            className="dashboard-create-btn"
          >
            <Icon name="add" size="sm" /> {t('translationRequests.newButton')}
          </Button>
        </div>
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

      <div class="request-board-toolbar">
        <div class="dashboard-filters request-board-filters">
          <div class="dashboard-search">
            <Input
              placeholder={t('requestBoard.searchPlaceholder')}
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              className="dashboard-search-input"
            />
          </div>
          <Select
            label={t('requestBoard.targetLanguage')}
            options={targetLanguageOptions}
            value={targetLanguageFilter}
            onChange={(e) => setTargetLanguageFilter((e.target as HTMLSelectElement).value)}
          />
        </div>
        <div class="request-board-tabs" role="tablist">
          <button
            type="button"
            class={`request-board-tab ${boardTab === 'all' ? 'request-board-tab--active' : ''}`}
            role="tab"
            aria-selected={boardTab === 'all'}
            onClick={() => setBoardTab('all')}
          >
            {t('requestBoard.tabAll')}
          </button>
          <button
            type="button"
            class={`request-board-tab ${boardTab === 'mine' ? 'request-board-tab--active' : ''}`}
            role="tab"
            aria-selected={boardTab === 'mine'}
            onClick={() => setBoardTab('mine')}
          >
            {t('requestBoard.tabMine')}
          </button>
        </div>
      </div>

      {loading ? (
        <div class="project-grid-loading">
          <LoadingSpinner size="lg" text={t('requestBoard.loading')} />
        </div>
      ) : requests.length === 0 ? (
        <div class="project-grid-empty">
          <div class="project-grid-empty-icon">
            <Icon name="menu_book" />
          </div>
          <div class="project-grid-empty-text">
            {searchQuery.trim() || boardTab === 'mine'
              ? t('requestBoard.emptyFiltered')
              : t('requestBoard.emptyList')}
          </div>
          <div class="project-grid-empty-hint">{t('requestBoard.emptyHint')}</div>
        </div>
      ) : (
        <div class="translation-requests-list request-board-list">
          {requests.map((item) => {
            const adminItem = adminById[item.id];
            const adminDraft = adminDrafts[item.id];
            const myInterest = item.myInterest;
            const hasProject = myInterest?.projectId && myInterest.status === 'working';
            const canTake = !myInterest && OPEN_BOARD_STATUSES.includes(item.status);
            const canCreateProject =
              myInterest && myInterest.status === 'interested' && !myInterest.projectId;
            const showAdmin = isAdmin && moderationMode && adminItem && adminDraft;

            return (
              <article key={item.id} class="translation-request-card request-board-card">
                <div class="request-board-card-header">
                  <h2 class="translation-request-card-title">{item.title}</h2>
                  <span
                    class={`translation-request-status translation-request-status--${item.status}`}
                  >
                    {t(`requestBoard.statusAuthor.${item.status}`)}
                  </span>
                </div>

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
                <p class="translation-request-card-meta">
                  {formatRequestDate(item.createdAt, i18n.language)}
                </p>
                {item.comment && (
                  <p class="translation-request-card-comment" title={item.comment}>
                    {item.comment}
                  </p>
                )}
                {item.sourceUrl && (
                  <p class="translation-request-card-meta">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="request-board-source-link"
                    >
                      <Icon name="open_in_new" size="sm" /> {t('requestBoard.sourceLink')}
                    </a>
                  </p>
                )}

                {item.interestCount > 0 && (
                  <div class="request-board-translators">
                    <span class="request-board-translators-label">
                      {t('requestBoard.translators', { count: item.interestCount })}
                    </span>
                    <div class="request-board-translator-chips">
                      {item.interests.map((interest) => (
                        <span key={interest.id} class="request-board-translator-chip">
                          {interest.translatorName || t('requestBoard.unknownTranslator')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div class="request-board-card-actions">
                  {canTake && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setPickerRequestId(item.id)}
                      loading={interestLoadingId === item.id}
                    >
                      {t('requestBoard.takeWork')}
                    </Button>
                  )}
                  {canCreateProject && (
                    <Button variant="primary" size="sm" onClick={() => openCreateProject(item)}>
                      {t('requestBoard.createProject')}
                    </Button>
                  )}
                  {hasProject && myInterest?.projectId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => route(`/projects/${myInterest.projectId}`)}
                    >
                      {t('requestBoard.openProject')}
                    </Button>
                  )}
                  {myInterest && myInterest.status !== 'withdrawn' && (
                    <Button variant="secondary" size="sm" onClick={() => setWithdrawTarget(item)}>
                      {t('requestBoard.withdraw')}
                    </Button>
                  )}
                </div>

                {showAdmin && (
                  <div class="request-board-admin-panel">
                    <p class="request-board-admin-meta">
                      {t('admin.translationRequests.userEmail')}: {adminItem.userEmail || '—'}
                    </p>
                    <div class="admin-translation-request-actions">
                      <Select
                        label={t('admin.translationRequests.statusLabel')}
                        options={statusEditOptions}
                        value={adminDraft.status}
                        onChange={(e) =>
                          updateAdminDraft(item.id, {
                            status: (e.target as HTMLSelectElement)
                              .value as CatalogTranslationRequestStatus,
                          })
                        }
                      />
                      <Input
                        label={t('admin.translationRequests.linkedPublication')}
                        placeholder={t('admin.translationRequests.linkedPublicationPlaceholder')}
                        value={adminDraft.linkedPublicationId}
                        onInput={(e) =>
                          updateAdminDraft(item.id, {
                            linkedPublicationId: (e.target as HTMLInputElement).value,
                          })
                        }
                      />
                      <div class="form-group admin-translation-request-notes">
                        <label class="form-label" for={`board-admin-notes-${item.id}`}>
                          {t('admin.translationRequests.adminNotes')}
                        </label>
                        <textarea
                          id={`board-admin-notes-${item.id}`}
                          class="form-input translation-request-form-comment"
                          value={adminDraft.adminNotes}
                          onInput={(e) =>
                            updateAdminDraft(item.id, {
                              adminNotes: (e.target as HTMLTextAreaElement).value,
                            })
                          }
                        />
                      </div>
                      <div class="request-board-admin-buttons">
                        {REJECTABLE_STATUSES.includes(adminItem.status) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleAdminReject(item.id)}
                            loading={rejectingId === item.id}
                          >
                            {t('admin.translationRequests.reject')}
                          </Button>
                        )}
                        {DELETABLE_STATUSES.includes(adminItem.status) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeleting(adminItem)}
                          >
                            {t('admin.translationRequests.delete')}
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleAdminSave(item.id)}
                          loading={savingId === item.id}
                        >
                          {t('common.save')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {isAdmin && moderationMode && showClosedForAdmin && closedAdminRequests.length > 0 && (
        <section class="request-board-closed-section">
          <h2 class="request-board-closed-title">{t('requestBoard.closedSection')}</h2>
          <div class="translation-requests-list request-board-list">
            {closedAdminRequests.map((item) => (
              <article key={item.id} class="translation-request-card request-board-card">
                <div class="request-board-card-header">
                  <h2 class="translation-request-card-title">{item.title}</h2>
                  <span
                    class={`translation-request-status translation-request-status--${item.status}`}
                  >
                    {t(`translationRequests.status.${item.status}`)}
                  </span>
                </div>
                <p class="request-board-admin-meta">
                  {t('admin.translationRequests.userEmail')}: {item.userEmail || '—'}
                </p>
                <div class="request-board-admin-buttons">
                  {DELETABLE_STATUSES.includes(item.status) && (
                    <Button variant="secondary" size="sm" onClick={() => setDeleting(item)}>
                      {t('admin.translationRequests.delete')}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <SuggestTranslationModal
        isOpen={showSuggestModal}
        onClose={() => setShowSuggestModal(false)}
        onSuccess={() => {
          setSuccess(t('translationRequests.created'));
          reload();
        }}
      />

      <EntityPickerModal
        isOpen={pickerRequestId != null}
        onClose={() => setPickerRequestId(null)}
        kind="translator"
        mode="single"
        onSelect={handleTranslatorPick}
      />

      <Modal
        isOpen={createProjectTarget != null}
        onClose={() => setCreateProjectTarget(null)}
        title={t('requestBoard.createProjectTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateProjectTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateProject}
              loading={creatingProject}
              disabled={!projectName.trim()}
            >
              {t('requestBoard.createProjectConfirm')}
            </Button>
          </>
        }
      >
        <p class="request-board-create-hint">{t('requestBoard.createProjectHint')}</p>
        <Input
          label={t('project.projectName')}
          value={projectName}
          onInput={(e) => setProjectName((e.target as HTMLInputElement).value)}
        />
        <ProjectLanguagePairFields
          idPrefix="board-project"
          sourceLanguage={projectSourceLanguage}
          targetLanguage={projectTargetLanguage}
          onSourceLanguageChange={() => {}}
          onTargetLanguageChange={() => {}}
          sourceDisabled
          targetDisabled
        />
      </Modal>

      <ConfirmModal
        isOpen={withdrawTarget != null}
        onClose={() => setWithdrawTarget(null)}
        onConfirm={handleWithdraw}
        title={t('requestBoard.withdrawTitle')}
        message={
          withdrawTarget ? t('requestBoard.withdrawMessage', { title: withdrawTarget.title }) : ''
        }
        confirmLabel={t('requestBoard.withdrawConfirm')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={withdrawLoading}
      />

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleAdminDelete}
        title={t('admin.translationRequests.deleteTitle')}
        message={
          deleting ? t('admin.translationRequests.deleteMessage', { title: deleting.title }) : ''
        }
        confirmLabel={t('admin.translationRequests.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={deleteLoading}
      />

      <AlertModal
        isOpen={limitModal != null}
        onClose={() => setLimitModal(null)}
        title={t('projectLimit.title')}
        message={
          limitModal
            ? t('projectLimit.message', {
                limit: limitModal.limit,
                current: limitModal.current,
              })
            : ''
        }
      />
    </div>
  );
}
