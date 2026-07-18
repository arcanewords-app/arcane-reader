import { createPortal } from 'preact/compat';
import { useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import {
  getReadingSelectionToolbarPosition,
  getReadingSelectionToolbarSize,
  type ReadingSelectionAction,
} from '../../utils/readingSelection';
import { Icon } from '../ui';

interface ReadingSelectionToolbarProps {
  rect: DOMRect;
  actions: ReadingSelectionAction[];
}

function getViewportBounds(): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

export function ReadingSelectionToolbar({ rect, actions }: ReadingSelectionToolbarProps) {
  const { t } = useTranslation();

  const toolbarSize = useMemo(
    () => getReadingSelectionToolbarSize(actions.length),
    [actions.length]
  );
  const position = useMemo(
    () =>
      getReadingSelectionToolbarPosition(rect, toolbarSize, {
        viewport: getViewportBounds(),
      }),
    [rect, toolbarSize]
  );

  if (typeof document === 'undefined' || actions.length === 0) return null;

  return createPortal(
    <div
      class="reading-selection-toolbar"
      role="toolbar"
      aria-label={t('readingMode.selectionToolbarLabel')}
      data-placement={position.placement}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          class="reading-selection-toolbar-btn"
          aria-label={t(action.labelKey)}
          title={t(action.labelKey)}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            action.onClick();
          }}
        >
          <Icon name={action.icon} size="sm" />
        </button>
      ))}
    </div>,
    document.body
  );
}
