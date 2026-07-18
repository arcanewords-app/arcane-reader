import { useTranslation } from 'react-i18next';
import { Icon } from '../ui';
import {
  formatRatingAvg,
  shouldDisplayPublicationRating,
} from '../../../shared/publication-rating';
import './PublicationRatingCoverBadge.css';

interface PublicationRatingCoverBadgeProps {
  ratingAvg: number | null | undefined;
  ratingCount: number | null | undefined;
}

export function PublicationRatingCoverBadge({
  ratingAvg,
  ratingCount,
}: PublicationRatingCoverBadgeProps) {
  const { t } = useTranslation();
  const count = ratingCount ?? 0;

  if (!shouldDisplayPublicationRating(count)) {
    return null;
  }

  const formatted = formatRatingAvg(ratingAvg);
  if (!formatted) {
    return null;
  }

  return (
    <span
      class="publication-rating-cover-badge"
      title={t('rating.avgAria', { avg: formatted, count })}
      aria-label={t('rating.avgAria', { avg: formatted, count })}
    >
      <Icon name="star" size="sm" className="publication-rating-cover-badge__icon" />
      <span>{formatted}</span>
    </span>
  );
}
