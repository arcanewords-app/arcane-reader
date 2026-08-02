import { useTranslation } from 'react-i18next';
import { Button, Modal, Icon } from '../ui';
import { formatMarkTranslatedBatchReason } from '../../hooks/markTranslatedBatchProgress';
import type { BatchProgress } from '../../hooks/useBatchChapterTranslation';
import '../ChapterView/ChapterHeader.css';
import './ProcessChapters.css';

export interface BatchTranslationProgressModalProps {
  progress: BatchProgress | null;
  cancelling: boolean;
  onClose: () => void;
  onCancel: () => void;
}

export function BatchTranslationProgressModal({
  progress,
  cancelling,
  onClose,
  onCancel,
}: BatchTranslationProgressModalProps) {
  const { t } = useTranslation();

  const isTranslationComplete = progress !== null && progress.current >= progress.total;
  const isMarkTranslatedBatch = progress?.mode === 'mark-translated';

  return (
    <Modal
      isOpen={progress !== null}
      onClose={isTranslationComplete ? onClose : onCancel}
      title={
        isMarkTranslatedBatch
          ? t('markAsTranslated.progressTitle')
          : t('projectInfo.translationProgressTitle')
      }
      className="translation-progress-modal"
      preventClose={!isTranslationComplete}
      footer={
        isTranslationComplete ? (
          <Button variant="primary" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={cancelling}>
            {cancelling
              ? t('chapter.cancellingTranslate')
              : isMarkTranslatedBatch
                ? t('common.cancel')
                : t('chapter.cancelTranslate')}
          </Button>
        )
      }
    >
      {progress && (
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
                  current: progress.current,
                  total: progress.total,
                })}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div
              class="progress-bar"
              style={{ width: '100%', height: '10px', marginBottom: '1rem' }}
            >
              <div
                class="progress-fill"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                  height: '100%',
                }}
              />
            </div>
          </div>
          {!isMarkTranslatedBatch && (
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
          )}
          {progress.currentChapter && (
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
                {isMarkTranslatedBatch
                  ? t('markAsTranslated.progressStatusLabel')
                  : t('projectInfo.currentChapterLabel')}
              </div>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                {progress.currentChapter}
              </div>
              {(() => {
                const currentChapterProgress = progress.chapters.find(
                  (ch) => ch.chapterId === progress.currentChapterId
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
            const computedTotalTokens = progress.chapters.reduce(
              (s, ch) => s + (ch.tokensUsed ?? 0),
              0
            );
            const computedTotalDuration = progress.chapters.reduce(
              (s, ch) => s + (ch.duration ?? 0),
              0
            );
            const computedTotalGlossary = progress.chapters.reduce(
              (s, ch) => s + (ch.glossaryEntries ?? 0),
              0
            );
            const batchFinished = progress.current >= progress.total;
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
                  const completedChapters = progress.chapters.filter((ch) => ch.tokensByStage);
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
              {t('projectInfo.completedCount', { count: progress.completed })}
            </div>
            {progress.errors > 0 && (
              <div style={{ color: 'var(--error)' }}>
                <Icon name="error" size="sm" />{' '}
                {t('projectInfo.errorsCount', { count: progress.errors })}
              </div>
            )}
            {progress.skipped > 0 && (
              <div style={{ color: 'var(--text-dim)' }}>
                <Icon name="skip_next" size="sm" />{' '}
                {t('projectInfo.skippedCount', { count: progress.skipped })}
              </div>
            )}
          </div>
          {(() => {
            const isMarkBatch = progress.mode === 'mark-translated';
            const errorChapters = progress.chapters.filter((ch) => ch.status === 'error');
            const skippedChapters = progress.chapters.filter((ch) => ch.status === 'skipped');
            const formatReason = (reason?: string) => {
              if (!reason) return undefined;
              return isMarkBatch ? formatMarkTranslatedBatchReason(reason, t) : reason;
            };

            const renderIssueList = (items: typeof errorChapters, variant: 'error' | 'skipped') => (
              <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.85rem' }}>
                {items.map((issue) => {
                  const reasonText = formatReason(issue.reason);
                  return (
                    <div
                      key={issue.chapterId}
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginBottom: '0.4rem',
                        color: variant === 'error' ? 'var(--error)' : 'var(--text-dim)',
                      }}
                    >
                      <span>
                        {variant === 'error' ? (
                          <Icon name="error" size="sm" />
                        ) : (
                          <Icon name="skip_next" size="sm" />
                        )}
                      </span>
                      <span style={{ flex: 1 }}>
                        {issue.title}
                        {reasonText ? ` — ${reasonText}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            );

            if (isMarkBatch) {
              if (errorChapters.length === 0 && skippedChapters.length === 0) return null;
              return (
                <>
                  {errorChapters.length > 0 && (
                    <div
                      style={{
                        marginBottom: skippedChapters.length > 0 ? '1rem' : 0,
                        padding: '0.75rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                        {t('markAsTranslated.issuesErrorsTitle')}
                      </div>
                      {renderIssueList(errorChapters, 'error')}
                    </div>
                  )}
                  {skippedChapters.length > 0 && (
                    <div
                      style={{
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                        {t('markAsTranslated.issuesSkippedTitle')}
                      </div>
                      {renderIssueList(skippedChapters, 'skipped')}
                    </div>
                  )}
                </>
              );
            }

            const issues = [...errorChapters, ...skippedChapters];
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
  );
}
