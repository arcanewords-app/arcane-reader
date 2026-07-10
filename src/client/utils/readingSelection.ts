/** Max length for translation report description (matches API). */
export const REPORT_DESCRIPTION_MAX_LENGTH = 5000;

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
