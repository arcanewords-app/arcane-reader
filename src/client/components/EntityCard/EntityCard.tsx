import { useState, useCallback, useRef } from 'preact/hooks';
import type { PublicEntity } from '../../types';
import {
  ESTIMATED_ENTITY_POPUP_HEIGHT,
  ESTIMATED_ENTITY_POPUP_WIDTH,
} from '../../hooks/anchoredPopupPlacement';
import { EntityPreviewBody } from '../EntityPreviewBody';
import { AnchoredCardPopup } from '../Home/AnchoredCardPopup';
import './EntityCard.css';

interface EntityCardProps {
  entity: PublicEntity;
  /** When true, renders as a compact card (author/translator). When false, can be used in picker grid. */
  compact?: boolean;
  /** Optional click handler (e.g. for selection in picker). */
  onClick?: () => void;
  /** Optional class name. */
  className?: string;
  /** Short line under the name, for example catalog vs own pseudonym. */
  caption?: string;
}

export function EntityCard({
  entity,
  compact = true,
  onClick,
  className = '',
  caption,
}: EntityCardProps) {
  const [showPopup, setShowPopup] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const previewTextRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => setShowPopup(true), []);
  const handleMouseLeave = useCallback(() => setShowPopup(false), []);
  const handleFocus = useCallback(() => setShowPopup(true), []);
  const handleBlur = useCallback(() => setShowPopup(false), []);

  const hasDescription = Boolean(entity.description?.trim());
  const isInteractive = Boolean(onClick);
  const popupOpen = showPopup && hasDescription;
  const tipId = `entity-card-tip-${entity.id}`;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onClick?.();
      }
    },
    [isInteractive, onClick]
  );

  return (
    <div
      ref={cardRef}
      class={`entity-card ${compact ? 'entity-card--compact' : ''} ${isInteractive ? 'entity-card--interactive' : ''} ${className}`.trim()}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-describedby={popupOpen ? tipId : undefined}
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
      <span class="entity-card__text">
        <span class="entity-card__name">{entity.name}</span>
        {caption ? <span class="entity-card__caption">{caption}</span> : null}
      </span>
      {popupOpen && (
        <AnchoredCardPopup
          open
          anchorRef={cardRef}
          estimatedHeight={ESTIMATED_ENTITY_POPUP_HEIGHT}
          estimatedWidth={ESTIMATED_ENTITY_POPUP_WIDTH}
          className="card-content-popup--entity"
          id={tipId}
          previewRef={previewTextRef}
        >
          <EntityPreviewBody
            name={entity.name}
            photoUrl={entity.photoUrl}
            description={entity.description}
            previewRef={previewTextRef}
          />
        </AnchoredCardPopup>
      )}
    </div>
  );
}
