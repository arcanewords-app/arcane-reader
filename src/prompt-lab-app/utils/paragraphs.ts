/** Client-side paragraph helpers for Review compare view. */

export { stripParagraphMarkers, textToDisplayParagraphs } from '@engine/utils/para-markers.js';

export type DisplayParagraph = { id?: string; text: string };

export function alignParagraphRows(
  left: DisplayParagraph[],
  right: DisplayParagraph[]
): { left: DisplayParagraph[]; right: DisplayParagraph[]; mismatch: boolean } {
  const max = Math.max(left.length, right.length);
  const mismatch = left.length !== right.length;
  const leftRows: DisplayParagraph[] = [];
  const rightRows: DisplayParagraph[] = [];

  for (let i = 0; i < max; i++) {
    leftRows.push(left[i] ?? { text: '' });
    rightRows.push(right[i] ?? { text: '' });
  }

  return { left: leftRows, right: rightRows, mismatch };
}

export function resolveRunContent(
  run: {
    inputSnapshot: { sourceText: string; translatedText?: string };
    output: { text?: string };
  },
  mode: 'source' | 'output'
): string {
  if (mode === 'source') return run.inputSnapshot.sourceText ?? '';
  return run.output.text ?? run.inputSnapshot.translatedText ?? '';
}
