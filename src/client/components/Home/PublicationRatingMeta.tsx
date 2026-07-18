import { useTranslation } from 'react-i18next';
import { Icon } from '../ui';
import {
  formatRatingAvg,
  shouldDisplayPublicationRating,
} from '../../../shared/publication-rating';
import './PublicationRatingMeta.css';

interface PublicationRatingMetaProps {
  ratingAvg: number | null | undefined;
  ratingCount: number | null | undefined;
}

export function PublicationRatingMeta({ ratingAvg, ratingCount }: PublicationRatingMetaProps) {
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
    <>
      <span class="publication-card-meta-sep">·</span>
      <span
        class="publication-card-rating"
        title={t('rating.avgAria', { avg: formatted, count })}
        aria-label={t('rating.avgAria', { avg: formatted, count })}
      >
        <Icon name="star" size="sm" aria-hidden />
        <span>{formatted}</span>
      </span>
    </>
  );
}
