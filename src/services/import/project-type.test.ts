import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  getProjectTypeColor,
  getProjectTypeDisplayName,
  getProjectTypeFromFormat,
  getProjectTypeIcon,
  supportsCoverImage,
  supportsMetadata,
} from './project-type.js';

describe('import project-type', () => {
  it('maps epub/fb2 to book and txt/csv to text', () => {
    assert.equal(getProjectTypeFromFormat('epub'), 'book');
    assert.equal(getProjectTypeFromFormat('fb2'), 'book');
    assert.equal(getProjectTypeFromFormat('txt'), 'text');
    assert.equal(getProjectTypeFromFormat('csv'), 'text');
  });

  it('supportsMetadata and supportsCoverImage only for book', () => {
    assert.equal(supportsMetadata('book'), true);
    assert.equal(supportsMetadata('text'), false);
    assert.equal(supportsCoverImage('book'), true);
    assert.equal(supportsCoverImage('text'), false);
  });

  it('getProjectTypeDisplayName returns Russian labels', () => {
    assert.equal(getProjectTypeDisplayName('book'), 'Книга');
    assert.equal(getProjectTypeDisplayName('text'), 'Текст');
  });

  it('getProjectTypeIcon and getProjectTypeColor return values per type', () => {
    assert.equal(getProjectTypeIcon('book'), '📚');
    assert.match(getProjectTypeColor('book'), /accent/);
  });
});
