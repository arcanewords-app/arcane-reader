import { describe, expect, it } from 'vitest';
import { publicEntityKinds } from '../../../src/api/schemas/admin.js';
import type { PublicEntityKind } from '../../../src/client/types/index.js';
import { loadFixture } from '../helpers/loadFixture.js';

const CLIENT_PUBLIC_ENTITY_KINDS: PublicEntityKind[] = ['tag', 'author', 'translator'];

describe('public entity kinds client ↔ server contract', () => {
  it('freezes kinds against Zod enum and client union', () => {
    const fixture = loadFixture('public-entity-kinds.json') as { kinds: string[] };
    expect(fixture.kinds).toEqual([...publicEntityKinds]);
    expect(fixture.kinds).toEqual(CLIENT_PUBLIC_ENTITY_KINDS);
  });
});
