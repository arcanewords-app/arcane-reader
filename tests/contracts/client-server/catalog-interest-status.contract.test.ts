import { describe, expect, it } from 'vitest';
import { CATALOG_INTEREST_STATUSES } from '../../../src/api/schemas/translationRequestBoard.js';
import type { CatalogTranslationRequestInterestStatus } from '../../../src/client/types/index.js';
import { loadFixture } from '../helpers/loadFixture.js';

const CLIENT_INTEREST_STATUSES: CatalogTranslationRequestInterestStatus[] = [
  'interested',
  'working',
  'withdrawn',
];

describe('catalog interest status client ↔ server contract', () => {
  it('freezes statuses against Zod enum and client union', () => {
    const fixture = loadFixture('catalog-interest-statuses.json') as { statuses: string[] };
    expect(fixture.statuses).toEqual([...CATALOG_INTEREST_STATUSES]);
    expect(fixture.statuses).toEqual(CLIENT_INTEREST_STATUSES);
  });
});
