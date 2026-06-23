import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../ui';
import { createSnippetHtml } from '../../utils/search-utils';
import './ReplacePreviewModal.css';

export interface ReplacePreviewItem {
  paragraphId: string;
  paragraphIndex: number;
  chapterId?: string;
  chapterNumber?: number;
  before: string;
  after: string;
  find?: string;
  caseSensitive?: boolean;
  source?: 'literal' | 'ai';
}

interface ReplacePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ReplacePreviewItem[];
  onConfirm: () => void;
  isReplacing: boolean;
  progress?: { done: number; total: number } | null;
  preventClose?: boolean;
  source?: 'literal' | 'ai';
  /** How many paragraphs were sent to AI (for sparse-output explanation). */
  selectedCount?: number;
}

function renderDiffText(text: string, find: string | undefined, caseSensitive: boolean): string {
  if (!find?.trim()) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  const snippet = text.length > 300 ? text.slice(0, 300) + '…' : text;
  return createSnippetHtml(snippet, find, caseSensitive);
}

export function ReplacePreviewModal({
  isOpen,
  onClose,
  items,
  onConfirm,
  isReplacing,
  progress,
  preventClose = false,
  source = 'literal',
  selectedCount,
}: ReplacePreviewModalProps) {
  const { t } = useTranslation();
  const showAiCoverage = source === 'ai' && selectedCount != null && selectedCount > items.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(
        'searchReplace.previewTitle',
        { count: items.length },
        'Replace preview ({{count}} paragraphs)'
      )}
      closeOnBackdropClick={false}
      preventClose={preventClose || isReplacing}
      closeButtonDisabled={isReplacing}
      className="replace-preview-modal nested"
      footer={
        <div class="replace-preview-footer">
          <Button variant="secondary" onClick={onClose} disabled={isReplacing}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={isReplacing}
            disabled={isReplacing}
          >
            {t('searchReplace.applyReplace', 'Apply replace')}
          </Button>
        </div>
      }
    >
      <div class="replace-preview-body">
        <p class="replace-preview-hint">
          {source === 'ai'
            ? showAiCoverage
              ? t('searchReplace.aiPreviewCoverage', {
                  changed: items.length,
                  selected: selectedCount,
                })
              : t(
                  'searchReplace.aiPreviewHint',
                  'Suggested by AI — review each change before applying.'
                )
            : t('searchReplace.previewHint', 'The following paragraphs will be updated:')}
        </p>
        {source === 'literal' && (
          <p class="replace-preview-hint replace-preview-block-hint">
            {t(
              'searchReplace.blockMarkerHint',
              'Formatting markers ({{block:…}}) are not changed automatically.'
            )}
          </p>
        )}

        {progress && isReplacing && (
          <div class="replace-preview-progress">
            <div class="replace-preview-progress-bar">
              <div
                class="replace-preview-progress-fill"
                style={{
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <span class="replace-preview-progress-label">
              {t('searchReplace.progress', {
                done: progress.done,
                total: progress.total,
              })}
            </span>
          </div>
        )}

        <div class="replace-preview-list">
          {items.map((item) => (
            <div key={`${item.chapterId ?? ''}-${item.paragraphId}`} class="replace-preview-item">
              <div class="replace-preview-item-header">
                {item.chapterNumber != null
                  ? t('searchReplace.previewChapterParagraph', {
                      chapter: item.chapterNumber,
                      index: item.paragraphIndex,
                    })
                  : t(
                      'searchReplace.paragraphLabel',
                      { index: item.paragraphIndex },
                      'Paragraph #{{index}}'
                    )}
              </div>
              <div class="replace-preview-row">
                <span class="replace-preview-label">{t('searchReplace.before', 'Before')}:</span>
                <span
                  class="replace-preview-text replace-preview-before"
                  dangerouslySetInnerHTML={{
                    __html: renderDiffText(item.before, item.find, item.caseSensitive ?? false),
                  }}
                />
              </div>
              <div class="replace-preview-row">
                <span class="replace-preview-label">{t('searchReplace.after', 'After')}:</span>
                <span
                  class="replace-preview-text replace-preview-after"
                  dangerouslySetInnerHTML={{
                    __html: renderDiffText(item.after, item.find, item.caseSensitive ?? false),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
