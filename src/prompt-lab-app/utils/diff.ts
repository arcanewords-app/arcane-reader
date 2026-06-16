/** Simple line-based diff for prompt comparison. */

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
  lineNum?: number;
}

export function computeLineDiff(baseline: string, current: string): DiffLine[] {
  const baseLines = baseline.split('\n');
  const currLines = current.split('\n');
  const result: DiffLine[] = [];
  const maxLen = Math.max(baseLines.length, currLines.length);

  for (let i = 0; i < maxLen; i++) {
    const base = baseLines[i];
    const curr = currLines[i];
    if (base === curr) {
      if (base !== undefined) {
        result.push({ type: 'same', text: base, lineNum: i + 1 });
      }
    } else {
      if (base !== undefined) {
        result.push({ type: 'removed', text: base, lineNum: i + 1 });
      }
      if (curr !== undefined) {
        result.push({ type: 'added', text: curr, lineNum: i + 1 });
      }
    }
  }
  return result;
}

export function isTextModified(baseline: string, current: string): boolean {
  return baseline.trim() !== current.trim();
}

export function truncatePreview(text: string, maxLen = 280): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}
