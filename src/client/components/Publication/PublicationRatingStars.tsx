import { Icon } from '../ui';
import { ratingToStarIcons } from '../../../shared/publication-rating';
import './PublicationRatingStars.css';

interface PublicationRatingStarsProps {
  avg: number;
  size?: 'sm' | 'md';
}

export function PublicationRatingStars({ avg, size = 'md' }: PublicationRatingStarsProps) {
  const icons = ratingToStarIcons(avg);

  return (
    <span class={`publication-rating-stars publication-rating-stars--${size}`} aria-hidden>
      {icons.map((name, index) => (
        <Icon
          key={index}
          name={name}
          size={size === 'sm' ? 'sm' : 'md'}
          className={name === 'star_border' ? 'is-empty' : 'is-filled'}
        />
      ))}
    </span>
  );
}
