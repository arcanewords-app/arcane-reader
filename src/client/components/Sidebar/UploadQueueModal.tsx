import { useTranslation } from 'react-i18next';
import { Modal, Button, Icon } from '../ui';
import type { ChapterUploadQueueItem } from './useChapterUploadQueue.js';

export interface UploadQueueModalProps {
  queue: ChapterUploadQueueItem[];
  processing: boolean;
  showUploadModal: boolean;
  onShowUploadModal: (show: boolean) => void;
  onCancelQueue: () => void;
  onRetryItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
}

export function UploadQueueModal({
  queue,
  processing,
  showUploadModal,
  onShowUploadModal,
  onCancelQueue,
  onRetryItem,
  onRemoveItem,
}: UploadQueueModalProps) {
  const { t } = useTranslation();

  if (queue.length === 0) return null;

  const uploadingCount = queue.filter((q) => q.status === 'uploading').length;

  return (
    <>
      {!showUploadModal && (
        <div class="upload-queue-mini">
          <span class="upload-queue-mini-label">
            {t('chapterList.uploadQueue')} ({queue.length})
          </span>
          <Button variant="secondary" size="sm" onClick={() => onShowUploadModal(true)}>
            {t('chapterList.viewQueue') || 'View'}
          </Button>
        </div>
      )}

      <Modal
        isOpen={showUploadModal}
        onClose={() => !processing && onShowUploadModal(false)}
        title={t('chapterList.uploadModalTitle') || t('chapterList.uploadQueue')}
        className="upload-queue-modal"
        preventClose={processing}
        footer={
          processing ? (
            <Button variant="secondary" size="sm" onClick={() => onCancelQueue()}>
              {t('chapterList.cancelQueue') || 'Cancel'}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => onShowUploadModal(false)}>
              {t('common.close')}
            </Button>
          )
        }
      >
        <div class="upload-queue-modal-body">
          <div class="upload-queue-header">
            <strong>{t('chapterList.uploadQueue') || 'Upload queue'}</strong>
            <span class="upload-queue-meta">
              {uploadingCount > 0
                ? `${t('chapterList.uploadSending')}: ${uploadingCount}`
                : `${t('chapterList.all')}: ${queue.length}`}
            </span>
          </div>
          <div class="upload-queue-list">
            {queue.map((item) => (
              <div key={item.id} class={`queue-item ${item.status}`}>
                <div class="queue-item-left">
                  <span class={`queue-status ${item.status}`}>
                    {item.status === 'uploading' ? (
                      <Icon name="schedule" size="sm" />
                    ) : item.status === 'success' ? (
                      <Icon name="check_circle" size="sm" />
                    ) : item.status === 'error' ? (
                      <Icon name="error" size="sm" />
                    ) : item.status === 'canceled' ? (
                      <Icon name="cancel" size="sm" />
                    ) : (
                      <Icon name="radio_button_unchecked" size="sm" />
                    )}
                  </span>
                  <span class="queue-name">{item.file.name}</span>
                </div>
                {item.status === 'uploading' &&
                  item.uploadProgress &&
                  item.uploadProgress.total > 0 && (
                    <div class="queue-item-progress">
                      <div
                        class="queue-item-progress-bar"
                        style={{
                          width: `${Math.round(
                            (item.uploadProgress.loaded / item.uploadProgress.total) * 100
                          )}%`,
                        }}
                      />
                      <span class="queue-item-progress-text">
                        {item.uploadPhase === 'processing'
                          ? t('chapterList.uploadProcessing')
                          : `${t('chapterList.uploadSending')} ${Math.round(
                              (item.uploadProgress.loaded / item.uploadProgress.total) * 100
                            )}%`}
                      </span>
                    </div>
                  )}
                {item.status === 'uploading' &&
                  item.importJobId &&
                  item.importTotal !== undefined &&
                  item.importTotal > 0 && (
                    <div class="queue-item-import-meta">
                      <span>{`${item.importCurrent || 0}/${item.importTotal}`}</span>
                      {item.importCurrentChapterTitle && (
                        <span class="queue-item-import-title">
                          {item.importCurrentChapterTitle}
                        </span>
                      )}
                    </div>
                  )}
                <div class="queue-item-actions">
                  {item.status === 'error' && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => onRetryItem(item.id)}>
                        {t('common.retry') || 'Retry'}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => onRemoveItem(item.id)}>
                        {t('common.remove') || 'Remove'}
                      </Button>
                    </>
                  )}
                  {(item.status === 'pending' || item.status === 'canceled') && (
                    <Button variant="secondary" size="sm" onClick={() => onRemoveItem(item.id)}>
                      {t('common.remove') || 'Remove'}
                    </Button>
                  )}
                </div>
                {item.error && <pre class="queue-error">{item.error}</pre>}
                {item.status === 'success' && item.warnings && item.warnings.length > 0 && (
                  <div class="queue-warnings">
                    {item.warnings.map((w, i) => (
                      <div key={i} class="queue-warning-item">
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
