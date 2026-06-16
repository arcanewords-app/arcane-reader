/** Client-side paragraph helpers for Review compare view. */

const PARA_MARKER_RE = /--para:[^\n]*?--/g;

export function stripParagraphMarkers(text: string): string {
  return text.replace(PARA_MARKER_RE, '').trim();
}

export interface DisplayParagraph {
  id?: string;
  text: string;
}

export function textToDisplayParagraphs(text: string): DisplayParagraph[] {
  if (!text.trim()) return [];

  const hasMarkers = /--para:[^\n]*?--/.test(text);
  if (hasMarkers) {
    const results: DisplayParagraph[] = [];
    const re = /--para:([^\n]*?)--/g;
    let match: RegExpExecArray | null;
    let lastEnd = 0;
    while ((match = re.exec(text)) !== null) {
      if (results.length > 0) {
        results[results.length - 1].text = text.slice(lastEnd, match.index).trim();
      }
      results.push({ id: match[1].trim(), text: '' });
      lastEnd = match.index + match[0].length;
    }
    if (results.length > 0) {
      results[results.length - 1].text = text.slice(lastEnd).trim();
    }
    if (results.length > 0) return results;
  }

  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({ id: `auto_${i}`, text: stripParagraphMarkers(p) }));
}

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
