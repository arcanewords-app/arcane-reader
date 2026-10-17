import { useState, useCallback, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import type { PublicEntity } from '../../types';
import { api } from '../../api/client';
import { ESTIMATED_ENTITY_POPUP_HEIGHT } from '../../hooks/anchoredPopupPlacement';
import { useAnchoredPopup } from '../../hooks/useAnchoredPopup';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import { buildCatalogEntityFilterUrl } from '../../utils/catalogRoutes';
import '../../styles/components/card-content-popup.css';
import './EntityChip.css';

interface EntityChipProps {
  display: string;
  entityId: string | null | undefined;
  routeParam: 'author' | 'translator';
  /** When provided, popup shows instantly without fetch on hover. */
  entity?: PublicEntity | null;
}

function entityHasPreview(entity: PublicEntity | null | undefined): boolean {
  if (!entity) return false;
  return Boolean(entity.photoUrl?.trim() || entity.description?.trim());
}

export function EntityChip({ display, entityId, routeParam, entity: entityProp }: EntityChipProps) {
  const [entityFetched, setEntityFetched] = useState<PublicEntity | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const previewTextRef = useRef<HTMLDivElement>(null);

  const entity = entityProp ?? entityFetched;
  const label = display || '—';
  const canShowPreview = entityHasPreview(entity);
  const popupOpen = showPopup && canShowPreview;
  const hasBio = Boolean(entity?.description?.trim());
  const placement = useAnchoredPopup(wrapperRef, popupOpen, {
    estimatedHeight: ESTIMATED_ENTITY_POPUP_HEIGHT,
  });
  const isBioTruncated = useIsTruncated(previewTextRef, popupOpen && hasBio);

  const ensureEntity = useCallback(() => {
    if (entityId && !entityProp && !entityFetched) {
      api.getPublicEntityById(entityId).then((e) => {
        setEntityFetched(e ?? null);
      });
    }
  }, [entityId, entityProp, entityFetched]);

  const handleMouseEnter = useCallback(() => {
    setShowPopup(true);
    ensureEntity();
  }, [ensureEntity]);

  const handleMouseLeave = useCallback(() => {
    setShowPopup(false);
  }, []);

  const handleFocus = useCallback(() => {
    setShowPopup(true);
    ensureEntity();
  }, [ensureEntity]);

  const handleBlur = useCallback(() => {
    setShowPopup(false);
  }, []);

  const handleClick = useCallback(
    (e: Event) => {
      if (entityId) {
        e.stopPropagation();
        route(buildCatalogEntityFilterUrl(routeParam, entityId));
      }
    },
    [entityId, routeParam]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (entityId && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        route(buildCatalogEntityFilterUrl(routeParam, entityId));
      }
    },
    [entityId, routeParam]
  );

  if (entityId) {
    const previewName = entity?.name?.trim() || label;
    const initial = previewName.charAt(0).toUpperCase() || '?';
    const placementClass = [
      `card-content-popup--${placement.vertical}`,
      `card-content-popup--align-${placement.horizontal}`,
    ].join(' ');

    return (
      <div
        ref={wrapperRef}
        class={`entity-chip-wrapper${popupOpen ? ' is-popup-open' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          type="button"
          class="publication-card-chip publication-card-chip--interactive"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-describedby={popupOpen ? `entity-chip-tip-${entityId}` : undefined}
        >
          {label}
        </button>
        {popupOpen && entity && (
          <div
            id={`entity-chip-tip-${entityId}`}
            class={`card-content-popup card-content-popup--entity${isBioTruncated ? ' is-truncated' : ''} ${placementClass}`}
            role="tooltip"
          >
            <div class="card-content-popup__avatar" aria-hidden="true">
              {entity.photoUrl?.trim() ? (
                <img
                  src={entity.photoUrl}
                  alt=""
                  class="card-content-popup__photo"
                  loading="lazy"
                />
              ) : (
                <div class="card-content-popup__placeholder">{initial}</div>
              )}
            </div>
            <div class="card-content-popup__body">
              <div class="card-content-popup__name">{previewName}</div>
              {hasBio ? (
                <div class="card-content-popup__preview-text" ref={previewTextRef}>
                  {entity.description}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  }

  return <span class="publication-card-chip publication-card-chip--static">{label}</span>;
}
