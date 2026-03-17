import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../ui';
import './ReplacePreviewModal.css';

export interface ReplacePreviewItem {
  paragraphId: string;
  paragraphIndex: number;
  before: string;
  after: string;
}

interface ReplacePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ReplacePreviewItem[];
  onConfirm: () => void;
  isReplacing: boolean;
}

const MAX_PREVIEW_ITEMS = 10;

export function ReplacePreviewModal({
  isOpen,
  onClose,
  items,
  onConfirm,
  isReplacing,
}: ReplacePreviewModalProps) {
  const { t } = useTranslation();
  const showAll = items.length <= MAX_PREVIEW_ITEMS;
  const displayItems = showAll ? items : items.slice(0, MAX_PREVIEW_ITEMS);
  const hasMore = items.length > MAX_PREVIEW_ITEMS;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(
        'searchReplace.previewTitle',
        { count: items.length },
        'Replace preview ({{count}} paragraphs)'
      )}
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
          {t('searchReplace.previewHint', 'The following paragraphs will be updated:')}
        </p>
        <div class="replace-preview-list">
          {displayItems.map((item) => (
            <div key={item.paragraphId} class="replace-preview-item">
              <div class="replace-preview-item-header">
                {t(
                  'searchReplace.paragraphLabel',
                  { index: item.paragraphIndex },
                  'Paragraph #{{index}}'
                )}
              </div>
              <div class="replace-preview-row">
                <span class="replace-preview-label">{t('searchReplace.before', 'Before')}:</span>
                <span class="replace-preview-text replace-preview-before">{item.before}</span>
              </div>
              <div class="replace-preview-row">
                <span class="replace-preview-label">{t('searchReplace.after', 'After')}:</span>
                <span class="replace-preview-text replace-preview-after">{item.after}</span>
              </div>
            </div>
          ))}
        </div>
        {hasMore && (
          <p class="replace-preview-more">
            {t(
              'searchReplace.andMore',
              { count: items.length - MAX_PREVIEW_ITEMS },
              '...and {{count}} more'
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}
