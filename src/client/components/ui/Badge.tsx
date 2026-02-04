import { useTranslation } from 'react-i18next';
import type { ChapterStatus, ParagraphStatus } from '../../types';

type StatusType = ChapterStatus | ParagraphStatus;

interface BadgeProps {
  status: StatusType;
  showText?: boolean;
}

const statusIcons: Record<StatusType, { icon: string; className: string }> = {
  pending: { icon: '⏳', className: 'status-pending' },
  translating: { icon: '🔮', className: 'status-translating' },
  completed: { icon: '✅', className: 'status-completed' },
  error: { icon: '❌', className: 'status-error' },
  translated: { icon: '📝', className: 'status-translated' },
  approved: { icon: '✅', className: 'status-approved' },
  edited: { icon: '✏️', className: 'status-edited' },
};

export function StatusBadge({ status, showText = true }: BadgeProps) {
  const { t } = useTranslation();
  const config = statusIcons[status] || statusIcons.pending;
  const text = t(`status.${status}`);

  return (
    <span class={`chapter-status ${config.className}`} title={!showText ? text : undefined}>
      {config.icon}
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

