import { useState, useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import { useTranslation, Trans } from 'react-i18next';
import type {
  Project,
  ProjectWithChapterList,
  ChapterSummary,
  TranslationStageKind,
  ProjectSettings,
} from '../../types';
import { Button, Modal, Icon, Input, AlertModal, LoadingSpinner } from '../ui';
import { ProjectLanguagePairFields } from '../Project/ProjectLanguagePairFields';
import {
  projectDefaultLanguagePair,
  type LanguagePairValue,
  type ProjectSourceLanguage,
  type ProjectTargetLanguage,
} from '../../constants/translationLanguages';
import {
  getLanguageOverrideWarnings,
  toLanguagePairOverride,
} from '../../utils/languagePairOverride';
import { api } from '../../api/client';
import { estimateBatchTranslationTokensForProject } from '../../config/tokenEstimate';
import { chapterDisplayTitle } from '../../../shared/chapterTitle';
import { normalizeEditingFocus, type EditingFocus } from '../../../shared/editing-focus.js';
import { useBatchChapterTranslation } from '../../hooks/useBatchChapterTranslation';
import { TokenLimitWarning } from '../TokenUsage';
import '../ChapterView/ReaderSettings.css';
import '../ChapterView/ChapterHeader.css';
import './ProcessChapters.css';

const BATCH_STAGE_ORDER: TranslationStageKind[] = ['analysis', 'translation', 'editing'];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

type StatusFilter =
  | 'all'
  | 'empty'
  | 'error'
  | 'completed'
  | 'partial'
  | 'draft'
  | 'analyzed'
  | 'not_analyzed';

interface ProcessChaptersProps {
  project: Project | ProjectWithChapterList;
  onRefreshProject: () => Promise<void>;
  /** Called when settings are updated (e.g. from inline editing block) */
  onSettingsChange?: (settings: ProjectSettings) => void;
  /** Opens full project settings modal */
  onOpenSettings?: () => void;
  /** Called when user starts a batch (triggers JobsPanel to fetch immediately) */
  onBatchStarted?: () => void;
  /** Called when async batch job is created on server (triggers JobsPanel to fetch when job exists) */
  onBatchJobCreated?: () => void;
}

function presetButtonStyle(filter: StatusFilter): Record<string, string> {
  const base = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    textDecoration: 'underline',
    borderRadius: '6px',
  };
  const color =
    filter === 'error'
      ? 'var(--error)'
      : filter === 'partial'
        ? 'var(--warning)'
        : filter === 'draft' || filter === 'analyzed' || filter === 'not_analyzed'
          ? 'var(--accent)'
          : 'var(--text-dim)';
  return { ...base, color };
}

function filterChaptersByStatus<
  T extends {
    id: string;
    number: number;
    title: string;
    status?: string;
    hasTranslation?: boolean;
    lastAnalysisAt?: string;
    translationMeta?: { lastAnalysisAt?: string };
  },
>(list: T[], statusFilter: StatusFilter, hasLastAnalysis: (c: T) => boolean): T[] {
  if (statusFilter === 'all') return list;
  return list.filter((c) => {
    const s = c as ChapterSummary;
    const hasTranslation =
      'hasTranslation' in s
        ? s.hasTranslation
        : s.status === 'completed' || s.status === 'draft' || s.status === 'partial';
    switch (statusFilter) {
      case 'empty':
        return !hasTranslation;
      case 'error':
        return s.status === 'error';
      case 'completed':
        return s.status === 'completed';
      case 'partial':
        return s.status === 'partial';
      case 'draft':
        return s.status === 'draft';
      case 'analyzed':
        return s.status === 'analyzed';
      case 'not_analyzed':
        return !hasLastAnalysis(c);
      default:
        return true;
    }
  });
}

