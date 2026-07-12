import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import multer from 'multer';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  addGlossaryEntry: vi.fn(),
  updateGlossaryEntry: vi.fn(),
  getGlossaryEntry: vi.fn(),
  deleteGlossaryEntry: vi.fn(),
  deleteGlossaryEntriesBulk: vi.fn(),
  importGlossaryEntriesBatch: vi.fn(),
  handleServiceError: vi.fn(() => false),
  clearAgentCache: vi.fn(),
  getNameDeclensions: vi.fn(),
  suggestGlossaryMerges: vi.fn(),
  buildGlossaryCsvExport: vi.fn(),
  buildGlossaryJsonExport: vi.fn(),
  filterNewGlossaryEntries: vi.fn(),
  parseGlossaryImportFile: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  deleteFiles: vi.fn(),
  extractPathFromUrl: vi.fn(),
  generateUniqueFilename: vi.fn(),
  invalidateProjectAndRelatedCaches: vi.fn(),
}));

vi.mock('../../../services/supabaseDatabase.js', () => ({
  getProject: mocks.getProject,
  addGlossaryEntry: mocks.addGlossaryEntry,
  updateGlossaryEntry: mocks.updateGlossaryEntry,
  getGlossaryEntry: mocks.getGlossaryEntry,
  deleteGlossaryEntry: mocks.deleteGlossaryEntry,
  deleteGlossaryEntriesBulk: mocks.deleteGlossaryEntriesBulk,
  importGlossaryEntriesBatch: mocks.importGlossaryEntriesBatch,
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mocks.handleServiceError,
}));

vi.mock('../../../services/engine-integration.js', () => ({
  getNameDeclensions: mocks.getNameDeclensions,
  clearAgentCache: mocks.clearAgentCache,
}));

vi.mock('../../../services/glossaryMergeSuggestions.js', () => ({
  suggestGlossaryMerges: mocks.suggestGlossaryMerges,
}));

vi.mock('../../../services/glossaryImportExport.js', () => ({
  buildGlossaryCsvExport: mocks.buildGlossaryCsvExport,
  buildGlossaryJsonExport: mocks.buildGlossaryJsonExport,
  filterNewGlossaryEntries: mocks.filterNewGlossaryEntries,
  GLOSSARY_IMPORT_MAX_ENTRIES: 5000,
  parseGlossaryImportFile: mocks.parseGlossaryImportFile,
  prepareGlossaryEntryForInsert: (entry: unknown) => entry,
}));

vi.mock('../../../services/storage.js', () => ({
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile,
  deleteFiles: mocks.deleteFiles,
  extractPathFromUrl: mocks.extractPathFromUrl,
  generateUniqueFilename: mocks.generateUniqueFilename,
}));

vi.mock('../../../services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: (...args: unknown[]) =>
    mocks.invalidateProjectAndRelatedCaches(...args),
}));

vi.mock('../../routeHelpers.js', () => ({
  decodeMultipartFilename: (name: string) => name,
}));

vi.mock('../../../logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  handleGetGlossary,
  handleExportGlossary,
  handleImportGlossary,
  handleCreateGlossaryEntry,
  handleUpdateGlossaryEntry,
  handleDeleteGlossaryEntry,
  handleBulkDeleteGlossaryEntries,
  createHandleSuggestGlossaryMerges,
  handleMergeGlossaryEntries,
  handleUploadGlossaryEntryImage,
  handleDeleteGlossaryEntryImageByIndex,
  handleDeleteGlossaryEntryImages,
} from './glossaryRouteHandlers.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    sentBody: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    send(payload: unknown) {
      this.sentBody = payload;
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  const { params: paramsOverride, ...rest } = overrides;
  return {
    user: { id: 'user-1', role: 'author' as const },
    token: 'bearer-token',
    params: {
      id: 'proj-1',
      projectId: 'proj-1',
      entryId: 'entry-1',
      imageIndex: '0',
      ...(paramsOverride as Record<string, string> | undefined),
    },
    body: {},
    query: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    ...rest,
  };
}

