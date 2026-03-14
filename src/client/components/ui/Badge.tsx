import { useTranslation } from 'react-i18next';
import type { ChapterStatus, ParagraphStatus } from '../../types';
import { Icon } from './Icon';

type StatusType = ChapterStatus | ParagraphStatus;

interface BadgeProps {
  status: StatusType;
  showText?: boolean;
}

const statusIcons: Record<StatusType, { iconName: string; className: string }> = {
  pending: { iconName: 'schedule', className: 'status-pending' },
  translating: { iconName: 'translate', className: 'status-translating' },
  analyzed: { iconName: 'manage_search', className: 'status-analyzed' },
  draft: { iconName: 'edit_note', className: 'status-draft' },
  completed: { iconName: 'check_circle', className: 'status-completed' },
  error: { iconName: 'error', className: 'status-error' },
  translated: { iconName: 'menu_book', className: 'status-translated' },
  approved: { iconName: 'verified', className: 'status-approved' },
  edited: { iconName: 'edit', className: 'status-edited' },
};

export function StatusBadge({ status, showText = true }: BadgeProps) {
  const { t } = useTranslation();
  const config = statusIcons[status] || statusIcons.pending;
  const text = t(`status.${status}`);

  return (
    <span class={`chapter-status ${config.className}`} title={!showText ? text : undefined}>
      <Icon name={config.iconName} size="sm" />
      {showText && ` ${text}`}
    </span>
  );
}

interface CountBadgeProps {
  count: number;
  variant?: 'default' | 'accent';
}

export function CountBadge({ count, variant = 'default' }: CountBadgeProps) {
  const className = variant === 'accent' ? 'glossary-count' : 'chapter-count-badge';
  return <span class={className}>{count}</span>;
}
