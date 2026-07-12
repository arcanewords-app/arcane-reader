import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { CONTACT_EMAIL } from './contact.js';

describe('contact', () => {
  it('CONTACT_EMAIL is a valid email string', () => {
    assert.match(CONTACT_EMAIL, /@/);
    assert.equal(CONTACT_EMAIL.includes(' '), false);
  });
});
