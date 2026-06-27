/**
 * Remap glossary entry UUID references when cloning a project.
 */

export function remapRelatedEntryIds(
  idMap: ReadonlyMap<string, string>,
  relatedEntryIds?: string[]
): string[] | undefined {
  if (!relatedEntryIds?.length) return undefined;
  const remapped = relatedEntryIds
    .map((id) => idMap.get(id))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return remapped.length > 0 ? remapped : undefined;
}

export function remapPrimaryLocationId(
  idMap: ReadonlyMap<string, string>,
  primaryLocationId?: string
): string | undefined {
  if (!primaryLocationId) return undefined;
  return idMap.get(primaryLocationId);
}
