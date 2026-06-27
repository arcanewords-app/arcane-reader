import { useState, useMemo, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Project, ProjectWithChapterList, ProjectListItem } from '../../types';
import { Modal, Button, LoadingSpinner, AlertModal } from '../ui';
import { formatLanguagePairLabel } from '../../constants/translationLanguages';
import { chapterDisplayTitle } from '../../../shared/chapterTitle';
import { api } from '../../api/client';
import { loadProjects, projectsCache } from '../../store/projects';
import './CopyChaptersModal.css';

interface CopyChaptersModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | ProjectWithChapterList;
  onSuccess: () => Promise<void>;
}

export function CopyChaptersModal({ isOpen, onClose, project, onSuccess }: CopyChaptersModalProps) {
  const { t } = useTranslation();
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [includeGlossary, setIncludeGlossary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successModal, setSuccessModal] = useState<{ title: string; message: string } | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

  const chaptersSorted = useMemo(
    () => [...project.chapters].sort((a, b) => a.number - b.number),
    [project.chapters]
  );

  const projectTargetLanguage = project.targetLanguage || 'ru';
  const projectSourceLanguage = project.sourceLanguage || 'en';

  const targetProjects = useMemo((): ProjectListItem[] => {
    return projectsCache.value.filter(
      (item) => item.id !== project.id && (item.targetLanguage || 'ru') === projectTargetLanguage
    );
  }, [project.id, projectTargetLanguage, projectsCache.value]);

  const selectedTarget = useMemo(
    () => targetProjects.find((item) => item.id === targetProjectId),
    [targetProjects, targetProjectId]
  );

  const sourceLanguageWarning = Boolean(
    selectedTarget && (selectedTarget.sourceLanguage || 'en') !== projectSourceLanguage
  );

  useEffect(() => {
    if (!isOpen) return;
    void loadProjects();
    setSelectedChapterIds(chaptersSorted.map((chapter) => chapter.id));
    setTargetProjectId('');
    setIncludeGlossary(false);
  }, [isOpen, chaptersSorted]);

  const toggleChapter = useCallback((chapterId: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(chapterId) ? prev.filter((id) => id !== chapterId) : [...prev, chapterId]
    );
  }, []);

  const handleCopy = useCallback(async () => {
    if (!targetProjectId || selectedChapterIds.length === 0) return;
    setLoading(true);
    try {
      const result = await api.transferChaptersFromProject(targetProjectId, {
        sourceProjectId: project.id,
        chapterIds: selectedChapterIds,
        includeGlossary,
      });
      onClose();
      await onSuccess();
      await loadProjects();
      setSuccessModal({
        title: t('chapterTransfer.successTitle'),
        message: t('chapterTransfer.successMessage', {
          count: result.chaptersTransferred,
          glossaryAdded: result.glossaryAdded,
          glossarySkipped: result.glossarySkipped,
        }),
      });
    } catch (err) {
      setErrorModal({
        title: t('chapterTransfer.errorTitle'),
        message: err instanceof Error ? err.message : t('chapterTransfer.errorGeneric'),
      });
    } finally {
      setLoading(false);
    }
  }, [targetProjectId, selectedChapterIds, project.id, includeGlossary, onClose, onSuccess, t]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => !loading && onClose()}
        title={t('copyChapters.modalTitle')}
        className="copy-chapters-modal"
        preventClose={loading}
        footer={
          <div class="copy-chapters-footer">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCopy}
              disabled={loading || !targetProjectId || selectedChapterIds.length === 0}
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" /> {t('chapterTransfer.transferring')}
                </>
              ) : (
                t('chapterTransfer.confirm')
              )}
            </Button>
          </div>
        }
      >
        <p class="copy-chapters-hint">{t('copyChapters.chaptersHint')}</p>

        <div class="copy-chapters-selection-row">
          <button
            type="button"
            class="copy-chapters-link-btn"
            onClick={() => setSelectedChapterIds(chaptersSorted.map((c) => c.id))}
          >
            {t('chapter.selectAll')}
          </button>
          <button
            type="button"
            class="copy-chapters-link-btn copy-chapters-link-btn-dim"
            onClick={() => setSelectedChapterIds([])}
          >
            {t('chapter.deselectAll')}
          </button>
          <span class="copy-chapters-selected-count">
            {t('copyChapters.selectedCount', { count: selectedChapterIds.length })}
          </span>
        </div>

        <div class="copy-chapters-list">
          {chaptersSorted.length === 0 ? (
            <p class="copy-chapters-empty">{t('chapterList.noChapters')}</p>
          ) : (
            chaptersSorted.map((chapter, index) => {
              const checked = selectedChapterIds.includes(chapter.id);
              const isLast = index === chaptersSorted.length - 1;
              return (
                <label
                  key={chapter.id}
                  class="copy-chapters-item"
                  style={{ borderBottom: isLast ? 'none' : undefined }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleChapter(chapter.id)}
                    style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <span class="copy-chapters-item-number">{chapter.number}</span>
                  <span class="copy-chapters-item-title">{chapterDisplayTitle(chapter)}</span>
                </label>
              );
            })
          )}
        </div>

        <div class="copy-chapters-target-block">
          <h3 class="copy-chapters-target-title">{t('chapterTransfer.targetProject')}</h3>
          {targetProjects.length === 0 ? (
            <p class="copy-chapters-target-hint">{t('chapterTransfer.noTargets')}</p>
          ) : (
            <>
              <select
                class="copy-chapters-target-select"
                value={targetProjectId}
                onChange={(e) => setTargetProjectId((e.target as HTMLSelectElement).value)}
                disabled={loading}
              >
                <option value="">{t('chapterTransfer.selectProject')}</option>
                {targetProjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (
                    {formatLanguagePairLabel(
                      t,
                      item.sourceLanguage || 'en',
                      item.targetLanguage || 'ru'
                    )}
                    )
                  </option>
                ))}
              </select>
              {sourceLanguageWarning && (
                <p class="copy-chapters-warning">{t('chapterTransfer.sourceLanguageWarning')}</p>
              )}
              <label class="copy-chapters-glossary-ack">
                <input
                  type="checkbox"
                  checked={includeGlossary}
                  onChange={(e) => setIncludeGlossary((e.target as HTMLInputElement).checked)}
                  disabled={loading}
                />
                <span>{t('chapterTransfer.includeGlossary')}</span>
              </label>
              <p class="copy-chapters-target-hint">{t('chapterTransfer.includeGlossaryHint')}</p>
            </>
          )}
        </div>
      </Modal>

      <AlertModal
        isOpen={!!successModal}
        onClose={() => setSuccessModal(null)}
        title={successModal?.title ?? ''}
        message={successModal?.message ?? ''}
      />

      <AlertModal
        isOpen={!!errorModal}
        onClose={() => setErrorModal(null)}
        title={errorModal?.title ?? ''}
        message={errorModal?.message ?? ''}
      />
    </>
  );
}
