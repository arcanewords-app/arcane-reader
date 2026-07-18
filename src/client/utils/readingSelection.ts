/** Max length for translation report description (matches API). */
export const REPORT_DESCRIPTION_MAX_LENGTH = 5000;

export const READING_SELECTION_TOOLBAR_BUTTON_SIZE = 44;
export const READING_SELECTION_TOOLBAR_GAP = 8;
export const READING_SELECTION_TOOLBAR_PADDING = 4;
export const READING_SELECTION_TOOLBAR_EDGE_GAP = 8;
export const READING_SELECTION_TOOLBAR_EDGE_PADDING = 8;

export interface ReadingSelectionAction {
  id: string;
  icon: string;
  labelKey: string;
  onClick: () => void;
}

export interface ReadingSelectionToolbarSize {
  width: number;
  height: number;
}

export interface ReadingSelectionToolbarPosition {
  top: number;
  left: number;
  placement: 'above' | 'below';
}

export interface ReadingSelectionViewportBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ReadingSelectionSnapshot {
  text: string;
  rect: DOMRect;
  wasTruncated: boolean;
}

export function isNodeInside(container: HTMLElement, node: Node | null): boolean {
  if (!node) return false;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  if (!element) return false;
  return container.contains(element);
}

function getRangeRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

/**
 * Returns trimmed selected text if the selection is non-collapsed and fully inside container.
 */
export function getSelectionTextInContainer(container: HTMLElement): string | null {
  const snapshot = getSelectionSnapshotInContainer(container);
  return snapshot?.text ?? null;
}

/**
 * Returns selected text, bounding rect, and truncation flag for toolbar positioning.
 */
export function getSelectionSnapshotInContainer(
  container: HTMLElement
): ReadingSelectionSnapshot | null {
  if (typeof window === 'undefined') return null;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;

  if (
    !isNodeInside(container, selection.anchorNode) ||
    !isNodeInside(container, selection.focusNode)
  ) {
    return null;
  }

  const raw = selection.toString();
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const rect = getRangeRect(selection);
  if (!rect) return null;

  const wasTruncated = trimmed.length > REPORT_DESCRIPTION_MAX_LENGTH;
  const text = wasTruncated ? trimmed.slice(0, REPORT_DESCRIPTION_MAX_LENGTH) : trimmed;

  return { text, rect, wasTruncated };
}

/** Format selected fragment for the report textarea (guillemets + blank line for user comment). */
export function formatReportPrefill(selectedText: string): string {
  const wrapperOverhead = 4; // «» + two newlines
  const maxContentLength = Math.max(0, REPORT_DESCRIPTION_MAX_LENGTH - wrapperOverhead);
  const normalized = selectedText.trim().slice(0, maxContentLength);
  if (!normalized) return '';
  return `«${normalized}»\n\n`.slice(0, REPORT_DESCRIPTION_MAX_LENGTH);
}

export function clearBrowserSelection(): void {
  if (typeof window === 'undefined') return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  selection.removeAllRanges();
}

export function getReadingSelectionToolbarSize(actionCount: number): ReadingSelectionToolbarSize {
  const safeCount = Math.max(0, actionCount);
  if (safeCount === 0) {
    return { width: 0, height: 0 };
  }

  const width =
    READING_SELECTION_TOOLBAR_PADDING * 2 +
    safeCount * READING_SELECTION_TOOLBAR_BUTTON_SIZE +
    Math.max(0, safeCount - 1) * READING_SELECTION_TOOLBAR_GAP;
  const height = READING_SELECTION_TOOLBAR_PADDING * 2 + READING_SELECTION_TOOLBAR_BUTTON_SIZE;

  return { width, height };
}

export function getReadingSelectionToolbarPosition(
  rect: DOMRect,
  toolbarSize: ReadingSelectionToolbarSize,
  options?: {
    gap?: number;
    edgePadding?: number;
    viewport?: ReadingSelectionViewportBounds;
  }
): ReadingSelectionToolbarPosition {
  const gap = options?.gap ?? READING_SELECTION_TOOLBAR_EDGE_GAP;
  const edgePadding = options?.edgePadding ?? READING_SELECTION_TOOLBAR_EDGE_PADDING;
  const viewport = options?.viewport ?? {
    left: 0,
    top: 0,
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  };

  const minLeft = viewport.left + edgePadding;
  const maxLeft = viewport.left + viewport.width - toolbarSize.width - edgePadding;
  const minTop = viewport.top + edgePadding;
  const maxTop = viewport.top + viewport.height - toolbarSize.height - edgePadding;

  const centerX = rect.left + rect.width / 2;
  let left = centerX - toolbarSize.width / 2;
  left = Math.min(Math.max(left, minLeft), maxLeft);

  const aboveTop = rect.top - gap - toolbarSize.height;
  let placement: 'above' | 'below' = 'above';
  let top = aboveTop;

  if (aboveTop < minTop) {
    placement = 'below';
    top = rect.bottom + gap;
  }

  top = Math.min(Math.max(top, minTop), maxTop);

  return { top, left, placement };
}
