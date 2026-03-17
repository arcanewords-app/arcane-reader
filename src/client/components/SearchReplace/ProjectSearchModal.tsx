import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { ProjectSearchMatch } from '../../types';
import { Modal, Button } from '../ui';
import { api } from '../../api/client';
import { replaceInText } from '../../utils/search-utils';
import { ReplacePreviewModal, type ReplacePreviewItem } from './ReplacePreviewModal';
import './ProjectSearchModal.css';

const DEBOUNCE_MS = 300;

interface ProjectSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  isOriginalReadingMode: boolean;
  onRefresh?: () => void | Promise<void>;
}

export function ProjectSearchModal({
  isOpen,
  onClose,
  projectId,
  isOriginalReadingMode,
  onRefresh,
}: ProjectSearchModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [matches, setMatches] = useState<ProjectSearchMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceResult, setReplaceResult] = useState<{
    succeeded: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!isOpen || !debouncedQuery) {
      setMatches([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const field = isOriginalReadingMode ? 'original' : 'translated';
    api
      .searchProject(projectId, debouncedQuery, field)
      .then(({ matches: m }) => {
        setMatches(m);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Search failed');
        setMatches([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, debouncedQuery, projectId, isOriginalReadingMode]);

  const handleRowClick = useCallback(
    (m: ProjectSearchMatch) => {
      onClose();
      route(`/projects/${projectId}/chapters/${m.chapterId}`);
    },
    [projectId, onClose]
  );

  // Only translated matches can be replaced
  const translatedMatches = useMemo(
    () => matches.filter((m) => m.field === 'translated'),
    [matches]
  );

  const previewItems = useMemo((): ReplacePreviewItem[] => {
    if (!debouncedQuery || !replace.trim() || replace.trim() === debouncedQuery) return [];
    const seen = new Set<string>();
    const items: ReplacePreviewItem[] = [];
    for (const m of translatedMatches) {
      const key = `${m.chapterId}-${m.paragraphId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const after = replaceInText(m.fullText, debouncedQuery, replace, true, false);
      if (after !== m.fullText) {
        items.push({
          paragraphId: m.paragraphId,
          paragraphIndex: m.paragraphIndex,
          before: m.fullText.slice(0, 150) + (m.fullText.length > 150 ? '…' : ''),
          after: after.slice(0, 150) + (after.length > 150 ? '…' : ''),
        });
      }
    }
    return items;
  }, [translatedMatches, debouncedQuery, replace]);

  const canReplaceAll =
    !isOriginalReadingMode &&
    !!debouncedQuery &&
    replace.trim() !== debouncedQuery &&
    translatedMatches.length > 0 &&
    previewItems.length > 0;

  const handleReplaceAll = useCallback(() => {
    if (!canReplaceAll) return;
    setShowPreview(true);
    setReplaceResult(null);
  }, [canReplaceAll]);

  const handleConfirmReplaceAll = useCallback(async () => {
    if (previewItems.length === 0) return;
    setReplacing(true);
    try {
      const seen = new Set<string>();
      const updates: Array<{ chapterId: string; paragraphId: string; translatedText: string }> = [];
      for (const m of translatedMatches) {
        const key = `${m.chapterId}-${m.paragraphId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const after = replaceInText(m.fullText, debouncedQuery, replace, true, false);
        if (after !== m.fullText) {
          updates.push({
            chapterId: m.chapterId,
            paragraphId: m.paragraphId,
            translatedText: after,
          });
        }
      }
      const result = await api.bulkUpdateParagraphs(projectId, updates);
      setReplaceResult({
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      });
      if (result.succeeded.length > 0) {
        setShowPreview(false);
        onRefresh?.();
      }
      if (result.failed.length === 0) {
        setReplace('');
      }
    } catch (err) {
      setReplaceResult({
        succeeded: 0,
        failed: 1,
      });
    } finally {
      setReplacing(false);
    }
  }, [previewItems, translatedMatches, debouncedQuery, replace, projectId, onRefresh]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('searchReplace.findInProject', 'Find in project')}
      size="large"
      className="project-search-modal"
    >
      <div class="project-search-body">
        <div class="project-search-input-row">
          <div class="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <input
              type="text"
              class="form-input"
              placeholder={t('searchReplace.findPlaceholder', 'Find')}
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              aria-label={t('searchReplace.findPlaceholder', 'Find')}
            />
          </div>
          {!isOriginalReadingMode && (
            <>
              <div class="form-group" style={{ marginBottom: 0, flex: 1 }}>
                <input
                  type="text"
                  class="form-input"
                  placeholder={t('searchReplace.replacePlaceholder', 'Replace')}
                  value={replace}
                  onInput={(e) => setReplace((e.target as HTMLInputElement).value)}
                  aria-label={t('searchReplace.replacePlaceholder', 'Replace')}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReplaceAll}
                disabled={!canReplaceAll || replacing}
              >
                {t('searchReplace.replaceAll', 'Replace all')}
              </Button>
            </>
          )}
        </div>

        {replaceResult && (
          <div
            class={
              replaceResult.failed > 0
                ? 'project-search-result project-search-result-partial'
                : 'project-search-result project-search-result-ok'
            }
          >
            {replaceResult.succeeded > 0 && (
              <span>
                {t(
                  'searchReplace.updatedCount',
                  { count: replaceResult.succeeded },
                  'Updated {{count}}'
                )}
              </span>
            )}
            {replaceResult.failed > 0 && (
              <span>
                {t(
                  'searchReplace.failedCount',
                  { count: replaceResult.failed },
                  '{{count}} failed'
                )}
              </span>
            )}
          </div>
        )}

        {loading && <div class="project-search-loading">{t('common.loading')}</div>}

        {error && (
          <div class="project-search-error">
            {error}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setError(null);
                setLoading(true);
                const field = isOriginalReadingMode ? 'original' : 'translated';
                api
                  .searchProject(projectId, debouncedQuery, field)
                  .then(({ matches: m }) => setMatches(m))
                  .catch((err) => setError(err instanceof Error ? err.message : 'Search failed'))
                  .finally(() => setLoading(false));
              }}
            >
              {t('common.retry')}
            </Button>
          </div>
        )}

        {!loading && !error && debouncedQuery && (
          <div class="project-search-results">
            {matches.length === 0 ? (
              <div class="project-search-empty">{t('searchReplace.noMatches', 'No matches')}</div>
            ) : (
              <>
                <div class="project-search-results-header">
                  {t('searchReplace.resultsCount', { count: matches.length }, '{{count}} matches')}
                </div>
                <div class="project-search-list">
                  {matches.map((m) => (
                    <div
                      key={`${m.chapterId}-${m.paragraphId}`}
                      class="project-search-row"
                      onClick={() => handleRowClick(m)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowClick(m);
                        }
                      }}
                    >
                      <span class="project-search-chapter">
                        Ch. {m.chapterNumber}: {m.chapterTitle}
                      </span>
                      <span class="project-search-para">#{m.paragraphIndex}</span>
                      <span class="project-search-snippet">{m.snippet}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <ReplacePreviewModal
        isOpen={showPreview}
        onClose={() => !replacing && setShowPreview(false)}
        items={previewItems}
        onConfirm={handleConfirmReplaceAll}
        isReplacing={replacing}
      />
    </Modal>
  );
}
