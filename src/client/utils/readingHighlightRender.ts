import {
  getParagraphElement,
  getParagraphTextLengthByIndex,
  type AnchorRange,
} from './readingTextAnchors.js';
import type { StoredHighlight } from './readingHighlightsStorage.js';

function getLastTextNode(root: Node): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    last = current as Text;
    current = walker.nextNode();
  }
  return last;
}

function setRangeBoundary(
  range: Range,
  paragraph: HTMLElement,
  offset: number,
  isStart: boolean
): boolean {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode() as Text | null;

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      if (isStart) range.setStart(node, remaining);
      else range.setEnd(node, remaining);
      return true;
    }
    remaining -= length;
    node = walker.nextNode() as Text | null;
  }

  const lastText = getLastTextNode(paragraph);
  if (!lastText) return false;
  const endPos = lastText.textContent?.length ?? 0;
  if (isStart) range.setStart(lastText, endPos);
  else range.setEnd(lastText, endPos);
  return true;
}

function wrapRange(container: HTMLElement, range: AnchorRange): void {
  const startParagraph = getParagraphElement(container, range.startParagraph);
  const endParagraph = getParagraphElement(container, range.endParagraph);
  if (!startParagraph || !endParagraph) return;

  const domRange = document.createRange();
  if (!setRangeBoundary(domRange, startParagraph, range.startOffset, true)) return;
  if (!setRangeBoundary(domRange, endParagraph, range.endOffset, false)) return;
  if (domRange.collapsed) return;

  const mark = document.createElement('span');
  mark.className = 'reader-highlight';
  mark.setAttribute('role', 'mark');
  try {
    domRange.surroundContents(mark);
  } catch {
    const contents = domRange.extractContents();
    mark.appendChild(contents);
    domRange.insertNode(mark);
  }
}

function expandHighlightSegments(
  container: HTMLElement,
  highlight: StoredHighlight
): AnchorRange[] {
  const { sp, so, ep, eo } = highlight;
  if (sp === ep) {
    return [{ startParagraph: sp, startOffset: so, endParagraph: ep, endOffset: eo }];
  }

  const segments: AnchorRange[] = [
    {
      startParagraph: sp,
      startOffset: so,
      endParagraph: sp,
      endOffset: getParagraphTextLengthByIndex(container, sp),
    },
  ];

  for (let paragraph = sp + 1; paragraph < ep; paragraph++) {
    segments.push({
      startParagraph: paragraph,
      startOffset: 0,
      endParagraph: paragraph,
      endOffset: getParagraphTextLengthByIndex(container, paragraph),
    });
  }

  segments.push({
    startParagraph: ep,
    startOffset: 0,
    endParagraph: ep,
    endOffset: eo,
  });

  return segments.filter((segment) => segment.endOffset > segment.startOffset);
}

export function unwrapHighlightMarks(container: HTMLElement): void {
  container.querySelectorAll('.reader-highlight').forEach((highlightEl) => {
    const parent = highlightEl.parentNode;
    if (!parent) return;
    while (highlightEl.firstChild) parent.insertBefore(highlightEl.firstChild, highlightEl);
    parent.removeChild(highlightEl);
    parent.normalize();
  });
}

export function applyHighlightsToContainer(
  container: HTMLElement,
  highlights: StoredHighlight[]
): void {
  unwrapHighlightMarks(container);
  for (const highlight of highlights) {
    for (const segment of expandHighlightSegments(container, highlight)) {
      wrapRange(container, segment);
    }
  }
}
