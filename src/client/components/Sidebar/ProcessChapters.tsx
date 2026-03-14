import { useState, useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import { useTranslation, Trans } from 'react-i18next';
import type {
  Project,
  ProjectWithChapterList,
  ChapterSummary,
  TranslationStageKind,
} from '../../types';
import { Button, Modal, Icon } from '../ui';
import { api } from '../../api/client';
import { useTokenEstimate } from '../../hooks/useTokenEstimate';
import { useBatchChapterTranslation } from '../../hooks/useBatchChapterTranslation';
import { TokenLimitWarning } from '../TokenUsage';
import '../ChapterView/ReaderSettings.css';
import '../ChapterView/ChapterHeader.css';

const BATCH_STAGE_ORDER: TranslationStageKind[] = ['analysis', 'translation', 'editing'];

interface ProcessChaptersProps {
  project: Project | ProjectWithChapterList;
  onRefreshProject: () => Promise<void>;
}

function isChapterEmptyFromSummary(chapter: ChapterSummary): boolean {
  return !chapter.hasTranslation;
}

export function ProcessChapters({ project, onRefreshProject }: ProcessChaptersProps) {
  const { t } = useTranslation();
  const [showTranslateAllModal, setShowTranslateAllModal] = useState(false);
  const [translateSelectionIds, setTranslateSelectionIds] = useState<string[]>([]);
  const [batchSelectedStages, setBatchSelectedStages] = useState<TranslationStageKind[]>([
    'analysis',
    'translation',
    'editing',
  ]);
  const [cancelling, setCancelling] = useState(false);
  const [summary, setSummary] = useState<ChapterSummary[] | null>(null);
  const translateModalWasOpenRef = useRef(false);

  useEffect(() => {
    api
      .getChaptersSummary(project.id)
      .then(setSummary)
      // Keep fallback to project.chapters when summary endpoint is temporarily unavailable.
      .catch(() => setSummary(null));
  }, [project.id, project.chapters.length, project.updatedAt]);

  const estimate = useTokenEstimate();
  const batch = useBatchChapterTranslation(project.id, project, onRefreshProject);
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
              (c as { status: string }).status === 'draft',
          };
    return {
      chapters: chapters.length,
      translated: chapters.filter((c) => (c as ChapterSummary).status === 'completed').length,
      draft: chapters.filter((c) => (c as ChapterSummary).status === 'draft').length,
      analyzed: chapters.filter((c) => (c as ChapterSummary).status === 'analyzed').length,
      error: chapters.filter((c) => (c as ChapterSummary).status === 'error').length,
      empty: chapters.filter((c) => !toSummary(c).hasTranslation).length,
    };
  }, [summary, project.chapters]);

  const allChaptersSorted = useMemo(
    () =>
      [
        ...(
          summary && (summary.length > 0 || project.chapters.length === 0) ? summary : project.chapters
        ),
      ].sort((a, b) => a.number - b.number),
    [summary, project.chapters]
  );

  const defaultSelectionIds = useMemo(
    () =>
      (summary && (summary.length > 0 || project.chapters.length === 0) ? summary : project.chapters)
        .filter(
          (c) =>
            (c as ChapterSummary).status === 'error' ||
            isChapterEmptyFromSummary(c as ChapterSummary)
        )
        .map((c) => c.id),
    [summary, project.chapters]
  );

  const selectedChaptersForTranslate = useMemo(() => {
    const idSet = new Set(translateSelectionIds);
    return allChaptersSorted.filter((c) => idSet.has(c.id));
  }, [allChaptersSorted, translateSelectionIds]);

  const getChapterTextLength = useCallback(
    (ch: {
      originalText?: string;
      paragraphs?: Array<{ originalText?: string }>;
      paragraphCount?: number;
    }) => {
      const direct = (ch.originalText || '').trim().length;
      if (direct > 0) return direct;
      const fromParagraphs = (ch.paragraphs || []).reduce(
        (s, p) => s + (p.originalText || '').length,
        0
      );
      if (fromParagraphs > 0) return fromParagraphs;
      return ((ch as { paragraphCount?: number }).paragraphCount ?? 0) * 150;
    },
    []
  );

  const estimatedTokensSelected = useMemo(() => {
    const totalLength = selectedChaptersForTranslate.reduce(
      (sum, ch) => sum + getChapterTextLength(ch),
      0
    );
    return estimate(totalLength, batchSelectedStages);
  }, [selectedChaptersForTranslate, batchSelectedStages, estimate, getChapterTextLength]);

  useEffect(() => {
    if (showTranslateAllModal) {
      if (!translateModalWasOpenRef.current) {
        setTranslateSelectionIds(
          defaultSelectionIds.length > 0 ? defaultSelectionIds : allChaptersSorted.map((c) => c.id)
        );
        translateModalWasOpenRef.current = true;
      }
    } else {
      translateModalWasOpenRef.current = false;
    }
  }, [showTranslateAllModal, defaultSelectionIds, allChaptersSorted]);

  const toggleBatchStage = useCallback((stage: TranslationStageKind) => {
    setBatchSelectedStages((prev) =>
      prev.includes(stage)
        ? prev.filter((s) => s !== stage)
        : [...prev, stage].sort(
            (a, b) => BATCH_STAGE_ORDER.indexOf(a) - BATCH_STAGE_ORDER.indexOf(b)
          )
    );
  }, []);

  const handleTranslateAll = useCallback(() => {
    if (selectedChaptersForTranslate.length === 0) {
      alert(t('projectInfo.selectOneChapter'));
      return;
    }
    if (batchSelectedStages.length === 0) return;
    setShowTranslateAllModal(false);
    batch.startBatch(selectedChaptersForTranslate, { stages: batchSelectedStages });
  }, [selectedChaptersForTranslate, batchSelectedStages, batch, t]);

  const handleMarkAsTranslatedBatch = useCallback(() => {
    if (selectedChaptersForTranslate.length === 0) {
      alert(t('projectInfo.selectOneChapter'));
      return;
    }
    setShowTranslateAllModal(false);
    batch.startMarkAsTranslatedBatch(selectedChaptersForTranslate);
  }, [selectedChaptersForTranslate, batch, t]);

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
        <Icon name="auto_awesome" size="sm" /> {t('projectInfo.processChapters', 'Обработать главы')}
      </Button>

      <Modal
        isOpen={showTranslateAllModal}
        onClose={() => setShowTranslateAllModal(false)}
        title={t('projectInfo.processChaptersModalTitle', 'Обработать главы')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowTranslateAllModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleMarkAsTranslatedBatch}
              disabled={selectedChaptersForTranslate.length === 0}
              title={t('markAsTranslated.batchTitle', 'Пометить выбранные главы как переведённые')}
            >
              <Icon name="done_all" size="sm" />{' '}
              {t(
                'markAsTranslated.batchButton',
                {
                  count: selectedChaptersForTranslate.length,
                },
                `Пометить (${selectedChaptersForTranslate.length})`
              )}
            </Button>
            <Button
              onClick={handleTranslateAll}
              disabled={
                selectedChaptersForTranslate.length === 0 || batchSelectedStages.length === 0
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
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          {t('projectInfo.chooseChaptersHint')}
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '0.75rem',
            fontSize: '0.85rem',
          }}
        >
          <button
            type="button"
            onClick={() => setTranslateSelectionIds(allChaptersSorted.map((c) => c.id))}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              padding: '0.25rem 0',
              textDecoration: 'underline',
            }}
          >
            {t('chapter.selectAll')}
          </button>
          <button
            type="button"
            onClick={() => setTranslateSelectionIds([])}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '0.25rem 0',
              textDecoration: 'underline',
            }}
          >
            {t('chapter.deselectAll')}
          </button>
          <span style={{ color: 'var(--border)', margin: '0 0.25rem' }}>|</span>
          <button
            type="button"
            onClick={() =>
              setTranslateSelectionIds(
                (summary ?? project.chapters)
                  .filter((c) => !(c as ChapterSummary).hasTranslation)
                  .map((c) => c.id)
              )
            }
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '0.25rem 0',
              textDecoration: 'underline',
            }}
          >
            {t('projectInfo.presetEmpty', { count: stats.empty }, 'Пустые ({{count}})')}
          </button>
          {stats.error > 0 && (
            <button
              type="button"
              onClick={() =>
                setTranslateSelectionIds(
                  (summary ?? project.chapters)
                    .filter((c) => (c as ChapterSummary).status === 'error')
                    .map((c) => c.id)
                )
              }
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--error)',
                cursor: 'pointer',
                padding: '0.25rem 0',
                textDecoration: 'underline',
              }}
            >
              {t('projectInfo.presetErrors', { count: stats.error }, 'С ошибками ({{count}})')}
            </button>
          )}
          {stats.translated > 0 && (
            <button
              type="button"
              onClick={() =>
                setTranslateSelectionIds(
                  (summary ?? project.chapters)
                    .filter((c) => (c as ChapterSummary).status === 'completed')
                    .map((c) => c.id)
                )
              }
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '0.25rem 0',
                textDecoration: 'underline',
              }}
            >
              {t(
                'projectInfo.presetTranslated',
                {
                  count: stats.translated,
                },
                'Переведённые ({{count}})'
              )}
            </button>
          )}
          {stats.draft > 0 && (
            <button
              type="button"
              onClick={() =>
                setTranslateSelectionIds(
                  project.chapters.filter((c) => c.status === 'draft').map((c) => c.id)
                )
              }
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                padding: '0.25rem 0',
                textDecoration: 'underline',
              }}
            >
              {t('projectInfo.presetDraft', { count: stats.draft }, 'Черновики ({{count}})')}
            </button>
          )}
          {stats.analyzed > 0 && (
            <button
              type="button"
              onClick={() =>
                setTranslateSelectionIds(
                  project.chapters.filter((c) => c.status === 'analyzed').map((c) => c.id)
                )
              }
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                padding: '0.25rem 0',
                textDecoration: 'underline',
              }}
            >
              {t(
                'projectInfo.presetAnalyzed',
                { count: stats.analyzed },
                'Только анализ ({{count}})'
              )}
            </button>
          )}
          {(() => {
            const notAnalyzedCount = project.chapters.filter(
              (c) => !c.translationMeta?.lastAnalysisAt
            ).length;
            return notAnalyzedCount > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setTranslateSelectionIds(
                    project.chapters
                      .filter((c) => !c.translationMeta?.lastAnalysisAt)
                      .map((c) => c.id)
                  )
                }
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  padding: '0.25rem 0',
                  textDecoration: 'underline',
                }}
              >
                {t(
                  'projectInfo.presetNotAnalyzed',
                  {
                    count: notAnalyzedCount,
                  },
                  'Не проанализированные ({{count}})'
                )}
              </button>
            ) : null;
          })()}
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
          {allChaptersSorted.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
              {t('projectInfo.noChaptersInProject')}
            </div>
          ) : (
            allChaptersSorted.map((chapter, index) => {
              const checked = translateSelectionIds.includes(chapter.id);
              const isLast = index === allChaptersSorted.length - 1;
              const isEmpty = !(chapter as ChapterSummary).hasTranslation;
              const isError = chapter.status === 'error';
              const isCompleted = chapter.status === 'completed';
              const isDraft = chapter.status === 'draft';
              const isAnalyzed = chapter.status === 'analyzed';
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
                    {chapter.title}
                  </span>
                  {(isEmpty || isError || isCompleted || isDraft || isAnalyzed) && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '4px',
                        background: isError
                          ? 'var(--error)'
                          : isCompleted
                            ? 'var(--success)'
                            : isDraft
                              ? 'var(--accent-muted, rgba(139, 92, 246, 0.25))'
                              : isAnalyzed
                                ? 'var(--accent-muted, rgba(139, 92, 246, 0.25))'
                                : 'var(--text-dim)',
                        color:
                          isError || isCompleted
                            ? 'white'
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
                                <Icon name="menu_book" size="sm" /> +{currentChapterProgress.glossaryEntries}{' '}
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
                        <Icon name="schedule" size="sm" /> {(computedTotalDuration / 1000).toFixed(1)}{' '}
                        {t('projectInfo.timeSeconds')}
                      </span>
                    )}
                    <span>
                      <Icon name="toll" size="sm" /> {t('projectInfo.totalShort')}{' '}
                      {computedTotalTokens.toLocaleString()}{' '}
                      {t('projectInfo.tokensCount')}
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
    </>
  );
}
