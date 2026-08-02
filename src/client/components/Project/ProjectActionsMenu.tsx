import { useState, useRef, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Button, Icon } from '../ui';
import '../ProjectInfo.css';

export interface ProjectActionsMenuProps {
  atProjectLimit: boolean;
  projectLimit: number;
  projectCount: number;
  hasChapters: boolean;
  onRename: () => void;
  onClone: () => void;
  onCopyChapters: () => void;
  onBulkDeleteChapters: () => void;
  onDelete: () => void;
}

export function ProjectActionsMenu({
  atProjectLimit,
  projectLimit,
  projectCount,
  hasChapters,
  onRename,
  onClone,
  onCopyChapters,
  onBulkDeleteChapters,
  onDelete,
}: ProjectActionsMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const closeAnd = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div class="project-actions-menu" ref={menuRef}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('projectInfo.projectMenu')}
        title={t('projectInfo.projectMenu')}
      >
        <Icon name="more_vert" size="sm" />
      </Button>
      {open && (
        <div class="project-actions-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            class="project-actions-item"
            onClick={() => closeAnd(onRename)}
          >
            <Icon name="edit" size="sm" />
            <span>{t('projectInfo.renameProject')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            class="project-actions-item"
            disabled={atProjectLimit}
            title={
              atProjectLimit
                ? t('dashboard.projectLimitReached', {
                    current: projectCount,
                    limit: projectLimit,
                  })
                : undefined
            }
            onClick={() => closeAnd(onClone)}
          >
            <Icon name="content_copy" size="sm" />
            <span>{t('projectInfo.cloneProject')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            class="project-actions-item"
            onClick={() => closeAnd(onCopyChapters)}
          >
            <Icon name="drive_file_move" size="sm" />
            <span>{t('projectInfo.copyChapters')}</span>
          </button>
          <hr class="project-actions-separator" />
          <button
            type="button"
            role="menuitem"
            class="project-actions-item project-actions-item-danger"
            disabled={!hasChapters}
            onClick={() => closeAnd(onBulkDeleteChapters)}
          >
            <Icon name="delete_sweep" size="sm" />
            <span>{t('projectInfo.deleteChapters')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            class="project-actions-item project-actions-item-danger"
            onClick={() => closeAnd(onDelete)}
          >
            <Icon name="delete" size="sm" />
            <span>{t('projectInfo.delete')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
