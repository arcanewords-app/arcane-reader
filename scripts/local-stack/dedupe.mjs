/**
 * Local-load remaps every prod user FK onto the seed author.
 * Collapse rows that would then trip unique/limit constraints.
 */

export const MAX_ACTIVE_TRANSLATOR_PSEUDONYMS = 3;

/**
 * Keep at most `maxActive` active translator entities per owner.
 * Extra rows stay in the dump (publications FK translator_entity_id) with status blocked.
 * Prefer entities referenced by publications, then original order.
 */
export function blockExcessTranslatorPseudonyms(
  entities,
  referencedTranslatorIds = new Set(),
  maxActive = MAX_ACTIVE_TRANSLATOR_PSEUDONYMS
) {
  const referenced =
    referencedTranslatorIds instanceof Set
      ? referencedTranslatorIds
      : new Set(referencedTranslatorIds);

  const byOwner = new Map();
  entities.forEach((row, index) => {
    if (row?.kind !== 'translator' || row.status !== 'active' || !row.owner_user_id) return;
    const list = byOwner.get(row.owner_user_id) ?? [];
    list.push(index);
    byOwner.set(row.owner_user_id, list);
  });

  const next = entities.map((row) => ({ ...row }));
  for (const indices of byOwner.values()) {
    if (indices.length <= maxActive) continue;
    const ranked = [...indices].sort((a, b) => {
      const aRef = referenced.has(next[a].id) ? 0 : 1;
      const bRef = referenced.has(next[b].id) ? 0 : 1;
      if (aRef !== bRef) return aRef - bRef;
      return a - b;
    });
    for (const index of ranked.slice(maxActive)) {
      next[index] = { ...next[index], status: 'blocked' };
    }
  }
  return next;
}

function interestScore(row) {
  let score = 0;
  if (row.translator_entity_id) score += 2;
  if (row.project_id) score += 1;
  return score;
}

/**
 * After remap, UNIQUE (request_id, user_id) would collide.
 * Keep one row per pair; prefer a row that has translator_entity_id / project_id.
 */
export function dedupeCatalogInterests(rows) {
  const best = new Map();
  for (const row of rows) {
    const key = `${row.request_id}\0${row.user_id}`;
    const prev = best.get(key);
    if (!prev || interestScore(row) > interestScore(prev.row)) {
      best.set(key, { row });
    }
  }
  const chosen = new Set([...best.values()].map((entry) => entry.row));
  return rows.filter((row) => chosen.has(row));
}

export function collectTranslatorEntityIds(publications) {
  const ids = new Set();
  for (const row of publications) {
    if (row?.translator_entity_id) ids.add(row.translator_entity_id);
  }
  return ids;
}
