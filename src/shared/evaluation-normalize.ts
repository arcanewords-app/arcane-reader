/**
 * Shared normalization for translation evaluation issues (Lab + Critic).
 */

export interface EvaluationIssue {
  paragraphIndex: number;
  dimension: 'accuracy' | 'fluency' | 'glossary' | 'style';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  description: string;
}

export interface ChapterCriticResult {
  summary: string;
  strengths: string;
  issues: EvaluationIssue[];
}

const VALID_DIMENSIONS = new Set(['accuracy', 'fluency', 'glossary', 'style']);
const VALID_SEVERITIES = new Set(['CRITICAL', 'MAJOR', 'MINOR']);

function normalizeSeverity(value: unknown): EvaluationIssue['severity'] {
  const upper = String(value ?? 'MINOR').toUpperCase();
  if (VALID_SEVERITIES.has(upper)) return upper as EvaluationIssue['severity'];
  return 'MINOR';
}

function normalizeDimension(value: unknown): EvaluationIssue['dimension'] {
  const lower = String(value ?? 'accuracy').toLowerCase();
  if (VALID_DIMENSIONS.has(lower)) return lower as EvaluationIssue['dimension'];
  return 'accuracy';
}

export function normalizeIssues(raw: unknown): EvaluationIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      paragraphIndex: typeof row.paragraphIndex === 'number' ? row.paragraphIndex : 0,
      dimension: normalizeDimension(row.dimension),
      severity: normalizeSeverity(row.severity),
      description: String(row.description ?? row.text ?? ''),
    };
  });
}

export function normalizeCriticResult(raw: unknown): ChapterCriticResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    summary: String(row.summary ?? ''),
    strengths: String(row.strengths ?? ''),
    issues: normalizeIssues(row.issues),
  };
}

/** Group issues by paragraph index; out-of-range → key -1 (general). */
export function groupIssuesByParagraph(
  issues: EvaluationIssue[],
  paragraphCount: number
): Map<number, EvaluationIssue[]> {
  const map = new Map<number, EvaluationIssue[]>();
  for (const issue of issues) {
    const idx = issue.paragraphIndex;
    const key = idx >= 0 && idx < paragraphCount ? idx : -1;
    const list = map.get(key) ?? [];
    list.push(issue);
    map.set(key, list);
  }
  return map;
}
