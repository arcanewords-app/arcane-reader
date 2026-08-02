import { describe, expect, it } from 'vitest';
import { CATALOG_REQUEST_STATUSES } from '../../../src/api/schemas/catalogRequests.js';
import type { CatalogTranslationRequestStatus } from '../../../src/client/types/index.js';
import { loadFixture } from '../helpers/loadFixture.js';

const CLIENT_CATALOG_STATUSES: CatalogTranslationRequestStatus[] = [
  'pending',
  'reviewed',
  'accepted',
  'rejected',
  'fulfilled',
];

describe('catalog request status client ↔ server contract', () => {
  it('freezes statuses against Zod enum and client union', () => {
    const fixture = loadFixture('catalog-request-statuses.json') as { statuses: string[] };
    expect(fixture.statuses).toEqual([...CATALOG_REQUEST_STATUSES]);
    expect(fixture.statuses).toEqual(CLIENT_CATALOG_STATUSES);
  });
});