const sampleGlossary = [
  {
    id: 'entry-1',
    original: 'Alice',
    translated: 'Алиса',
    type: 'character' as const,
    mentionedInChapters: [1, 2],
  },
  {
    id: 'entry-2',
    original: 'Bob',
    translated: 'Боб',
    type: 'character' as const,
    mentionedInChapters: [3],
  },
];

describe('glossaryRouteHandlers', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.handleServiceError.mockReturnValue(false);
  });

  describe('handleGetGlossary', () => {
    it('returns glossary when project found', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      const res = mockRes();
      await handleGetGlossary(mockReq() as never, res as never);
      assert.deepEqual(res.body, sampleGlossary);
    });

    it('returns 404 when project not found', async () => {
      mocks.getProject.mockResolvedValue(null);
      const res = mockRes();
      await handleGetGlossary(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });

    it('returns 401 when user missing', async () => {
      const res = mockRes();
      await handleGetGlossary(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('handleExportGlossary', () => {
    it('exports CSV on success', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.buildGlossaryCsvExport.mockReturnValue(Buffer.from('csv'));
      const res = mockRes();
      await handleExportGlossary(mockReq({ query: { format: 'csv' } }) as never, res as never);
      assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
      assert.deepEqual(res.sentBody, Buffer.from('csv'));
    });

    it('exports JSON on success', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.buildGlossaryJsonExport.mockReturnValue('{"entries":[]}');
      const res = mockRes();
      await handleExportGlossary(mockReq({ query: { format: 'json' } }) as never, res as never);
      assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
      assert.equal(res.sentBody, '{"entries":[]}');
    });

    it('returns 400 on invalid format query', async () => {
      const res = mockRes();
      await handleExportGlossary(mockReq({ query: { format: 'xml' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleImportGlossary', () => {
    it('imports entries on success', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [] });
      mocks.parseGlossaryImportFile.mockReturnValue({
        entries: [{ original: 'New', translated: 'Новый' }],
        errors: [],
      });
      mocks.filterNewGlossaryEntries.mockReturnValue({
        toInsert: [{ original: 'New', translated: 'Новый' }],
        skipped: 0,
      });
      mocks.importGlossaryEntriesBatch.mockResolvedValue([{ id: 'entry-new' }]);
      mocks.invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleImportGlossary(
        mockReq({ file: { buffer: Buffer.from('data'), originalname: 'glossary.csv' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { added: 1, skipped: 0, errors: [] });
    });

    it('returns 400 when no file uploaded', async () => {
      const res = mockRes();
      await handleImportGlossary(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 400 when parse fails with no entries', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [] });
      mocks.parseGlossaryImportFile.mockReturnValue({
        entries: [],
        errors: ['Invalid row'],
      });
      const res = mockRes();
      await handleImportGlossary(
        mockReq({ file: { buffer: Buffer.from('bad'), originalname: 'glossary.csv' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleCreateGlossaryEntry', () => {
    it('creates entry and invalidates cache', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [] });
      mocks.addGlossaryEntry.mockResolvedValue({
        id: 'entry-new',
        original: 'Bob',
        translated: 'Боб',
      });
      mocks.invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleCreateGlossaryEntry(
        mockReq({ body: { original: 'Bob', translated: 'Боб', type: 'character' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'entry-new', original: 'Bob', translated: 'Боб' });
      assert.equal(mocks.clearAgentCache.mock.calls[0]?.[0], 'proj-1');
    });

    it('returns 400 on validation failure', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [] });
      const res = mockRes();
      await handleCreateGlossaryEntry(mockReq({ body: { original: '' } }) as never, res as never);
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleUpdateGlossaryEntry', () => {
    it('updates entry with auto declensions for character', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.getNameDeclensions.mockReturnValue({ declensions: { genitive: 'Алисы' } });
      mocks.updateGlossaryEntry.mockResolvedValue({
        id: 'entry-1',
        original: 'Alice',
        translated: 'Алиса',
      });
      mocks.invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUpdateGlossaryEntry(
        mockReq({
          body: { original: 'Alice', translated: 'Алиса', type: 'character', gender: 'female' },
        }) as never,
        res as never
      );
      assert.deepEqual(res.body, { id: 'entry-1', original: 'Alice', translated: 'Алиса' });
    });

    it('returns 404 when entry not found', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.updateGlossaryEntry.mockResolvedValue(null);
      const res = mockRes();
      await handleUpdateGlossaryEntry(
        mockReq({ body: { original: 'Alice', translated: 'Алиса' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleDeleteGlossaryEntry', () => {
    it('returns success when entry deleted', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.deleteGlossaryEntry.mockResolvedValue(true);
      mocks.invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDeleteGlossaryEntry(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true });
    });

    it('returns 404 when entry not found', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.deleteGlossaryEntry.mockResolvedValue(false);
      const res = mockRes();
      await handleDeleteGlossaryEntry(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleBulkDeleteGlossaryEntries', () => {
    it('returns deleted count on success', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.deleteGlossaryEntriesBulk.mockResolvedValue(2);
      const res = mockRes();
      await handleBulkDeleteGlossaryEntries(
        mockReq({ body: { entryIds: ['entry-1', 'entry-2'] } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { success: true, deletedCount: 2 });
    });

    it('returns 400 on validation failure', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      const res = mockRes();
      await handleBulkDeleteGlossaryEntries(
        mockReq({ body: { entryIds: [] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });

  describe('createHandleSuggestGlossaryMerges', () => {
    it('returns suggestions when OpenAI configured', async () => {
      const handler = createHandleSuggestGlossaryMerges({
        config: { openai: { apiKey: 'sk-test', model: 'gpt-4', timeout: 30000 } },
      } as never);
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary, settings: {} });
      mocks.suggestGlossaryMerges.mockResolvedValue([{ entryIds: ['entry-1', 'entry-2'] }]);
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.deepEqual(res.body, { suggestions: [{ entryIds: ['entry-1', 'entry-2'] }] });
    });

    it('returns 503 when OpenAI not configured', async () => {
      const handler = createHandleSuggestGlossaryMerges({
        config: { openai: { apiKey: '', model: 'gpt-4', timeout: 30000 } },
      } as never);
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary, settings: {} });
      const res = mockRes();
      await handler(mockReq() as never, res as never);
      assert.equal(res.statusCode, 503);
    });
  });

  describe('handleMergeGlossaryEntries', () => {
    it('merges entries and returns kept entry', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.updateGlossaryEntry.mockResolvedValue(undefined);
      mocks.deleteGlossaryEntry.mockResolvedValue(true);
      mocks.getGlossaryEntry.mockResolvedValue({
        id: 'entry-1',
        original: 'Alice',
        translated: 'Алиса',
      });
      mocks.invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleMergeGlossaryEntries(
        mockReq({ body: { entryIds: ['entry-1', 'entry-2'], keepEntryId: 'entry-1' } }) as never,
        res as never
      );
      assert.equal((res.body as { deletedCount: number }).deletedCount, 1);
    });

    it('returns 400 when entry ids not found', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      const res = mockRes();
      await handleMergeGlossaryEntries(
        mockReq({ body: { entryIds: ['entry-1', 'missing'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 400 when entry types differ', async () => {
      mocks.getProject.mockResolvedValue({
        id: 'proj-1',
        glossary: [
          ...sampleGlossary,
          { id: 'entry-3', original: 'City', translated: 'Город', type: 'location' as const },
        ],
      });
      const res = mockRes();
      await handleMergeGlossaryEntries(
        mockReq({ body: { entryIds: ['entry-1', 'entry-3'] } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleUploadGlossaryEntryImage', () => {
    it('uploads image and updates entry', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: sampleGlossary });
      mocks.generateUniqueFilename.mockReturnValue('glossary/entry-1.jpg');
      mocks.uploadFile.mockResolvedValue({ publicUrl: 'https://cdn/img.jpg' });
      mocks.updateGlossaryEntry.mockResolvedValue({
        id: 'entry-1',
        imageUrls: ['https://cdn/img.jpg'],
      });
      mocks.invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleUploadGlossaryEntryImage(
        mockReq({
          file: { buffer: Buffer.from('img'), originalname: 'photo.jpg', mimetype: 'image/jpeg' },
        }) as never,
        res as never
      );
      assert.equal((res.body as { imageUrl: string }).imageUrl, 'https://cdn/img.jpg');
    });

    it('returns 400 when no file provided', async () => {
      const res = mockRes();
      await handleUploadGlossaryEntryImage(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
    });

    it('returns 404 when entry not found', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [] });
      const res = mockRes();
      await handleUploadGlossaryEntryImage(
        mockReq({
          file: { buffer: Buffer.from('img'), originalname: 'photo.jpg', mimetype: 'image/jpeg' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleDeleteGlossaryEntryImageByIndex', () => {
    it('deletes image at index on success', async () => {
      const entryWithImages = {
        ...sampleGlossary[0],
        imageUrl: 'https://cdn/a.jpg',
        imageUrls: ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
      };
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [entryWithImages] });
      mocks.extractPathFromUrl.mockReturnValue('path/a.jpg');
      mocks.deleteFile.mockResolvedValue(undefined);
      mocks.updateGlossaryEntry.mockResolvedValue({
        id: 'entry-1',
        imageUrls: ['https://cdn/b.jpg'],
      });
      mocks.invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDeleteGlossaryEntryImageByIndex(
        mockReq({ params: { imageIndex: '0' } }) as never,
        res as never
      );
      assert.deepEqual(res.body, { success: true, imageUrls: ['https://cdn/b.jpg'] });
    });

    it('returns 400 when image index out of range', async () => {
      mocks.getProject.mockResolvedValue({
        id: 'proj-1',
        glossary: [{ ...sampleGlossary[0], imageUrls: ['https://cdn/a.jpg'] }],
      });
      const res = mockRes();
      await handleDeleteGlossaryEntryImageByIndex(
        mockReq({ params: { imageIndex: '5' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });

  describe('handleDeleteGlossaryEntryImages', () => {
    it('deletes all images on success', async () => {
      const entryWithImages = {
        ...sampleGlossary[0],
        imageUrl: 'https://cdn/a.jpg',
        imageUrls: ['https://cdn/a.jpg'],
      };
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [entryWithImages] });
      mocks.extractPathFromUrl.mockReturnValue('path/a.jpg');
      mocks.deleteFiles.mockResolvedValue(undefined);
      mocks.updateGlossaryEntry.mockResolvedValue(undefined);
      mocks.invalidateProjectAndRelatedCaches.mockResolvedValue(undefined);
      const res = mockRes();
      await handleDeleteGlossaryEntryImages(mockReq() as never, res as never);
      assert.deepEqual(res.body, { success: true });
    });

    it('returns 404 when entry not found', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [] });
      const res = mockRes();
      await handleDeleteGlossaryEntryImages(mockReq() as never, res as never);
      assert.equal(res.statusCode, 404);
    });
  });

  describe('handleImportGlossary error paths', () => {
    it('returns 400 on multer error', async () => {
      mocks.getProject.mockResolvedValue({ id: 'proj-1', glossary: [] });
      mocks.parseGlossaryImportFile.mockImplementation(() => {
        throw new multer.MulterError('LIMIT_FILE_SIZE');
      });
      const res = mockRes();
      await handleImportGlossary(
        mockReq({
          file: { buffer: Buffer.from('data'), originalname: 'glossary.csv' },
        }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });
  });
});
