import { useState, useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import { useTranslation, Trans } from 'react-i18next';
import type {
  Project,
  ProjectWithChapterList,
  ChapterSummary,
  TranslationStageKind,
  ProjectSettings,
} from '../../types';
import { Button, Modal, Icon, AlertModal } from '../ui';
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
import { normalizeEditingFocus, type EditingFocus } from '../../../shared/editing-focus.js';
import { useBatchChapterTranslation } from '../../hooks/useBatchChapterTranslation';
import { TokenLimitWarning } from '../TokenUsage';
import { ChapterPickerPanel } from '../Project/ChapterPickerPanel';
import { BatchStageOptions, BATCH_STAGE_ORDER } from './BatchStageOptions';
import { BatchTranslationProgressModal } from './BatchTranslationProgressModal';
import {
  computeChapterPickerStats,
  filterChaptersByStatus,
  hasLastAnalysis,
  type StatusFilter,
} from '../Project/chapterPickerShared';
import './ProcessChapters.css';

const DEFAULT_PICKER_PAGE_SIZE = 20;

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
  const [pickerResetKey, setPickerResetKey] = useState(0);
  const [pickerInitialStatusFilter, setPickerInitialStatusFilter] = useState<StatusFilter>('all');
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

  const allChaptersSorted = useMemo(
    () =>
      [
        ...(summary && (summary.length > 0 || project.chapters.length === 0)
          ? summary
          : project.chapters),
      ].sort((a, b) => a.number - b.number),
    [summary, project.chapters]
  );

  const stats = useMemo(() => computeChapterPickerStats(allChaptersSorted), [allChaptersSorted]);

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
        const filtered = filterChaptersByStatus(
          allChaptersSorted,
          defaultStatusFilter,
          hasLastAnalysis
        );
        const toSelect =
          filtered.length > DEFAULT_PICKER_PAGE_SIZE
            ? filtered.slice(0, DEFAULT_PICKER_PAGE_SIZE)
            : filtered;
        setTranslateSelectionIds(toSelect.map((c) => c.id));
        setPickerInitialStatusFilter(defaultStatusFilter);
        setPickerResetKey((k) => k + 1);
        translateModalWasOpenRef.current = true;
      }
    } else {
      translateModalWasOpenRef.current = false;
    }
  }, [showTranslateAllModal, allChaptersSorted, defaultStatusFilter]);

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
        'default' | 'literary' | 'minimal' | 'ai_revivification';
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
        <ChapterPickerPanel
          chapters={allChaptersSorted}
          selectedIds={translateSelectionIds}
          onSelectedIdsChange={setTranslateSelectionIds}
          loading={modalDataRefreshing}
          resetKey={pickerResetKey}
          initialStatusFilter={pickerInitialStatusFilter}
        />
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
        <BatchStageOptions
          batchSelectedStages={batchSelectedStages}
          onToggleStage={toggleBatchStage}
          batchTranslateChapterTitles={batchTranslateChapterTitles}
          onBatchTranslateChapterTitlesChange={setBatchTranslateChapterTitles}
          includeGlossaryInEditing={includeGlossaryInEditing}
          onToggleIncludeGlossaryInEditing={handleToggleIncludeGlossaryInEditing}
          editingFocus={editingFocus}
          onEditingFocusChange={handleEditingFocusChange}
          editingStylePreset={editingStylePreset}
          onEditingStylePresetChange={handleEditingStylePresetChange}
        />
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

      <BatchTranslationProgressModal
        progress={translationProgress}
        cancelling={cancelling}
        onClose={handleCloseTranslation}
        onCancel={handleCancelTranslation}
      />

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
