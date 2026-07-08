import { useState, useCallback } from 'preact/hooks';
import type { PublicEntity } from '../../types';
import '../../styles/components/card-content-popup.css';
import './EntityCard.css';

interface EntityCardProps {
  entity: PublicEntity;
  /** When true, renders as a compact card (author/translator). When false, can be used in picker grid. */
  compact?: boolean;
  /** Optional click handler (e.g. for selection in picker). */
  onClick?: () => void;
  /** Optional class name. */
  className?: string;
}

export function EntityCard({ entity, compact = true, onClick, className = '' }: EntityCardProps) {
  const [showPopup, setShowPopup] = useState(false);

  const handleMouseEnter = useCallback(() => setShowPopup(true), []);
  const handleMouseLeave = useCallback(() => setShowPopup(false), []);
  const handleFocus = useCallback(() => setShowPopup(true), []);
  const handleBlur = useCallback(() => setShowPopup(false), []);

  const hasDescription = Boolean(entity.description?.trim());
  const isInteractive = Boolean(onClick);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onClick?.();
      }
    },
    [isInteractive, onClick]
  );

  const content = (
    <div
      class={`entity-card ${compact ? 'entity-card--compact' : ''} ${isInteractive ? 'entity-card--interactive' : ''} ${className}`.trim()}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <div class="entity-card__avatar">
        {entity.photoUrl ? (
          <img src={entity.photoUrl} alt="" class="entity-card__photo" />
        ) : (
          <div class="entity-card__placeholder" aria-hidden="true">
            {entity.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <span class="entity-card__name">{entity.name}</span>
      {hasDescription && showPopup && (
        <div class="card-content-popup" role="tooltip">
          {entity.description}
        </div>
      )}
    </div>
  );

  return content;
}
