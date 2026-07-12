/**
 * PostgREST pagination helpers — extracted from supabaseDatabase for unit testing.
 */

/** Compute page start offsets for fetching up to totalRows in pageSize chunks. */
export function pageOffsets(totalRows: number, pageSize: number): number[] {
  if (totalRows <= 0 || pageSize <= 0) return [];
  const offsets: number[] = [];
  for (let offset = 0; offset < totalRows; offset += pageSize) {
    offsets.push(offset);
  }
  return offsets;
}

/**
 * Iterate fixed-size pages until a fetch returns fewer than pageSize rows.
 * fetchPage receives (offset, pageSize) and returns rows for that page.
 */
export async function paginateUntilShortPage<T>(
  fetchPage: (offset: number, pageSize: number) => Promise<T[]>,
  pageSize: number,
  maxPages = 1000
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchPage(offset, pageSize);
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

/** Inclusive range end for PostgREST .range(from, to) */
export function rangeEnd(offset: number, limit: number): number {
  return offset + limit - 1;
}