export function ProcessChapters({
  project,
  onRefreshProject,
  onSettingsChange,
  onOpenSettings,
  onBatchStarted,
  onBatchJobCreated,
}: ProcessChaptersProps) {
  const { t } = useTranslation();
  const [showTranslateAllModal, setShowTranslateAllModal] = useState(false);
  const [translateSelectionIds, setTranslateSelectionIds] = useState<string[]>([]);
  const [batchSelectedStages, setBatchSelectedStages] = useState<TranslationStageKind[]>([
    'analysis',
    'translation',
    'editing',
  ]);
  const [batchLanguagePair, setBatchLanguagePair] = useState<LanguagePairValue>(() =>
    projectDefaultLanguagePair(project)
  );
  const [batchLanguageOverrideAck, setBatchLanguageOverrideAck] = useState(false);
  const [batchTranslateChapterTitles, setBatchTranslateChapterTitles] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [summary, setSummary] = useState<ChapterSummary[] | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [modalDataRefreshing, setModalDataRefreshing] = useState(false);
  const translateModalWasOpenRef = useRef(false);
  const prevModalOpenRef = useRef(false);

  // Fetch summary only when opening the modal (not on project load).
  // When modal is closed, stats use project.chapters as fallback.
  useEffect(() => {
    const justOpened = showTranslateAllModal && !prevModalOpenRef.current;
    prevModalOpenRef.current = showTranslateAllModal;

    if (showTranslateAllModal && justOpened) {
      setBatchLanguagePair(projectDefaultLanguagePair(project));
      setBatchLanguageOverrideAck(false);
      setModalDataRefreshing(true);
      Promise.all([onRefreshProject(), api.getChaptersSummary(project.id).catch(() => null)])
        .then(([, s]) => {
          setSummary(s);
        })
        .finally(() => {
          setModalDataRefreshing(false);
        });
    }
  }, [
    showTranslateAllModal,
    project.id,
    project.sourceLanguage,
    project.targetLanguage,
    onRefreshProject,
  ]);

  const batch = useBatchChapterTranslation(
    project.id,
    project,
    onRefreshProject,
    (title, msg) => setErrorModal({ title, message: msg }),
    onBatchJobCreated
  );
  const translationProgress = batch.progress;
  useEffect(() => {
    if (translationProgress === null) setCancelling(false);
  }, [translationProgress]);

  const stats = useMemo(() => {
    const chapters =
      summary && (summary.length > 0 || project.chapters.length === 0) ? summary : project.chapters;
    const toSummary = (
      c:
        | ChapterSummary
        | { id: string; number: number; title: string; status: string; hasTranslation?: boolean }
    ) =>
      'hasTranslation' in c
        ? c
        : {
            ...c,
            hasTranslation:
              (c as { status: string }).status === 'completed' ||
              (c as { status: string }).status === 'draft' ||
              (c as { status: string }).status === 'partial',
            isFullyTranslated: (c as { status: string }).status === 'completed',
            paragraphCount: 0,
            translatedParagraphCount: 0,
          };
    const notAnalyzedCount = chapters.filter(
      (c) =>
        !(c as { lastAnalysisAt?: string; translationMeta?: { lastAnalysisAt?: string } })
          .lastAnalysisAt &&
        !(c as { translationMeta?: { lastAnalysisAt?: string } }).translationMeta?.lastAnalysisAt
    ).length;
    return {
      chapters: chapters.length,
      translated: chapters.filter((c) => (c as ChapterSummary).status === 'completed').length,
      partial: chapters.filter((c) => (c as ChapterSummary).status === 'partial').length,
      draft: chapters.filter((c) => (c as ChapterSummary).status === 'draft').length,
      analyzed: chapters.filter((c) => (c as ChapterSummary).status === 'analyzed').length,
      error: chapters.filter((c) => (c as ChapterSummary).status === 'error').length,
      empty: chapters.filter((c) => !toSummary(c).hasTranslation).length,
      notAnalyzed: notAnalyzedCount,
    };
  }, [summary, project.chapters]);

  const allChaptersSorted = useMemo(
    () =>
      [
        ...(summary && (summary.length > 0 || project.chapters.length === 0)
          ? summary
          : project.chapters),
      ].sort((a, b) => a.number - b.number),
    [summary, project.chapters]
  );

  const hasLastAnalysis = useCallback(
    (c: { lastAnalysisAt?: string; translationMeta?: { lastAnalysisAt?: string } }) =>
      !!(
        c.lastAnalysisAt ??
        (c as { translationMeta?: { lastAnalysisAt?: string } }).translationMeta?.lastAnalysisAt
      ),
    []
  );

  const filteredChapters = useMemo(() => {
    let list = filterChaptersByStatus(allChaptersSorted, statusFilter, (c) =>
      hasLastAnalysis(
        c as { lastAnalysisAt?: string; translationMeta?: { lastAnalysisAt?: string } }
      )
    );
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) => String(c.number).includes(q) || (c.title || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allChaptersSorted, statusFilter, searchQuery, hasLastAnalysis]);

  const totalPages = Math.max(1, Math.ceil(filteredChapters.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const paginatedChapters = useMemo(
    () => filteredChapters.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [filteredChapters, clampedPage, pageSize]
  );

  useEffect(() => {
    setCurrentPage((p) => (p > totalPages ? totalPages : p));
  }, [totalPages]);

  const selectedChaptersForTranslate = useMemo(() => {
    const idSet = new Set(translateSelectionIds);
    return allChaptersSorted.filter((c) => idSet.has(c.id));
  }, [allChaptersSorted, translateSelectionIds]);

  const estimatedTokensSelected = useMemo(() => {
    return estimateBatchTranslationTokensForProject(project, selectedChaptersForTranslate, {
      stages: batchSelectedStages,
      translateChapterTitles: batchTranslateChapterTitles,
    });
  }, [project, selectedChaptersForTranslate, batchSelectedStages, batchTranslateChapterTitles]);

  const defaultStatusFilter = useMemo((): StatusFilter => {
    if (stats.error > 0) return 'error';
    if (stats.empty > 0) return 'empty';
    return 'all';
  }, [stats.error, stats.empty]);

  useEffect(() => {
    if (showTranslateAllModal) {
      if (!translateModalWasOpenRef.current) {
        const filtered = filterChaptersByStatus(allChaptersSorted, defaultStatusFilter, (c) =>
          hasLastAnalysis(
            c as { lastAnalysisAt?: string; translationMeta?: { lastAnalysisAt?: string } }
          )
        );
        const toSelect = filtered.length > pageSize ? filtered.slice(0, pageSize) : filtered;
        setTranslateSelectionIds(toSelect.map((c) => c.id));
        setStatusFilter(defaultStatusFilter);
        setCurrentPage(1);
        translateModalWasOpenRef.current = true;
      }
    } else {
      translateModalWasOpenRef.current = false;
    }
  }, [showTranslateAllModal, allChaptersSorted, defaultStatusFilter, pageSize, hasLastAnalysis]);

  const toggleBatchStage = useCallback((stage: TranslationStageKind) => {
    setBatchSelectedStages((prev) =>
      prev.includes(stage)
        ? prev.filter((s) => s !== stage)
        : [...prev, stage].sort(
            (a, b) => BATCH_STAGE_ORDER.indexOf(a) - BATCH_STAGE_ORDER.indexOf(b)
          )
    );
  }, []);

  const includeGlossaryInEditing = project.settings?.includeGlossaryInEditing ?? true;
  const editingStylePreset = project.settings?.editingStylePreset ?? 'default';
  const editingFocus = normalizeEditingFocus(project.settings?.editingFocus);

  const handleToggleIncludeGlossaryInEditing = useCallback(async () => {
    const updated = await api.updateSettings(project.id, {
      includeGlossaryInEditing: !includeGlossaryInEditing,
    });
    onSettingsChange?.(updated);
    if (!onSettingsChange) await onRefreshProject();
  }, [project.id, includeGlossaryInEditing, onSettingsChange, onRefreshProject]);

  const handleEditingStylePresetChange = useCallback(
    async (e: Event) => {
      const value = (e.target as HTMLSelectElement).value as
        | 'default'
        | 'literary'
        | 'minimal'
        | 'ai_revivification';
      const updated = await api.updateSettings(project.id, {
        editingStylePreset: value,
      });
      onSettingsChange?.(updated);
      if (!onSettingsChange) await onRefreshProject();
    },
    [project.id, onSettingsChange, onRefreshProject]
  );

  const handleEditingFocusChange = useCallback(
    async (e: Event) => {
      const value = (e.target as HTMLSelectElement).value as EditingFocus;
      const updated = await api.updateSettings(project.id, {
        editingFocus: value,
      });
      onSettingsChange?.(updated);
      if (!onSettingsChange) await onRefreshProject();
    },
    [project.id, onSettingsChange, onRefreshProject]
  );

  const projectDefaultPair = useMemo(
    () => projectDefaultLanguagePair(project),
    [project.sourceLanguage, project.targetLanguage, project.id]
  );
  const hasLanguageOverride = useMemo(
    () => toLanguagePairOverride(batchLanguagePair, project) !== undefined,
    [batchLanguagePair, project.sourceLanguage, project.targetLanguage]
  );
  const languageOverrideWarnings = useMemo(() => {
    const hasTranslatedAmongSelected = selectedChaptersForTranslate.some((c) => {
      const s = c as ChapterSummary;
      const hasTranslation =
        'hasTranslation' in s
          ? s.hasTranslation
          : s.status === 'completed' || s.status === 'draft' || s.status === 'partial';
      return hasTranslation;
    });
    return getLanguageOverrideWarnings({
      batchLanguagePair,
      project,
      selectedStages: batchSelectedStages,
      hasTranslatedContent: hasTranslatedAmongSelected,
      t,
    });
  }, [batchLanguagePair, project, batchSelectedStages, selectedChaptersForTranslate, t]);
  const needsLanguageOverrideAck = languageOverrideWarnings.length > 0;

  const batchLanguagePairOverride = useMemo(
    () => toLanguagePairOverride(batchLanguagePair, project),
    [batchLanguagePair, project.sourceLanguage, project.targetLanguage]
  );

  const handleTranslateAll = useCallback(() => {
    if (selectedChaptersForTranslate.length === 0) {
      setErrorModal({
        title: t('projectInfo.selectOneChapter'),
        message: t('projectInfo.selectOneChapter'),
      });
      return;
    }
    if (batchSelectedStages.length === 0) return;
    if (needsLanguageOverrideAck && !batchLanguageOverrideAck) return;
    setShowTranslateAllModal(false);
    batch.startBatch(selectedChaptersForTranslate, {
      stages: batchSelectedStages,
      languagePair: batchLanguagePairOverride,
      translateChapterTitles: batchTranslateChapterTitles,
    });
    onBatchStarted?.();
  }, [
    selectedChaptersForTranslate,
    batchSelectedStages,
    batch,
    onBatchStarted,
    t,
    needsLanguageOverrideAck,
    batchLanguageOverrideAck,
    batchLanguagePairOverride,
    batchTranslateChapterTitles,
  ]);

  const handleMarkAsTranslatedBatch = useCallback(() => {
    if (selectedChaptersForTranslate.length === 0) {
      setErrorModal({
        title: t('projectInfo.selectOneChapter'),
        message: t('projectInfo.selectOneChapter'),
      });
      return;
    }
    setShowTranslateAllModal(false);
    batch.startMarkAsTranslatedBatch(selectedChaptersForTranslate);
  }, [selectedChaptersForTranslate, batch, t]);

  const handleMarkEntireProjectAsTranslated = useCallback(() => {
    if (allChaptersSorted.length === 0) return;
    setShowTranslateAllModal(false);
    batch.startMarkAsTranslatedBatch(allChaptersSorted);
  }, [allChaptersSorted, batch]);

  const handleCancelTranslation = useCallback(() => {
    setCancelling(true);
    batch.cancel();
    batch.clearProgress();
  }, [batch]);

  const handleCloseTranslation = useCallback(() => {
    batch.clearProgress();
  }, [batch]);

  const isTranslationComplete =
    translationProgress !== null && translationProgress.current >= translationProgress.total;

  const selectedCompletedCount = selectedChaptersForTranslate.filter(
    (c) => c.status === 'completed'
  ).length;
  const overwriteWarning =
    batchSelectedStages.includes('translation') && selectedCompletedCount > 0;
  const showTokensInSummary =
    selectedChaptersForTranslate.length > 0 && batchSelectedStages.length > 0;

  const isOriginalReadingMode = project.settings?.originalReadingMode ?? false;
  const showButton = !isOriginalReadingMode && stats.chapters > 0;

  if (!showButton) return null;

  return (
    <>
      <Button
        variant="primary"
        size="full"
        className="sidebar-process-chapters"
        onClick={() => setShowTranslateAllModal(true)}
        disabled={translationProgress !== null}
      >
        <Icon name="auto_awesome" size="sm" />{' '}
        {t('projectInfo.processChapters', 'Обработать главы')}
      </Button>

      <Modal
        isOpen={showTranslateAllModal}
        onClose={() => setShowTranslateAllModal(false)}
        title={t('projectInfo.processChaptersModalTitle', 'Обработать главы')}
        headerActions={
          onOpenSettings ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenSettings}
              title={t('sidebar.projectSettings')}
              aria-label={t('sidebar.projectSettings')}
            >
              <Icon name="settings" size="sm" />
            </Button>
          ) : undefined
        }
        footer={
          <div class="process-chapters-footer">
            <div class="process-chapters-footer-left">
              <Button variant="secondary" onClick={() => setShowTranslateAllModal(false)}>
                {t('common.cancel')}
              </Button>
            </div>
            <div class="process-chapters-footer-right">
              <Button
                variant="secondary"
                onClick={handleMarkAsTranslatedBatch}
                disabled={selectedChaptersForTranslate.length === 0}
                title={t(
                  'markAsTranslated.batchTitle',
                  'Пометить выбранные главы как переведённые'
                )}
              >
                <Icon name="done_all" size="sm" />{' '}
                {t(
                  'markAsTranslated.batchButton',
                  {
                    count: selectedChaptersForTranslate.length,
                  },
                  `Пометить как переведённые (${selectedChaptersForTranslate.length})`
                )}
              </Button>
              <Button
                onClick={handleTranslateAll}
                disabled={
                  selectedChaptersForTranslate.length === 0 ||
                  batchSelectedStages.length === 0 ||
                  (needsLanguageOverrideAck && !batchLanguageOverrideAck)
                }
                title={
                  selectedChaptersForTranslate.length === 0
                    ? t('projectInfo.selectOneChapter')
                    : batchSelectedStages.length === 0
                      ? t('translationPanel.stagesMultiHint')
                      : undefined
                }
              >
                {t('projectInfo.translateSelectedCount', {
                  count: selectedChaptersForTranslate.length,
                })}
              </Button>
            </div>
          </div>
        }
      >
        {allChaptersSorted.length > 0 && (
          <div class="process-chapters-quick-block">
            <div class="process-chapters-quick-block-inner">
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {t('processChapters.uploadedTranslationHint', 'Загрузили готовый перевод?')}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMarkEntireProjectAsTranslated}
                disabled={allChaptersSorted.length === 0}
                title={t('processChapters.markEntireProject', 'Mark entire project as translated')}
              >
                <Icon name="done_all" size="sm" />{' '}
                {t('processChapters.markEntireProject', 'Mark entire project')}
              </Button>
            </div>
          </div>
        )}
        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          {t('projectInfo.chooseChaptersHint')}
        </p>
        <div class="process-chapters-selection-row">
          <div class="process-chapters-selection-actions">
            <button
              type="button"
              class="process-chapters-link-btn"
              onClick={() => setTranslateSelectionIds(filteredChapters.map((c) => c.id))}
            >
              {t('chapter.selectAll')}
            </button>
            <button
              type="button"
              class="process-chapters-link-btn process-chapters-link-btn-dim"
              onClick={() => setTranslateSelectionIds([])}
            >
              {t('chapter.deselectAll')}
            </button>
          </div>
          <span class="process-chapters-separator">|</span>
          <div class="process-chapters-filter-presets">
            <button
              type="button"
              class={statusFilter === 'all' ? 'process-chapters-preset-active' : ''}
              onClick={() => {
                setStatusFilter('all');
                setCurrentPage(1);
              }}
              style={presetButtonStyle('all')}
            >
              {t(
                'processChapters.filterAllWithCount',
                { count: stats.chapters },
                `All (${stats.chapters})`
              )}
            </button>
            <button
              type="button"
              class={statusFilter === 'empty' ? 'process-chapters-preset-active' : ''}
              onClick={() => {
                const chapters = (summary ?? project.chapters).filter(
                  (c) => !(c as ChapterSummary).hasTranslation
                );
                setStatusFilter('empty');
                setTranslateSelectionIds(chapters.map((c) => c.id));
                setCurrentPage(1);
              }}
              style={presetButtonStyle('empty')}
            >
              {t('projectInfo.presetEmpty', { count: stats.empty }, 'Пустые ({{count}})')}
            </button>
            {stats.error > 0 && (
              <button
                type="button"
                class={statusFilter === 'error' ? 'process-chapters-preset-active' : ''}
                onClick={() => {
                  const chapters = (summary ?? project.chapters).filter(
                    (c) => (c as ChapterSummary).status === 'error'
                  );
                  setStatusFilter('error');
                  setTranslateSelectionIds(chapters.map((c) => c.id));
                  setCurrentPage(1);
                }}
                style={presetButtonStyle('error')}
              >
                {t('projectInfo.presetErrors', { count: stats.error }, 'С ошибками ({{count}})')}
              </button>
            )}
            {stats.translated > 0 && (
              <button
                type="button"
                class={statusFilter === 'completed' ? 'process-chapters-preset-active' : ''}
                onClick={() => {
                  const chapters = (summary ?? project.chapters).filter(
                    (c) => (c as ChapterSummary).status === 'completed'
                  );
                  setStatusFilter('completed');
                  setTranslateSelectionIds(chapters.map((c) => c.id));
                  setCurrentPage(1);
                }}
                style={presetButtonStyle('completed')}
              >
                {t(
                  'projectInfo.presetTranslated',
                  { count: stats.translated },
                  'Переведённые ({{count}})'
                )}
              </button>
            )}
            {stats.partial > 0 && (
              <button
                type="button"
                class={statusFilter === 'partial' ? 'process-chapters-preset-active' : ''}
                onClick={() => {
                  const chapters = (summary ?? project.chapters).filter(
                    (c) => (c as ChapterSummary).status === 'partial'
                  );
                  setStatusFilter('partial');
                  setTranslateSelectionIds(chapters.map((c) => c.id));
                  setCurrentPage(1);
                }}
                style={presetButtonStyle('partial')}
              >
                {t('projectInfo.presetPartial', { count: stats.partial }, 'Неполные ({{count}})')}
              </button>
            )}
            {stats.draft > 0 && (
              <button
                type="button"
                class={statusFilter === 'draft' ? 'process-chapters-preset-active' : ''}
                onClick={() => {
                  const chapters = (summary ?? project.chapters).filter(
                    (c) => (c as ChapterSummary).status === 'draft'
                  );
                  setStatusFilter('draft');
                  setTranslateSelectionIds(chapters.map((c) => c.id));
                  setCurrentPage(1);
                }}
                style={presetButtonStyle('draft')}
              >
                {t('projectInfo.presetDraft', { count: stats.draft }, 'Черновики ({{count}})')}
              </button>
            )}
            {stats.analyzed > 0 && (
              <button
                type="button"
                class={statusFilter === 'analyzed' ? 'process-chapters-preset-active' : ''}
                onClick={() => {
                  const chapters = (summary ?? project.chapters).filter(
                    (c) => (c as ChapterSummary).status === 'analyzed'
                  );
                  setStatusFilter('analyzed');
                  setTranslateSelectionIds(chapters.map((c) => c.id));
                  setCurrentPage(1);
                }}
                style={presetButtonStyle('analyzed')}
              >
                {t(
                  'projectInfo.presetAnalyzed',
                  { count: stats.analyzed },
                  'Только анализ ({{count}})'
                )}
              </button>
            )}
            {stats.notAnalyzed > 0 && (
              <button
                type="button"
                class={statusFilter === 'not_analyzed' ? 'process-chapters-preset-active' : ''}
                onClick={() => {
                  const chapters = (summary ?? project.chapters).filter(
                    (c) =>
                      !hasLastAnalysis(
                        c as {
                          lastAnalysisAt?: string;
                          translationMeta?: { lastAnalysisAt?: string };
                        }
                      )
                  );
                  setStatusFilter('not_analyzed');
                  setTranslateSelectionIds(chapters.map((c) => c.id));
                  setCurrentPage(1);
                }}
                style={presetButtonStyle('not_analyzed')}
              >
                {t(
                  'projectInfo.presetNotAnalyzed',
                  { count: stats.notAnalyzed },
                  'Не проанализированные ({{count}})'
                )}
              </button>
            )}
          </div>
          {allChaptersSorted.length >= 100 && (
            <div class="process-chapters-search-wrap">
              <Input
                type="search"
                className="process-chapters-search"
                placeholder={t('processChapters.searchPlaceholder', 'Search by number or title')}
                value={searchQuery}
                onInput={(e) => {
                  setSearchQuery((e.target as HTMLInputElement).value);
                  setCurrentPage(1);
                }}
                aria-label={t('processChapters.searchPlaceholder', 'Search by number or title')}
              />
            </div>
          )}
        </div>
        <div class="process-chapters-pagination-row">
          <label class="process-chapters-per-page">
            {t('processChapters.perPage', 'Per page')}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number((e.target as HTMLSelectElement).value));
                setCurrentPage(1);
              }}
              class="process-chapters-per-page-select"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            class="process-chapters-select-displayed-btn"
            onClick={() => {
              const idsToAdd = paginatedChapters.map((c) => c.id);
              setTranslateSelectionIds((prev) => [...new Set([...prev, ...idsToAdd])]);
            }}
            disabled={paginatedChapters.length === 0}
          >
            {t(
              'processChapters.selectDisplayed',
              { count: paginatedChapters.length },
              `Select displayed (${paginatedChapters.length})`
            )}
          </button>
          {totalPages > 1 && (
            <span class="process-chapters-page-nav">
              <button
                type="button"
                class="process-chapters-nav-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
              >
                {t('chapter.prev', 'Previous')}
              </button>
              <span class="process-chapters-page-of">
                {t(
                  'processChapters.pageOf',
                  { current: clampedPage, total: totalPages },
                  'Page {{current}} of {{total}}'
                )}
              </span>
              <button
                type="button"
                class="process-chapters-nav-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
              >
                {t('chapter.next', 'Next')}
              </button>
            </span>
          )}
        </div>
        <div
          style={{
            maxHeight: '280px',
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-secondary)',
            marginBottom: '0.75rem',
          }}
        >
          {modalDataRefreshing ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '120px',
                padding: '1rem',
              }}
            >
              <LoadingSpinner size="sm" text={t('common.loading')} />
            </div>
          ) : allChaptersSorted.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
              {t('projectInfo.noChaptersInProject')}
            </div>
          ) : filteredChapters.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
              {t('chapterList.noResults', 'No results')}
            </div>
          ) : (
            paginatedChapters.map((chapter, index) => {
              const checked = translateSelectionIds.includes(chapter.id);
              const isLast = index === paginatedChapters.length - 1;
              const isEmpty = !(chapter as ChapterSummary).hasTranslation;
              const isError = chapter.status === 'error';
              const isCompleted = chapter.status === 'completed';
              const isPartial = chapter.status === 'partial';
              const isDraft = chapter.status === 'draft';
              const isAnalyzed = chapter.status === 'analyzed';
              const summaryChapter = chapter as ChapterSummary;
              const paragraphProgress =
                summaryChapter.paragraphCount > 0 &&
                summaryChapter.translatedParagraphCount < summaryChapter.paragraphCount
                  ? t('projectInfo.chapterParagraphProgress', {
                      translated: summaryChapter.translatedParagraphCount,
                      total: summaryChapter.paragraphCount,
                    })
                  : null;
              return (
                <label
                  key={chapter.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 0.75rem',
                    cursor: 'pointer',
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                    margin: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      e.stopPropagation();
                      setTranslateSelectionIds((prev) =>
                        prev.includes(chapter.id)
                          ? prev.filter((id) => id !== chapter.id)
                          : [...prev, chapter.id]
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <span
                    style={{
                      minWidth: '1.5rem',
                      fontSize: '0.85rem',
                      color: 'var(--text-dim)',
                    }}
                  >
                    {chapter.number}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {chapterDisplayTitle(chapter as ChapterSummary)}
                  </span>
                  {(isEmpty || isError || isCompleted || isPartial || isDraft || isAnalyzed) && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '4px',
                        background: isError
                          ? 'var(--error)'
                          : isCompleted
                            ? 'var(--success)'
                            : isPartial
                              ? 'var(--warning-muted, rgba(245, 158, 11, 0.25))'
                              : isDraft
                                ? 'var(--accent-muted, rgba(139, 92, 246, 0.25))'
                                : isAnalyzed
                                  ? 'var(--accent-muted, rgba(139, 92, 246, 0.25))'
                                  : 'var(--text-dim)',
                        color:
                          isError || isCompleted
                            ? 'white'
                            : isPartial
                              ? 'var(--warning)'
                              : isDraft || isAnalyzed
                                ? 'var(--accent)'
                                : 'var(--bg-secondary)',
                        flexShrink: 0,
                      }}
                      title={
                        isError
                          ? t('projectInfo.chapterStatusError')
                          : isCompleted
                            ? t('projectInfo.chapterStatusTranslated')
                            : isPartial
                              ? paragraphProgress
                                ? `${t('projectInfo.chapterStatusPartial')} (${paragraphProgress})`
                                : t('projectInfo.chapterStatusPartial')
                              : isDraft
                                ? t('projectInfo.chapterStatusDraft')
                                : isAnalyzed
                                  ? t('projectInfo.chapterStatusAnalyzed', 'Только анализ')
                                  : t('projectInfo.chapterStatusEmpty')
                      }
                    >
                      {isError ? (
                        <Icon name="error" size="sm" />
                      ) : isCompleted ? (
                        <Icon name="check" size="sm" />
                      ) : isPartial ? (
                        paragraphProgress || <Icon name="warning" size="sm" />
                      ) : isDraft ? (
                        <Icon name="edit_note" size="sm" />
                      ) : isAnalyzed ? (
                        <Icon name="manage_search" size="sm" />
                      ) : (
                        <Icon name="radio_button_unchecked" size="sm" />
                      )}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
        <div class="process-chapters-language-pair-block">
          <div class="process-chapters-language-pair-header">
            <span class="process-chapters-language-pair-label">
              {t('processChapters.languagePairLabel')}
            </span>
            {hasLanguageOverride && (
              <button
                type="button"
                class="process-chapters-link-btn"
                onClick={() => {
                  setBatchLanguagePair(projectDefaultPair);
                  setBatchLanguageOverrideAck(false);
                }}
              >
                {t('processChapters.useProjectLanguagePair')}
              </button>
            )}
          </div>
          <ProjectLanguagePairFields
            idPrefix="batch-process"
            compact
            sourceLanguage={batchLanguagePair.sourceLanguage}
            targetLanguage={batchLanguagePair.targetLanguage}
            onSourceLanguageChange={(value: ProjectSourceLanguage) => {
              setBatchLanguagePair((prev) => ({ ...prev, sourceLanguage: value }));
              setBatchLanguageOverrideAck(false);
            }}
            onTargetLanguageChange={(value: ProjectTargetLanguage) => {
              setBatchLanguagePair((prev) => ({ ...prev, targetLanguage: value }));
              setBatchLanguageOverrideAck(false);
            }}
          />
          {!hasLanguageOverride && (
            <p class="process-chapters-language-pair-hint">
              {t('processChapters.languagePairDefaultHint')}
            </p>
          )}
          {languageOverrideWarnings.map((warning) => (
            <p key={warning} class="process-chapters-language-override-warning" role="alert">
              {warning}
            </p>
          ))}
          {needsLanguageOverrideAck && (
            <label class="process-chapters-language-override-ack">
              <input
                type="checkbox"
                checked={batchLanguageOverrideAck}
                onChange={(e) =>
                  setBatchLanguageOverrideAck((e.target as HTMLInputElement).checked)
                }
              />
              {t('processChapters.languageOverrideAck')}
            </label>
          )}
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-dim)',
              marginBottom: '0.5rem',
            }}
          >
            {t('translationPanel.stages', 'Стадии')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {BATCH_STAGE_ORDER.map((stage) => {
              const checked = batchSelectedStages.includes(stage);
              const label =
                stage === 'analysis'
                  ? t('projectInfo.stageAnalysis', 'Анализ')
                  : stage === 'translation'
                    ? t('projectInfo.stageTranslation', 'Перевод')
                    : t('projectInfo.stageEditing', 'Редактура');
              const icon =
                stage === 'analysis' ? (
                  <Icon name="manage_search" size="sm" />
                ) : stage === 'translation' ? (
                  <Icon name="translate" size="sm" />
                ) : (
                  <Icon name="edit" size="sm" />
                );
              const title =
                stage === 'analysis'
                  ? t('translationPanel.stageAnalysisHint', 'Анализ, обновление глоссария')
                  : stage === 'translation'
                    ? t('translationPanel.stageTranslationHint', 'Перевод')
                    : t('translationPanel.stageEditingHint', 'Редактура текущего перевода');
              return (
                <label
                  key={stage}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                    background: checked
                      ? 'var(--accent-subtle, rgba(var(--accent-rgb), 0.1))'
                      : 'transparent',
                    cursor: 'pointer',
                    margin: 0,
                    fontSize: '0.9rem',
                  }}
                  title={title}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBatchStage(stage)}
                    style={{ marginRight: 0, accentColor: 'var(--accent)' }}
                  />
                  {icon} {label}
                </label>
              );
            })}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            {t('translationPanel.stagesMultiHint')}
          </span>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            marginBottom: '0.75rem',
            fontSize: '0.9rem',
            cursor: batchSelectedStages.includes('translation') ? 'pointer' : 'not-allowed',
            opacity: batchSelectedStages.includes('translation') ? 1 : 0.55,
          }}
        >
          <input
            type="checkbox"
            checked={batchTranslateChapterTitles}
            disabled={!batchSelectedStages.includes('translation')}
            onChange={(e) => setBatchTranslateChapterTitles((e.target as HTMLInputElement).checked)}
            style={{ marginTop: '0.2rem', accentColor: 'var(--accent)' }}
          />
          <span>
            {t('translationPanel.translateChapterTitles', 'Переводить названия глав')}
            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {t(
                'translationPanel.translateChapterTitlesHint',
                'Короткий перевод заголовка из оглавления (отдельно от текста главы)'
              )}
            </span>
          </span>
        </label>
        {batchSelectedStages.includes('editing') && (
          <div
            style={{
              marginBottom: '0.75rem',
              padding: '0.6rem 0.75rem',
              borderRadius: '8px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: 'var(--text-secondary)',
              }}
            >
              {t('projectInfo.editingSettingsLabel', 'Настройки редактуры')}
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
                marginBottom: '0.5rem',
              }}
            >
              <input
                type="checkbox"
                checked={includeGlossaryInEditing}
                onChange={handleToggleIncludeGlossaryInEditing}
                style={{
                  width: '18px',
                  height: '18px',
                  marginTop: '2px',
                  cursor: 'pointer',
                  accentColor: 'var(--accent)',
                }}
                aria-label={t('settings.includeGlossaryInEditing')}
              />
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                  {t('settings.includeGlossaryInEditing')}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {t('settings.includeGlossaryInEditingHint')}
                </div>
              </div>
            </label>
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  marginBottom: '0.35rem',
                }}
              >
                {t('settings.editingFocus')}
              </label>
              <select
                value={editingFocus}
                onChange={handleEditingFocusChange}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  marginBottom: '0.5rem',
                }}
              >
                <option value="fix_only">{t('settings.editingFocus.fix_only')}</option>
                <option value="polish">{t('settings.editingFocus.polish')}</option>
                <option value="elevate">{t('settings.editingFocus.elevate')}</option>
              </select>
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  marginBottom: '0.35rem',
                }}
              >
                {t('settings.editingStylePreset')}
              </label>
              <select
                value={editingStylePreset}
                onChange={handleEditingStylePresetChange}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="default">{t('settings.editingStylePreset.default')}</option>
                <option value="literary">{t('settings.editingStylePreset.literary')}</option>
                <option value="minimal">{t('settings.editingStylePreset.minimal')}</option>
                <option value="ai_revivification">
                  {t('settings.editingStylePreset.ai_revivification')}
                </option>
              </select>
            </div>
          </div>
        )}
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ marginBottom: overwriteWarning ? '0.5rem' : 0 }}>
            <Trans
              i18nKey="projectInfo.selectedChapters"
              values={{ count: selectedChaptersForTranslate.length }}
              components={{ strong: <strong style={{ color: 'var(--text-primary)' }} /> }}
            />
            {showTokensInSummary && (
              <>
                {' '}
                ·{' '}
                <Trans
                  i18nKey="projectInfo.approxTokens"
                  values={{
                    tokens:
                      estimatedTokensSelected > 0 ? estimatedTokensSelected.toLocaleString() : '—',
                  }}
                  components={{ strong: <strong style={{ color: 'var(--text-primary)' }} /> }}
                />{' '}
                · {t('projectInfo.checkApiLimit')}
              </>
            )}
          </div>
          {overwriteWarning && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
              <span style={{ flexShrink: 0 }}>
                <Icon name="warning" size="sm" />
              </span>
              <span>
                {t('projectInfo.warningOverwriteTranslated', {
                  count: selectedCompletedCount,
                })}
              </span>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={translationProgress !== null}
        onClose={isTranslationComplete ? handleCloseTranslation : handleCancelTranslation}
        title={t('projectInfo.translationProgressTitle')}
        className="translation-progress-modal"
        preventClose={!isTranslationComplete}
        footer={
          isTranslationComplete ? (
            <Button variant="primary" size="sm" onClick={handleCloseTranslation}>
              {t('common.close')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCancelTranslation}
              disabled={cancelling}
            >
              {cancelling ? t('chapter.cancellingTranslate') : t('chapter.cancelTranslate')}
            </Button>
          )
        }
      >
        {translationProgress && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>
                  {t('projectInfo.progressLabel', {
                    current: translationProgress.current,
                    total: translationProgress.total,
                  })}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {Math.round((translationProgress.current / translationProgress.total) * 100)}%
                </span>
              </div>
              <div
                class="progress-bar"
                style={{ width: '100%', height: '10px', marginBottom: '1rem' }}
              >
                <div
                  class="progress-fill"
                  style={{
                    width: `${(translationProgress.current / translationProgress.total) * 100}%`,
                    height: '100%',
                  }}
                />
              </div>
            </div>
            <div
              style={{
                marginBottom: '1.5rem',
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-dim)',
                  marginBottom: '0.5rem',
                }}
              >
                {t('projectInfo.translationStagesLabel')}
              </div>
              <div class="stages-grid" style={{ gap: '0.5rem' }}>
                <div class="stage-toggle active" style={{ cursor: 'default' }}>
                  <span class="stage-icon">
                    <Icon name="manage_search" size="sm" />
                  </span>
                  <span class="stage-name">{t('projectInfo.stageAnalysis')}</span>
                </div>
                <span class="stage-arrow">→</span>
                <div class="stage-toggle active" style={{ cursor: 'default' }}>
                  <span class="stage-icon">
                    <Icon name="translate" size="sm" />
                  </span>
                  <span class="stage-name">{t('projectInfo.stageTranslation')}</span>
                </div>
                <span class="stage-arrow">→</span>
                <div class="stage-toggle active" style={{ cursor: 'default' }}>
                  <span class="stage-icon">
                    <Icon name="edit" size="sm" />
                  </span>
                  <span class="stage-name">{t('projectInfo.stageEditing')}</span>
                </div>
              </div>
            </div>
            {translationProgress.currentChapter && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: 'var(--bg-hover)',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.9rem',
                    color: 'var(--text-dim)',
                    marginBottom: '0.5rem',
                  }}
                >
                  {t('projectInfo.currentChapterLabel')}
                </div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  {translationProgress.currentChapter}
                </div>
                {(() => {
                  const currentChapterProgress = translationProgress.chapters.find(
                    (ch) => ch.chapterId === translationProgress.currentChapterId
                  );
                  if (currentChapterProgress?.tokensUsed || currentChapterProgress?.duration) {
                    const tokensByStage = currentChapterProgress.tokensByStage;
                    const stageTokens: string[] = [];
                    if (tokensByStage) {
                      if (tokensByStage.analysis !== undefined && tokensByStage.analysis > 0) {
                        stageTokens.push(
                          `${t('projectInfo.stageAnalysis')}: ${tokensByStage.analysis.toLocaleString()}`
                        );
                      }
                      stageTokens.push(
                        `${t('projectInfo.stageTranslation')}: ${(tokensByStage.translation ?? 0).toLocaleString()}`
                      );
                      // Always show editing when we have stage breakdown (0 or value)
                      stageTokens.push(
                        `${t('projectInfo.stageEditing')}: ${(tokensByStage.editing ?? 0).toLocaleString()}`
                      );
                    }
                    return (
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: '1rem',
                            marginBottom: '0.25rem',
                          }}
                        >
                          {currentChapterProgress.duration && (
                            <span>
                              <Icon name="schedule" size="sm" />{' '}
                              {(currentChapterProgress.duration / 1000).toFixed(1)}{' '}
                              {t('projectInfo.timeSeconds')}
                            </span>
                          )}
                          {currentChapterProgress.tokensUsed && (
                            <span>
                              <Icon name="toll" size="sm" /> {t('projectInfo.totalShort')}{' '}
                              {currentChapterProgress.tokensUsed.toLocaleString()}
                            </span>
                          )}
                          {currentChapterProgress.glossaryEntries !== undefined &&
                            currentChapterProgress.glossaryEntries > 0 && (
                              <span>
                                <Icon name="menu_book" size="sm" /> +
                                {currentChapterProgress.glossaryEntries}{' '}
                                {t('projectInfo.inGlossaryShort')}
                              </span>
                            )}
                        </div>
                        {stageTokens.length > 0 && (
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-dim)',
                              marginTop: '0.25rem',
                            }}
                          >
                            {t('projectInfo.tokensByStages')} {stageTokens.join(' | ')}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
            {(() => {
              const computedTotalTokens = translationProgress.chapters.reduce(
                (s, ch) => s + (ch.tokensUsed ?? 0),
                0
              );
              const computedTotalDuration = translationProgress.chapters.reduce(
                (s, ch) => s + (ch.duration ?? 0),
                0
              );
              const computedTotalGlossary = translationProgress.chapters.reduce(
                (s, ch) => s + (ch.glossaryEntries ?? 0),
                0
              );
              const batchFinished = translationProgress.current >= translationProgress.total;
              const showStats =
                batchFinished ||
                computedTotalTokens > 0 ||
                computedTotalDuration > 0 ||
                computedTotalGlossary > 0;
              if (!showStats) return null;
              return (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                  }}
                >
                  <div
                    style={{
                      color: 'var(--text-dim)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {t('projectInfo.generalStats')}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {computedTotalDuration > 0 && (
                      <span>
                        <Icon name="schedule" size="sm" />{' '}
                        {(computedTotalDuration / 1000).toFixed(1)} {t('projectInfo.timeSeconds')}
                      </span>
                    )}
                    <span>
                      <Icon name="toll" size="sm" /> {t('projectInfo.totalShort')}{' '}
                      {computedTotalTokens.toLocaleString()} {t('projectInfo.tokensCount')}
                    </span>
                    {computedTotalGlossary > 0 && (
                      <span>
                        <Icon name="menu_book" size="sm" /> +{computedTotalGlossary}{' '}
                        {t('projectInfo.glossaryEntriesCount')}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const completedChapters = translationProgress.chapters.filter(
                      (ch) => ch.tokensByStage
                    );
                    if (completedChapters.length > 0) {
                      const totalByStage = completedChapters.reduce(
                        (acc, ch) => {
                          if (ch.tokensByStage) {
                            acc.analysis = (acc.analysis || 0) + (ch.tokensByStage.analysis || 0);
                            acc.translation = (acc.translation || 0) + ch.tokensByStage.translation;
                            acc.editing = (acc.editing || 0) + (ch.tokensByStage.editing || 0);
                          }
                          return acc;
                        },
                        {
                          analysis: 0,
                          translation: 0,
                          editing: 0,
                        } as {
                          analysis: number;
                          translation: number;
                          editing: number;
                        }
                      );
                      const stageTokens: string[] = [];
                      if (totalByStage.analysis > 0) {
                        stageTokens.push(
                          `${t('projectInfo.stageAnalysis')}: ${totalByStage.analysis.toLocaleString()}`
                        );
                      }
                      stageTokens.push(
                        `${t('projectInfo.stageTranslation')}: ${totalByStage.translation.toLocaleString()}`
                      );
                      // Always show editing in batch summary (0 or value)
                      stageTokens.push(
                        `${t('projectInfo.stageEditing')}: ${(totalByStage.editing ?? 0).toLocaleString()}`
                      );
                      return (
                        <div
                          style={{
                            fontSize: '0.85rem',
                            color: 'var(--text-dim)',
                            marginTop: '0.5rem',
                            paddingTop: '0.5rem',
                            borderTop: '1px solid var(--border)',
                          }}
                        >
                          {t('projectInfo.tokensByStages')} {stageTokens.join(' | ')}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              );
            })()}
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                fontSize: '0.9rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ color: 'var(--success)' }}>
                <Icon name="check_circle" size="sm" />{' '}
                {t('projectInfo.completedCount', { count: translationProgress.completed })}
              </div>
              {translationProgress.errors > 0 && (
                <div style={{ color: 'var(--error)' }}>
                  <Icon name="error" size="sm" />{' '}
                  {t('projectInfo.errorsCount', { count: translationProgress.errors })}
                </div>
              )}
              {translationProgress.skipped > 0 && (
                <div style={{ color: 'var(--text-dim)' }}>
                  <Icon name="skip_next" size="sm" />{' '}
                  {t('projectInfo.skippedCount', { count: translationProgress.skipped })}
                </div>
              )}
            </div>
            {(() => {
              const issues = translationProgress.chapters.filter(
                (ch) => ch.status === 'error' || ch.status === 'skipped'
              );
              if (issues.length === 0) return null;
              return (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                    {t('projectInfo.batchIssuesTitle', 'Проблемные главы')}
                  </div>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.85rem' }}>
                    {issues.map((issue) => (
                      <div
                        key={issue.chapterId}
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          marginBottom: '0.4rem',
                          color: issue.status === 'error' ? 'var(--error)' : 'var(--text-dim)',
                        }}
                      >
                        <span>
                          {issue.status === 'error' ? (
                            <Icon name="error" size="sm" />
                          ) : (
                            <Icon name="skip_next" size="sm" />
                          )}
                        </span>
                        <span style={{ flex: 1 }}>
                          {issue.title}
                          {issue.reason ? ` — ${issue.reason}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {batch.tokenUsage && batch.warningState.isOpen && (
        <TokenLimitWarning
          isOpen={batch.warningState.isOpen}
          onClose={batch.closeWarning}
          onConfirm={batch.confirmAndProceed}
          usage={batch.tokenUsage}
          estimatedTokens={batch.warningState.estimatedTokens}
        />
      )}

      <AlertModal
        isOpen={!!errorModal}
        onClose={() => setErrorModal(null)}
        title={errorModal?.title ?? ''}
        message={errorModal?.message ?? ''}
      />
    </>
  );
}
