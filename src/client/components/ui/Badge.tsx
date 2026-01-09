import type { ChapterStatus, ParagraphStatus } from '../../types';

type StatusType = ChapterStatus | ParagraphStatus;

interface BadgeProps {
  status: StatusType;
  showText?: boolean;
}

const statusConfig: Record<StatusType, { icon: string; text: string; className: string }> = {
  pending: { icon: '⏳', text: 'Ожидает', className: 'status-pending' },
  translating: { icon: '🔮', text: 'Перевод...', className: 'status-translating' },
  completed: { icon: '✅', text: 'Готово', className: 'status-completed' },
  error: { icon: '❌', text: 'Ошибка', className: 'status-error' },
  translated: { icon: '📝', text: 'Переведено', className: 'status-translated' },
  approved: { icon: '✅', text: 'Одобрено', className: 'status-approved' },
  edited: { icon: '✏️', text: 'Изменено', className: 'status-edited' },
};

export function StatusBadge({ status, showText = true }: BadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span class={`chapter-status ${config.className}`}>
      {config.icon}
      {showText && ` ${config.text}`}
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

