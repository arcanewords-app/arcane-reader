import { useState, useCallback } from 'preact/hooks';
import { route } from 'preact-router';
import type { PublicEntity } from '../../types';
import { api } from '../../api/client';
import '../../styles/components/card-content-popup.css';
import './EntityChip.css';

interface EntityChipProps {
  display: string;
  entityId: string | null | undefined;
  routeParam: 'author' | 'translator';
  /** When provided, popup shows instantly without fetch on hover. */
  entity?: PublicEntity | null;
}

export function EntityChip({ display, entityId, routeParam, entity: entityProp }: EntityChipProps) {
  const [entityFetched, setEntityFetched] = useState<PublicEntity | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  const entity = entityProp ?? entityFetched;
  const label = display || '—';
  const hasDescription = Boolean(entity?.description?.trim());

  const handleMouseEnter = useCallback(() => {
    setShowPopup(true);
    if (entityId && !entityProp && !entityFetched) {
      api.getPublicEntityById(entityId).then((e) => {
        setEntityFetched(e ?? null);
      });
    }
  }, [entityId, entityProp, entityFetched]);

  const handleMouseLeave = useCallback(() => {
    setShowPopup(false);
  }, []);

  const handleFocus = useCallback(() => {
    setShowPopup(true);
    if (entityId && !entityProp && !entityFetched) {
      api.getPublicEntityById(entityId).then((e) => {
        setEntityFetched(e ?? null);
      });
    }
  }, [entityId, entityProp, entityFetched]);

  const handleBlur = useCallback(() => {
    setShowPopup(false);
  }, []);

  const handleClick = useCallback(
    (e: Event) => {
      if (entityId) {
        e.stopPropagation();
        route(`/catalog?${routeParam}=${entityId}`);
      }
    },
    [entityId, routeParam]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (entityId && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        route(`/catalog?${routeParam}=${entityId}`);
      }
    },
    [entityId, routeParam]
  );

  if (entityId) {
    return (
      <div
        class="entity-chip-wrapper"
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
        >
          {label}
        </button>
        {showPopup && hasDescription && (
          <div class="card-content-popup" role="tooltip">
            {entity!.description}
          </div>
        )}
      </div>
    );
  }

  return <span class="publication-card-chip publication-card-chip--static">{label}</span>;
}
