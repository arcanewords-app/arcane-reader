import { describe, expect, it } from 'vitest';
import {
  chapterBulkIdsBodySchema,
  exportDownloadQuerySchema,
  metadataUpdateBodySchema,
  projectAiReplaceBodySchema,
  projectCloneBodySchema,
  projectCreateBodySchema,
  projectLanguagesBodySchema,
  projectRenameBodySchema,
  projectSearchQuerySchema,
  projectSettingsBodySchema,
  transferChaptersBodySchema,
} from './projects.js';

describe('projectCreateBodySchema', () => {
  it('rejects empty name', () => {
    const parsed = projectCreateBodySchema.safeParse({ name: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it('rejects unsupported language pair when both languages provided', () => {
    const parsed = projectCreateBodySchema.safeParse({
      name: 'My project',
      sourceLanguage: 'en',
      targetLanguage: 'en',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts valid pair and optional uuids', () => {
    const parsed = projectCreateBodySchema.safeParse({
      name: 'My project',
      sourceLanguage: 'ko',
      targetLanguage: 'ru',
      catalogTranslationRequestId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sourceLanguage).toBe('ko');
      expect(parsed.data.targetLanguage).toBe('ru');
    }
  });

  it('rejects invalid catalogTranslationRequestId', () => {
    const parsed = projectCreateBodySchema.safeParse({
      name: 'My project',
      catalogTranslationRequestId: 'bad-id',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.catalogTranslationRequestId).toBeDefined();
    }
  });
});

describe('projectRenameBodySchema', () => {
  it('trims name', () => {
    const parsed = projectRenameBodySchema.safeParse({ name: '  Renamed  ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Renamed');
    }
  });

  it('rejects blank name after trim', () => {
    const parsed = projectRenameBodySchema.safeParse({ name: '   ' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.name).toBeDefined();
    }
  });
});

describe('projectCloneBodySchema', () => {
  it('allows omitted name', () => {
    const parsed = projectCloneBodySchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('rejects empty name when provided', () => {
    const parsed = projectCloneBodySchema.safeParse({ name: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.name).toBeDefined();
    }
  });
});

describe('transferChaptersBodySchema', () => {
  it('requires at least one chapter id', () => {
    const parsed = transferChaptersBodySchema.safeParse({
      sourceProjectId: 'p1',
      chapterIds: [],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.chapterIds).toBeDefined();
    }
  });

  it('rejects empty sourceProjectId', () => {
    const parsed = transferChaptersBodySchema.safeParse({
      sourceProjectId: '',
      chapterIds: ['ch-1'],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.sourceProjectId).toBeDefined();
    }
  });
});

describe('chapterBulkIdsBodySchema', () => {
  it('rejects empty chapterIds array', () => {
    const parsed = chapterBulkIdsBodySchema.safeParse({ chapterIds: [] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.chapterIds).toBeDefined();
    }
  });
});

describe('projectLanguagesBodySchema', () => {
  it('rejects unsupported pair', () => {
    const parsed = projectLanguagesBodySchema.safeParse({
      sourceLanguage: 'en',
      targetLanguage: 'en',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts ru-be pair', () => {
    const parsed = projectLanguagesBodySchema.safeParse({
      sourceLanguage: 'ru',
      targetLanguage: 'be',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('projectSearchQuerySchema', () => {
  it('defaults empty q and field', () => {
    const parsed = projectSearchQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.q).toBe('');
      expect(parsed.data.field).toBe('translated');
      expect(parsed.data.offset).toBe(0);
      expect(parsed.data.limit).toBe(200);
    }
  });

  it('rejects invalid field enum', () => {
    const parsed = projectSearchQuerySchema.safeParse({ field: 'notes' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.field).toBeDefined();
    }
  });

  it('coerces boolean query flags from strings', () => {
    const parsed = projectSearchQuerySchema.safeParse({
      caseSensitive: 'true',
      wholeWord: '1',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.caseSensitive).toBe(true);
      expect(parsed.data.wholeWord).toBe(true);
    }
  });

  it('rejects limit above max', () => {
    const parsed = projectSearchQuerySchema.safeParse({ limit: 501 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.limit).toBeDefined();
    }
  });
});

describe('projectSettingsBodySchema', () => {
  it('rejects temperature above max', () => {
    const parsed = projectSettingsBodySchema.safeParse({ temperature: 3 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.temperature).toBeDefined();
    }
  });

  it('normalizes editingFocus alias', () => {
    const parsed = projectSettingsBodySchema.safeParse({ editingFocus: 'fix_problems' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.editingFocus).toBe('fix_only');
    }
  });

  it('maps legacy translateExecutionMode values to one_shot or chunked', () => {
    const oneShot = projectSettingsBodySchema.safeParse({ translateExecutionMode: 'enhanced' });
    const chunked = projectSettingsBodySchema.safeParse({ translateExecutionMode: 'fast' });
    expect(oneShot.success).toBe(true);
    expect(chunked.success).toBe(true);
    if (oneShot.success) expect(oneShot.data.translateExecutionMode).toBe('one_shot');
    if (chunked.success) expect(chunked.data.translateExecutionMode).toBe('chunked');
  });

  it('rejects chunkSize below minimum', () => {
    const parsed = projectSettingsBodySchema.safeParse({ chunkSize: 100 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.chunkSize).toBeDefined();
    }
  });
});

describe('projectAiReplaceBodySchema', () => {
  it('rejects blank find string', () => {
    const parsed = projectAiReplaceBodySchema.safeParse({
      find: '   ',
      preset: 'minimal_fix',
      paragraphs: [{ chapterId: 'ch-1', paragraphId: 'p-1' }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.find).toBeDefined();
    }
  });

  it('rejects empty paragraphs array', () => {
    const parsed = projectAiReplaceBodySchema.safeParse({
      find: 'hero',
      preset: 'minimal_fix',
      paragraphs: [],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.paragraphs).toBeDefined();
    }
  });

  it('rejects invalid preset', () => {
    const parsed = projectAiReplaceBodySchema.safeParse({
      find: 'hero',
      preset: 'unknown',
      paragraphs: [{ chapterId: 'ch-1', paragraphId: 'p-1' }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.preset).toBeDefined();
    }
  });
});

describe('metadataUpdateBodySchema', () => {
  it('requires metadata object', () => {
    const parsed = metadataUpdateBodySchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.metadata).toBeDefined();
    }
  });
});

describe('exportDownloadQuerySchema', () => {
  it('rejects empty path', () => {
    const parsed = exportDownloadQuerySchema.safeParse({ path: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.path).toBeDefined();
    }
  });
});
