import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  escapeIlike,
  getDefaultProjectSettings,
  normalizeGenderForDB,
  normalizeGlossaryTypeForDB,
  transformChapterFromDB,
  transformChapterToDB,
  transformGlossaryEntryFromDB,
  transformParagraphFromDB,
  transformProjectFromDB,
  transformProjectToDB,
} from './supabaseTransforms.js';

describe('supabaseTransforms', () => {
  it('normalizeGenderForDB coerces LLM variants', () => {
    assert.equal(normalizeGenderForDB('Female'), 'female');
    assert.equal(normalizeGenderForDB('m'), 'male');
    assert.equal(normalizeGenderForDB('non-binary'), 'neutral');
    assert.equal(normalizeGenderForDB(''), null);
    assert.equal(normalizeGenderForDB('invalid'), null);
  });

  it('normalizeGlossaryTypeForDB defaults unknown to term', () => {
    assert.equal(normalizeGlossaryTypeForDB('Character'), 'character');
    assert.equal(normalizeGlossaryTypeForDB('loc'), 'location');
    assert.equal(normalizeGlossaryTypeForDB('typo'), 'term');
  });

  it('transformProjectFromDB maps snake_case row to camelCase project', () => {
    const project = transformProjectFromDB({
      id: 'p1',
      name: 'Test',
      source_language: 'ko',
      target_language: 'ru',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    });
    assert.equal(project.id, 'p1');
    assert.equal(project.sourceLanguage, 'ko');
    assert.equal(project.targetLanguage, 'ru');
    assert.ok(project.settings);
  });

  it('transformProjectFromDB infers book type from metadata', () => {
    const project = transformProjectFromDB({ id: 'p1', name: 'Book', metadata: { isbn: '1' } });
    assert.equal(project.type, 'book');
  });

  it('transformProjectToDB maps camelCase to snake_case', () => {
    assert.deepEqual(
      transformProjectToDB({
        name: 'N',
        sourceLanguage: 'en',
        targetLanguage: 'be',
        type: 'text',
      }),
      {
        name: 'N',
        source_language: 'en',
        target_language: 'be',
        settings: undefined,
        type: 'text',
      }
    );
  });

  it('transformChapterFromDB and transformChapterToDB round-trip fields', () => {
    const chapter = transformChapterFromDB({
      id: 'ch-1',
      number: 3,
      title: 'Start',
      translated_title: ' Начало ',
      original_text: 'Hello',
      translated_text: 'Hi',
      status: 'completed',
    });
    assert.equal(chapter.translatedTitle, 'Начало');
    assert.equal(chapter.status, 'completed');

    const db = transformChapterToDB({
      number: 3,
      title: 'Start',
      translatedTitle: 'Начало',
      status: 'partial',
    });
    assert.equal(db.translated_title, 'Начало');
    assert.equal(db.status, 'partial');
  });

  it('transformParagraphFromDB maps paragraph row', () => {
    const p = transformParagraphFromDB({
      id: 'para-1',
      index: 0,
      original_text: 'A',
      translated_text: 'B',
      status: 'translated',
      edited_by: 'ai',
    });
    assert.equal(p.originalText, 'A');
    assert.equal(p.translatedText, 'B');
    assert.equal(p.editedBy, 'ai');
  });

  it('transformGlossaryEntryFromDB merges image_url into imageUrls', () => {
    const entry = transformGlossaryEntryFromDB({
      id: 'g1',
      type: 'character',
      original: 'Alice',
      translated: 'Алиса',
      image_url: 'https://x/a.png',
      mentioned_in_chapters: [2, 1],
    });
    assert.deepEqual(entry.imageUrls, ['https://x/a.png']);
    assert.deepEqual(entry.mentionedInChapters, [1, 2]);
  });

  it('escapeIlike escapes ilike wildcards', () => {
    assert.equal(escapeIlike('100%'), '100\\%');
    assert.equal(escapeIlike('a_b'), 'a\\_b');
  });

  it('getDefaultProjectSettings returns reader and stage models', () => {
    const settings = getDefaultProjectSettings('author');
    assert.ok(settings.stageModels);
    assert.equal(settings.enableTranslation, true);
    assert.ok(settings.reader);
  });
});
