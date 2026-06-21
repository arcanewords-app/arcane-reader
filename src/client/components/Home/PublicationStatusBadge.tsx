import { useTranslation } from 'react-i18next';
import type { TranslationStatus } from '../../types';
import './PublicationStatusBadge.css';

interface PublicationStatusBadgeProps {
  status: TranslationStatus;
}

const BADGE_LABEL_KEYS: Record<TranslationStatus, string> = {
  in_progress: 'publication.statusBadge.inProgress',
  complete: 'publication.statusBadge.complete',
  abandoned: 'publication.statusBadge.abandoned',
};

const BADGE_ARIA_KEYS: Record<TranslationStatus, string> = {
  in_progress: 'publication.statusBadgeAria.inProgress',
  complete: 'publication.statusBadgeAria.complete',
  abandoned: 'publication.statusBadgeAria.abandoned',
};

export function PublicationStatusBadge({ status }: PublicationStatusBadgeProps) {
  const { t } = useTranslation();

  return (
    <span
      class={`publication-status-badge publication-status-badge--${status}`}
      aria-label={t(BADGE_ARIA_KEYS[status])}
    >
      {t(BADGE_LABEL_KEYS[status])}
    </span>
  );
}
