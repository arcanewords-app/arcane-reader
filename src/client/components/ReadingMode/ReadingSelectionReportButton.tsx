import { createPortal } from 'preact/compat';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui';

const BUTTON_SIZE = 44;
const EDGE_PADDING = 8;
const GAP_BELOW_SELECTION = 8;

interface ReadingSelectionReportButtonProps {
  rect: DOMRect;
  onReport: () => void;
}

function clampPosition(rect: DOMRect): { top: number; left: number } {
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;

  const centerX = rect.left + rect.width / 2;
  let left = centerX - BUTTON_SIZE / 2;
  let top = rect.bottom + GAP_BELOW_SELECTION;

  const minLeft = viewportLeft + EDGE_PADDING;
  const maxLeft = viewportLeft + viewportWidth - BUTTON_SIZE - EDGE_PADDING;
  const minTop = viewportTop + EDGE_PADDING;
  const maxTop = viewportTop + viewportHeight - BUTTON_SIZE - EDGE_PADDING;

  left = Math.min(Math.max(left, minLeft), maxLeft);
  top = Math.min(Math.max(top, minTop), maxTop);

  return { top, left };
}

export function ReadingSelectionReportButton({
  rect,
  onReport,
}: ReadingSelectionReportButtonProps) {
  const { t } = useTranslation();
  const position = clampPosition(rect);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <button
      type="button"
      class="reading-selection-report-btn"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      aria-label={t('readingMode.reportSelectionAction')}
      title={t('readingMode.reportTranslation')}
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
        onReport();
      }}
    >
      <Icon name="flag" size="sm" />
    </button>,
    document.body
  );
}
