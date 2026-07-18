export interface TextRangeAnchor {
  publicationId: string;
  chapterId: string;
  chapterNumber: number;
  startParagraph: number;
  startOffset: number;
  endParagraph: number;
  endOffset: number;
}

export interface AnchorRange {
  startParagraph: number;
  startOffset: number;
  endParagraph: number;
  endOffset: number;
}

const POSITION_SCALE = 1_000_000;

export function anchorToRange(anchor: AnchorRange): { start: number; end: number } {
  return {
    start: anchor.startParagraph * POSITION_SCALE + anchor.startOffset,
    end: anchor.endParagraph * POSITION_SCALE + anchor.endOffset,
  };
}

export function rangesOverlap(a: AnchorRange, b: AnchorRange): boolean {
  const aRange = anchorToRange(a);
  const bRange = anchorToRange(b);
  const aStart = Math.min(aRange.start, aRange.end);
  const aEnd = Math.max(aRange.start, aRange.end);
  const bStart = Math.min(bRange.start, bRange.end);
  const bEnd = Math.max(bRange.start, bRange.end);
  return aStart < bEnd && bStart < aEnd;
}

function findParagraphElement(node: Node | null, container: HTMLElement): HTMLElement | null {
  let element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
  while (element && element !== container) {
    if (element instanceof HTMLElement && element.hasAttribute('data-paragraph-index')) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function getParagraphIndex(paragraph: HTMLElement): number {
  return parseInt(paragraph.dataset.paragraphIndex ?? '-1', 10);
}

function getTextOffsetWithinParagraph(
  paragraph: HTMLElement,
  targetNode: Node,
  targetOffset: number
): number {
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  range.setEnd(targetNode, targetOffset);
  return range.toString().length;
}

export function normalizeAnchorRange(
  startParagraph: number,
  startOffset: number,
  endParagraph: number,
  endOffset: number
): AnchorRange | null {
  let normalizedStartParagraph = startParagraph;
  let normalizedStartOffset = startOffset;
  let normalizedEndParagraph = endParagraph;
  let normalizedEndOffset = endOffset;

  const forward =
    startParagraph < endParagraph || (startParagraph === endParagraph && startOffset <= endOffset);

  if (!forward) {
    normalizedStartParagraph = endParagraph;
    normalizedStartOffset = endOffset;
    normalizedEndParagraph = startParagraph;
    normalizedEndOffset = startOffset;
  }

  if (
    normalizedStartParagraph === normalizedEndParagraph &&
    normalizedStartOffset === normalizedEndOffset
  ) {
    return null;
  }

  return {
    startParagraph: normalizedStartParagraph,
    startOffset: normalizedStartOffset,
    endParagraph: normalizedEndParagraph,
    endOffset: normalizedEndOffset,
  };
}

export function getAnchorFromSelection(
  container: HTMLElement,
  context: { publicationId: string; chapterId: string; chapterNumber: number }
): TextRangeAnchor | null {
  if (typeof window === 'undefined') return null;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const startParagraph = findParagraphElement(range.startContainer, container);
  const endParagraph = findParagraphElement(range.endContainer, container);
  if (!startParagraph || !endParagraph) return null;

  const startParagraphIndex = getParagraphIndex(startParagraph);
  const endParagraphIndex = getParagraphIndex(endParagraph);
  if (startParagraphIndex < 0 || endParagraphIndex < 0) return null;

  const startOffset = getTextOffsetWithinParagraph(
    startParagraph,
    range.startContainer,
    range.startOffset
  );
  const endOffset = getTextOffsetWithinParagraph(endParagraph, range.endContainer, range.endOffset);

  const normalized = normalizeAnchorRange(
    startParagraphIndex,
    startOffset,
    endParagraphIndex,
    endOffset
  );
  if (!normalized) return null;

  return {
    publicationId: context.publicationId,
    chapterId: context.chapterId,
    chapterNumber: context.chapterNumber,
    startParagraph: normalized.startParagraph,
    startOffset: normalized.startOffset,
    endParagraph: normalized.endParagraph,
    endOffset: normalized.endOffset,
  };
}

export function getParagraphElement(
  container: HTMLElement,
  paragraphIndex: number
): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-paragraph-index="${paragraphIndex}"]`);
}

export function getParagraphTextLengthByIndex(
  container: HTMLElement,
  paragraphIndex: number
): number {
  const paragraph = getParagraphElement(container, paragraphIndex);
  if (!paragraph) return 0;
  return paragraph.textContent?.length ?? 0;
}
