import { describe, expect, it } from 'vitest';
import { glossaryGenders, glossaryTypes } from '../../../src/api/schemas/glossary.js';
import type { Gender, GlossaryEntryType } from '../../../src/client/types/index.js';
import { loadFixture } from '../helpers/loadFixture.js';

const CLIENT_GLOSSARY_TYPES: GlossaryEntryType[] = ['character', 'location', 'term'];
const CLIENT_GENDERS: Gender[] = ['male', 'female', 'neutral', 'unknown'];

describe('glossary enums client ↔ server contract', () => {
  const fixture = loadFixture('glossary-enums.json') as {
    types: string[];
    genders: string[];
  };

  it('freezes types against Zod and client types', () => {
    expect(fixture.types).toEqual([...glossaryTypes]);
    expect(fixture.types).toEqual(CLIENT_GLOSSARY_TYPES);
  });

  it('freezes genders against Zod and client types', () => {
    expect(fixture.genders).toEqual([...glossaryGenders]);
    expect(fixture.genders).toEqual(CLIENT_GENDERS);
  });
});
