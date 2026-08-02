import { useRef, useState, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui';
import { api } from '../../api/client';
import { invalidateProject } from '../../store/projects';
import '../ProjectInfo.css';

const COVER_INPUT_ID = 'cover-upload-input';

export interface ProjectCoverEditorProps {
  projectId: string;
  coverImageUrl?: string;
  variant?: 'book' | 'compact';
  deletingCover: boolean;
  onDeleteRequest: () => void;
  onRefreshProject: () => Promise<void>;
  onError: (title: string, message: string) => void;
}

export function ProjectCoverEditor({
  projectId,
  coverImageUrl,
  variant = 'book',
  deletingCover,
  onDeleteRequest,
  onRefreshProject,
  onError,
}: ProjectCoverEditorProps) {
  const { t } = useTranslation();
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCompact = variant === 'compact';
  const busy = uploadingCover || deletingCover;

  const triggerFileInput = useCallback(() => {
    if (!coverImageUrl && !busy) {
      fileInputRef.current?.click();
    }
  }, [coverImageUrl, busy]);

  const handleContainerKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerFileInput();
      }
    },
    [triggerFileInput]
  );

  const handleUpload = useCallback(
    async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploadingCover(true);
      try {
        await api.uploadProjectCover(projectId, file);
        invalidateProject(projectId);
        await onRefreshProject();
      } catch (error) {
        console.error('Failed to upload cover:', error);
        onError(
          t('projectInfo.errorUploadCover'),
          error instanceof Error ? error.message : t('projectInfo.errorUploadCover')
        );
      } finally {
        setUploadingCover(false);
        (e.target as HTMLInputElement).value = '';
      }
    },
    [projectId, onRefreshProject, onError, t]
  );

  const deleteOverlay = deletingCover ? (
    <div
      style={{
        position: 'absolute',
        top: '0.5rem',
        right: '0.5rem',
        background: 'rgba(0, 0, 0, 0.7)',
        borderRadius: '4px',
        padding: '0.25rem 0.5rem',
        color: 'white',
        fontSize: '0.85rem',
      }}
    >
      ...
    </div>
  ) : (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDeleteRequest();
        }}
        disabled={deletingCover}
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          width: '32px',
          height: '32px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
          transition: 'all 0.2s',
        }}
        title={t('projectInfo.deleteCoverTitle')}
      >
        <Icon name="delete" size="sm" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        disabled={busy}
        style={{
          position: 'absolute',
          bottom: '0.5rem',
          right: '0.5rem',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '0.375rem 0.75rem',
          cursor: 'pointer',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          transition: 'all 0.2s',
        }}
        title={t('projectInfo.replaceCoverTitle')}
      >
        {uploadingCover ? (
          <Icon name="schedule" size="sm" />
        ) : (
          <Icon name="upload_file" size="sm" />
        )}
      </button>
    </>
  );

  const emptyPlaceholder = (
    <div
      style={{
        width: isCompact ? '200px' : '100%',
        height: isCompact ? '300px' : undefined,
        minHeight: isCompact ? undefined : '300px',
        background: 'var(--bg-hover)',
        border: '2px dashed var(--border)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        transition: 'all 0.2s',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!busy) {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.background = 'var(--accent-glow)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.background = 'var(--bg-hover)';
      }}
    >
      <div style={{ fontSize: '3rem', opacity: 0.5 }}>
        <Icon name="image" size="lg" />
      </div>
      <div
        style={{
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          padding: '0 1rem',
        }}
      >
        {uploadingCover
          ? `... ${t('projectInfo.uploadCoverLoading')}`
          : t('projectInfo.uploadCoverClick')}
      </div>
    </div>
  );

  return (
    <>
      <div
        class="metadata-cover"
        role="button"
        tabIndex={0}
        aria-label={coverImageUrl ? undefined : t('projectInfo.uploadCoverClick')}
        style={{
          cursor: coverImageUrl ? 'default' : 'pointer',
          position: 'relative',
          ...(isCompact ? { flexShrink: 0 } : {}),
        }}
        onClick={triggerFileInput}
        onKeyDown={handleContainerKeyDown}
      >
        {coverImageUrl ? (
          <>
            {isCompact ? (
              <img
                src={coverImageUrl}
                alt={t('projectInfo.coverProjectAlt')}
                style={{
                  width: '100%',
                  maxWidth: '200px',
                  height: 'auto',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
              />
            ) : (
              <img src={coverImageUrl} alt={t('projectInfo.coverAlt')} class="cover-image" />
            )}
            {deleteOverlay}
          </>
        ) : (
          emptyPlaceholder
        )}
      </div>
      <input
        ref={fileInputRef}
        id={COVER_INPUT_ID}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={busy}
        style={{ display: 'none' }}
      />
    </>
  );
}
