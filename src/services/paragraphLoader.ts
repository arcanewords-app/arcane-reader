/**
 * Paragraph loading helpers (PostgREST 1000-row pagination).
 */

export type ParagraphRow = Record<string, unknown> & {
  chapter_id: string;
  index?: number;
};

/** Group raw DB paragraph rows by chapter_id (order within chapter not guaranteed). */
export function groupParagraphRowsByChapterId(rows: ParagraphRow[]): Map<string, ParagraphRow[]> {
  const map = new Map<string, ParagraphRow[]>();
  for (const row of rows) {
    const chapterId = row.chapter_id;
    if (!chapterId) continue;
    const list = map.get(chapterId);
    if (list) {
      list.push(row);
    } else {
      map.set(chapterId, [row]);
    }
  }
  return map;
}

/** Compute pagination offsets until all rows are fetched. */
export function paragraphPageOffsets(totalRows: number, pageSize: number): number[] {
  if (totalRows <= 0 || pageSize <= 0) return [];
  const offsets: number[] = [];
  for (let offset = 0; offset < totalRows; offset += pageSize) {
    offsets.push(offset);
  }
  return offsets;
}
