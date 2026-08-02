import type { GlossaryEntry, GlossaryEntryType } from '../../types.js';

export type GlossaryTypeFilter = 'all' | GlossaryEntryType;

export function filterGlossaryEntriesByTypeAndSearch(
  entries: GlossaryEntry[],
  filter: GlossaryTypeFilter,
  search: string
): GlossaryEntry[] {
  const searchLower = search.toLowerCase();
  return entries.filter((entry) => {
    const matchesFilter = filter === 'all' || entry.type === filter;
    const matchesSearch =
      !search ||
      entry.original.toLowerCase().includes(searchLower) ||
      entry.translated.toLowerCase().includes(searchLower);
    return matchesFilter && matchesSearch;
  });
}
