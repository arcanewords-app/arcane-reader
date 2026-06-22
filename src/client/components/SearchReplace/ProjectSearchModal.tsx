import { useCallback, useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { ChapterListItem, ProjectSearchMatch, TextBlockType } from '../../types';
import { Modal, Button, ConfirmModal } from '../ui';
import { createSnippetHtml, paragraphMatchKey } from '../../utils/search-utils';
import { ReplacePreviewModal } from './ReplacePreviewModal';
import { useProjectSearch } from './useProjectSearch';
import './ProjectSearchModal.css';

interface ProjectSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  isOriginalReadingMode: boolean;
  chapters: ChapterListItem[];
  textBlockTypes?: TextBlockType[];
  onRefresh?: () => void | Promise<void>;
}

export function ProjectSearchModal({
  isOpen,
  onClose,
  projectId,
  isOriginalReadingMode,
  chapters,
  textBlockTypes = [],
  onRefresh,
}: ProjectSearchModalProps) {
  const { t } = useTranslation();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [previewAll, setPreviewAll] = useState(false);

  const search = useProjectSearch({
    projectId,
    isOpen,
    isOriginalReadingMode,
    chapters,
    textBlockTypes,
    onRefresh,
  });

  const requestClose = useCallback(() => {
    if (search.replacing) return;
    if (search.isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [search.replacing, search.isDirty, onClose]);

  useEffect(() => {
    if (!isOpen) setShowDiscardConfirm(false);
  }, [isOpen]);

  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const handleOpenParagraph = useCallback(
    (m: ProjectSearchMatch) => {
      const params = new URLSearchParams();
      if (search.debouncedQuery) params.set('search', search.debouncedQuery);
      params.set('paragraph', m.paragraphId);
      const qs = params.toString();
      route(`/projects/${projectId}/chapters/${m.chapterId}${qs ? `?${qs}` : ''}`);
    },
    [projectId, search.debouncedQuery]
  );

  const handleReplaceSelected = useCallback(() => {
    if (!search.canReplace || search.previewItems.length === 0) return;
    setPreviewAll(false);
    search.setShowPreview(true);
  }, [search]);

  const handleReplaceAll = useCallback(() => {
    if (!search.canReplace || search.previewItemsAll.length === 0) return;
    setPreviewAll(true);
    search.setShowPreview(true);
  }, [search]);

  const previewItems = previewAll ? search.previewItemsAll : search.previewItems;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        title={t('searchReplace.findInProject', 'Find in project')}
        size="large"
        className="project-search-modal"
        closeOnBackdropClick={false}
        preventClose={search.replacing}
        closeButtonDisabled={search.replacing}
      >
        <div class="project-search-body">
          <div class="project-search-input-row">
            <div class="form-group project-search-field" style={{ marginBottom: 0 }}>
              <input
                type="text"
                class="form-input"
                placeholder={t('searchReplace.findPlaceholder', 'Find')}
                value={search.query}
                onInput={(e) => search.setQuery((e.target as HTMLInputElement).value)}
                aria-label={t('searchReplace.findPlaceholder', 'Find')}
              />
            </div>
            {!search.isOriginalReadingMode && (
              <div class="form-group project-search-field" style={{ marginBottom: 0 }}>
                <input
                  type="text"
                  class="form-input"
                  placeholder={t('searchReplace.replacePlaceholder', 'Replace')}
                  value={search.replace}
                  onInput={(e) => search.setReplace((e.target as HTMLInputElement).value)}
                  aria-label={t('searchReplace.replacePlaceholder', 'Replace')}
                />
              </div>
            )}
          </div>

          <div class="project-search-options-row">
            <label class="project-search-option">
              <input
                type="checkbox"
                checked={search.caseSensitive}
                onChange={(e) => search.setCaseSensitive((e.target as HTMLInputElement).checked)}
              />
              <span>{t('searchReplace.caseSensitive', 'Aa')}</span>
            </label>
            <label class="project-search-option">
              <input
                type="checkbox"
                checked={search.wholeWord}
                onChange={(e) => search.setWholeWord((e.target as HTMLInputElement).checked)}
              />
              <span>{t('searchReplace.wholeWord', 'Whole word')}</span>
            </label>
          </div>

          <div class="project-search-filters-row">
            <div class="form-group project-search-filter-field" style={{ marginBottom: 0 }}>
              <label class="project-search-filter-label">
                {t('searchReplace.chapterFrom', 'Chapter from')}
              </label>
              <input
                type="number"
                min="1"
                class="form-input"
                value={search.chapterFrom}
                onInput={(e) => search.setChapterFrom((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="form-group project-search-filter-field" style={{ marginBottom: 0 }}>
              <label class="project-search-filter-label">
                {t('searchReplace.chapterTo', 'Chapter to')}
              </label>
              <input
                type="number"
                min="1"
                class="form-input"
                value={search.chapterTo}
                onInput={(e) => search.setChapterTo((e.target as HTMLInputElement).value)}
              />
            </div>
            <div
              class="form-group project-search-filter-field project-search-filter-grow"
              style={{ marginBottom: 0 }}
            >
              <label class="project-search-filter-label">
                {t('searchReplace.filterResults', 'Filter in results')}
              </label>
              <input
                type="text"
                class="form-input"
                placeholder={t('searchReplace.filterResultsPlaceholder', 'Narrow results…')}
                value={search.filterQuery}
                onInput={(e) => search.setFilterQuery((e.target as HTMLInputElement).value)}
              />
            </div>
            {search.textBlockTypes.length > 0 && (
              <div class="form-group project-search-filter-field" style={{ marginBottom: 0 }}>
                <label class="project-search-filter-label">
                  {t('searchReplace.textBlockType', 'Text block')}
                </label>
                <select
                  class="form-input"
                  value={search.textBlockType}
                  onChange={(e) => search.setTextBlockType((e.target as HTMLSelectElement).value)}
                >
                  <option value="">{t('searchReplace.textBlockAll', 'All')}</option>
                  {search.textBlockTypes.map((tb) => (
                    <option key={tb.id} value={tb.id}>
                      {tb.name || tb.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!search.isOriginalReadingMode && (
            <div class="project-search-actions-row">
              <Button
                variant="primary"
                size="sm"
                onClick={handleReplaceSelected}
                disabled={
                  !search.canReplace ||
                  search.replacing ||
                  search.previewItems.length === 0 ||
                  search.selectedVisibleCount === 0 ||
                  search.isSearchPending ||
                  search.loading
                }
              >
                {t('searchReplace.replaceSelected', 'Replace selected')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReplaceAll}
                disabled={
                  !search.canReplace ||
                  search.replacing ||
                  search.previewItemsAll.length === 0 ||
                  search.isSearchPending ||
                  search.loading
                }
              >
                {t('searchReplace.replaceAll', 'Replace all')}
              </Button>
            </div>
          )}

          {search.replaceResult && (
            <div
              class={
                search.replaceResult.failed > 0
                  ? 'project-search-result project-search-result-partial'
                  : 'project-search-result project-search-result-ok'
              }
            >
              {search.replaceResult.succeeded > 0 && (
                <span>
                  {t('searchReplace.updatedCount', {
                    count: search.replaceResult.succeeded,
                  })}
                </span>
              )}
              {search.replaceResult.failed > 0 && (
                <>
                  <span>
                    {t('searchReplace.failedCount', {
                      count: search.replaceResult.failed,
                    })}
                  </span>
                  {search.pendingRetryUpdates.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => void search.retryFailed()}>
                      {t('searchReplace.retryFailed', 'Retry failed')}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {search.showLargeProjectHint && (
            <p class="project-search-large-hint">
              {t(
                'searchReplace.largeProjectHint',
                'Large project: narrow the chapter range for faster search.'
              )}
            </p>
          )}

          {search.initialLoading && <div class="project-search-loading">{t('common.loading')}</div>}

          {search.error && (
            <div class="project-search-error">
              {search.error}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => search.runSearch(false, 0, true)}
              >
                {t('common.retry')}
              </Button>
            </div>
          )}

          {search.debouncedQuery && !search.initialLoading && (
            <div
              class={`project-search-results${search.refreshing ? ' project-search-results-refreshing' : ''}`}
            >
              {search.filteredMatches.length === 0 && !search.refreshing ? (
                <div class="project-search-empty">{t('searchReplace.noMatches', 'No matches')}</div>
              ) : (
                <>
                  <div class="project-search-results-header">
                    <span>
                      {search.refreshing
                        ? t('searchReplace.searchPending', 'Searching…')
                        : t('searchReplace.resultsSummary', {
                            total: search.dedupedMatches.length,
                            visible: search.filteredMatches.length,
                            selected: search.selectedVisibleCount,
                          })}
                    </span>
                    <div class="project-search-results-actions">
                      <button
                        type="button"
                        class="project-search-link-btn"
                        onClick={search.selectAllVisible}
                      >
                        {t('searchReplace.selectAll', 'Select all')}
                      </button>
                      <button
                        type="button"
                        class="project-search-link-btn"
                        onClick={search.deselectAllVisible}
                      >
                        {t('searchReplace.deselectAll', 'Deselect all')}
                      </button>
                    </div>
                  </div>
                  <div class="project-search-list">
                    {search.filteredMatches.map((m) => {
                      const key = paragraphMatchKey(m.chapterId, m.paragraphId);
                      const excluded = search.excludedKeys.has(key);
                      const selected = search.selectedKeys.has(key) && !excluded;
                      return (
                        <div
                          key={key}
                          class={`project-search-row${excluded ? ' project-search-row-excluded' : ''}`}
                        >
                          <span class="project-search-checkbox">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={excluded || search.isOriginalReadingMode}
                              onChange={() => search.toggleSelected(key)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={t('searchReplace.selectParagraph', {
                                index: m.paragraphIndex,
                              })}
                            />
                          </span>
                          <button
                            type="button"
                            class="project-search-row-main"
                            onClick={() => handleOpenParagraph(m)}
                            title={t('searchReplace.openParagraph', 'Open in chapter')}
                          >
                            <span class="project-search-chapter">
                              Ch. {m.chapterNumber}: {m.chapterTitle}
                            </span>
                            <span class="project-search-para">#{m.paragraphIndex}</span>
                            <span
                              class="project-search-snippet"
                              dangerouslySetInnerHTML={{
                                __html: createSnippetHtml(
                                  m.snippet,
                                  search.debouncedQuery,
                                  search.caseSensitive
                                ),
                              }}
                            />
                          </button>
                          {!search.isOriginalReadingMode && (
                            <button
                              type="button"
                              class="project-search-exclude-btn"
                              onClick={() =>
                                excluded ? search.includeKey(key) : search.excludeKey(key)
                              }
                              title={
                                excluded
                                  ? t('searchReplace.include', 'Include')
                                  : t('searchReplace.exclude', 'Exclude')
                              }
                            >
                              {excluded
                                ? t('searchReplace.include', 'Include')
                                : t('searchReplace.exclude', 'Exclude')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {search.hasMore && (
                    <div class="project-search-load-more">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={search.loadMore}
                        loading={search.loadingMore}
                        disabled={search.loadingMore}
                      >
                        {t('searchReplace.loadMore', 'Load more')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <ReplacePreviewModal
          isOpen={search.showPreview}
          onClose={() => !search.replacing && search.setShowPreview(false)}
          items={previewItems}
          onConfirm={() => void search.applyReplace(previewItems)}
          isReplacing={search.replacing}
          progress={search.replaceProgress}
          preventClose={search.replacing}
        />
      </Modal>

      <ConfirmModal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={handleConfirmDiscard}
        title={t('searchReplace.confirmDiscardTitle', 'Discard search?')}
        message={t(
          'searchReplace.confirmDiscard',
          'Close without saving? Your search and selection will be lost.'
        )}
        confirmLabel={t('searchReplace.discard', 'Discard')}
        cancelLabel={t('common.cancel')}
        variant="danger"
      />
    </>
  );
}
