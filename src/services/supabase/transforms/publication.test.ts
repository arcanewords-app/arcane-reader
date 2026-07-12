import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  transformPublicationFromDB,
  transformPublicEntityFromDB,
  type PublicationRow,
} from './publication.js';

describe('publication transforms', () => {
  it('transformPublicationFromDB maps snake_case publication row', () => {
    const row: PublicationRow = {
      id: 'pub-1',
      project_id: 'proj-1',
      user_id: 'user-1',
      status: 'published',
      title: 'Title',
      description: 'Desc',
      cover_image_url: 'https://example.com/cover.jpg',
      author_display: 'Author',
      translator_display: null,
      source_language: 'en',
      target_language: 'ru',
      published_at: '2026-01-01',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
      translation_status: 'in_progress',
      show_glossary: true,
    };
    const pub = transformPublicationFromDB(row);
    assert.equal(pub.projectId, 'proj-1');
    assert.equal(pub.translationStatus, 'in_progress');
    assert.equal(pub.showGlossary, true);
  });

  it('transformPublicEntityFromDB maps blocked status', () => {
    const entity = transformPublicEntityFromDB({
      id: 'e1',
      kind: 'author',
      name: 'Name',
      description: null,
      photo_url: null,
      created_by: 'u1',
      owner_user_id: 'u1',
      status: 'blocked',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });
    assert.equal(entity.entityStatus, 'blocked');
  });
});
