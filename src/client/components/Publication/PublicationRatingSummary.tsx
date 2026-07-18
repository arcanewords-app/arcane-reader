import { useTranslation } from 'react-i18next';
import {
  formatRatingAvg,
  shouldDisplayPublicationRating,
} from '../../../shared/publication-rating';
import { Icon } from '../ui';
import { PublicationRatingStars } from './PublicationRatingStars';
import './PublicationRatingSummary.css';

export type PublicationRatingEligibility =
  'eligible' | 'guest' | 'owner' | 'not_read' | 'not_found';

interface PublicationRatingSummaryProps {
  ratingAvg: number | null | undefined;
  ratingCount: number | null | undefined;
  userScore: number | null;
  eligibility: PublicationRatingEligibility;
  onRateClick: () => void;
  onLoginClick: () => void;
}

export function PublicationRatingSummary({
  ratingAvg,
  ratingCount,
  userScore,
  eligibility,
  onRateClick,
  onLoginClick,
}: PublicationRatingSummaryProps) {
  const { t } = useTranslation();
  const count = ratingCount ?? 0;
  const showAggregate = shouldDisplayPublicationRating(count) && ratingAvg != null;
  const formattedAvg = formatRatingAvg(ratingAvg);

  const handleCta = () => {
    if (eligibility === 'guest') {
      onLoginClick();
      return;
    }
    if (eligibility === 'eligible') {
      onRateClick();
    }
  };

  const ctaLabel = userScore != null ? t('rating.change') : t('rating.rate');

  const ctaDisabled = eligibility === 'not_read' || eligibility === 'owner';
  const ctaTitle =
    eligibility === 'not_read'
      ? t('rating.readFirst')
      : eligibility === 'owner'
        ? t('rating.ownWork')
        : undefined;

  return (
    <section class="publication-rating-summary" aria-label={t('rating.summary')}>
      {showAggregate && formattedAvg && (
        <div class="publication-rating-summary-row">
          <PublicationRatingStars avg={ratingAvg!} />
          <span class="publication-rating-summary-avg">{formattedAvg}</span>
          <span class="publication-rating-summary-sep">·</span>
          <span class="publication-rating-summary-count">{t('rating.count', { count })}</span>
        </div>
      )}

      {userScore != null && eligibility === 'eligible' && (
        <p class="publication-rating-summary-user">{t('rating.yourScore', { score: userScore })}</p>
      )}

      {eligibility === 'owner' && (
        <p class="publication-rating-summary-hint">{t('rating.ownWork')}</p>
      )}

      {eligibility !== 'owner' && (
        <button
          type="button"
          class="publication-page-toc-btn publication-rating-summary-cta"
          onClick={handleCta}
          disabled={ctaDisabled}
          title={ctaTitle}
        >
          <Icon name="star" size="sm" />
          <span>{eligibility === 'guest' ? t('rating.rate') : ctaLabel}</span>
        </button>
      )}
    </section>
  );
}
