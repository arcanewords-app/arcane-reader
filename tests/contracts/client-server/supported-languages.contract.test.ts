import { describe, expect, it } from 'vitest';
import {
  catalogRequestSourceLanguages,
  catalogRequestTargetLanguages,
} from '../../../src/api/schemas/catalogRequests.js';
import {
  supportedSourceLanguageSchema,
  supportedTargetLanguageSchema,
} from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('supported languages client ↔ server contract', () => {
  const fixture = loadFixture('supported-languages.json') as {
    source: string[];
    target: string[];
  };

  it('freezes source languages against projects Zod and catalog consts', () => {
    expect(fixture.source).toEqual([...supportedSourceLanguageSchema.options]);
    expect(fixture.source).toEqual([...catalogRequestSourceLanguages]);
  });

  it('freezes target languages against projects Zod and catalog consts', () => {
    expect(fixture.target).toEqual([...supportedTargetLanguageSchema.options]);
    expect(fixture.target).toEqual([...catalogRequestTargetLanguages]);
  });
});
