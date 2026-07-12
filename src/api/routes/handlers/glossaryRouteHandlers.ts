import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import {
  glossaryCreateBodySchema,
  glossaryUpdateBodySchema,
  glossaryMergeBodySchema,
  glossaryBulkDeleteBodySchema,
  glossaryExportQuerySchema,
} from '../../schemas/index.js';
import {
  getProject,
  addGlossaryEntry,
  updateGlossaryEntry,
  getGlossaryEntry,
  deleteGlossaryEntry,
  deleteGlossaryEntriesBulk,
  importGlossaryEntriesBatch,
} from '../../../services/supabaseDatabase.js';
import { type GlossaryEntry } from '../../../storage/database.js';
import { handleServiceError } from '../../../middleware/serviceHealth.js';
import { requireToken } from '../../../utils/requestHelpers.js';
import { getNameDeclensions, clearAgentCache } from '../../../services/engine-integration.js';
import { normalizeQueryRecord, requireRouteParam } from '../../validateRoute.js';
import {
  suggestGlossaryMerges,
  type MergeSuggestion,
} from '../../../services/glossaryMergeSuggestions.js';
import {
  buildGlossaryCsvExport,
  buildGlossaryJsonExport,
  filterNewGlossaryEntries,
  GLOSSARY_IMPORT_MAX_ENTRIES,
  parseGlossaryImportFile,
  prepareGlossaryEntryForInsert,
} from '../../../services/glossaryImportExport.js';
import {
  uploadFile,
  deleteFile,
  deleteFiles,
  extractPathFromUrl,
  generateUniqueFilename,
} from '../../../services/storage.js';
import { invalidateProjectAndRelatedCaches } from '../../../services/cacheInvalidation.js';
import { decodeMultipartFilename } from '../../routeHelpers.js';
import { logger } from '../../../logger.js';
import type { RouteDeps } from '../deps.js';

export async function handleGetGlossary(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const project = await getProject(requireRouteParam(req.params.id, 'id'), req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project.glossary);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to get glossary' });
  }
}

export async function handleExportGlossary(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = glossaryExportQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.id, 'id');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { format } = parsed.data;
    const filename = `glossary-${projectId}.${format}`;

    if (format === 'csv') {
      const buffer = buildGlossaryCsvExport(project.glossary);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }

    const json = buildGlossaryJsonExport(project.glossary);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to export glossary' });
  }
}

export async function handleImportGlossary(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.id, 'id');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const filename = decodeMultipartFilename(req.file.originalname);
    const { entries: parsedEntries, errors: parseErrors } = parseGlossaryImportFile(
      req.file.buffer,
      filename
    );

    if (parsedEntries.length === 0 && parseErrors.length > 0) {
      res.status(400).json({
        error: 'Failed to parse glossary file',
        added: 0,
        skipped: 0,
        errors: parseErrors,
      });
      return;
    }

    if (parsedEntries.length > GLOSSARY_IMPORT_MAX_ENTRIES) {
      res.status(400).json({
        error: `Too many entries (max ${GLOSSARY_IMPORT_MAX_ENTRIES})`,
        added: 0,
        skipped: 0,
        errors: parseErrors,
      });
      return;
    }

    const { toInsert, skipped } = filterNewGlossaryEntries(parsedEntries, project.glossary);

    const prepared = toInsert.map((entry) => prepareGlossaryEntryForInsert(entry));
    const inserted = await importGlossaryEntriesBatch(projectId, prepared, token);

    clearAgentCache(projectId);
    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);

    req.log?.info(
      {
        event: 'glossary.imported',
        projectId,
        added: inserted.length,
        skipped,
        errorCount: parseErrors.length,
      },
      'Glossary import completed'
    );

    res.json({
      added: inserted.length,
      skipped,
      errors: parseErrors,
    });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    if (error instanceof multer.MulterError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('Supported formats')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to import glossary' });
  }
}

export async function handleCreateGlossaryEntry(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.id, 'id');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const parsed = glossaryCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const prepared = prepareGlossaryEntryForInsert(parsed.data);

    const entry = await addGlossaryEntry(projectId, prepared, requireToken(req));

    clearAgentCache(projectId);

    if (!entry) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);
    res.json(entry);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to add glossary entry' });
  }
}

export async function handleUpdateGlossaryEntry(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const parsed = glossaryUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const {
      original,
      translated,
      type,
      gender,
      description,
      notes,
      relatedEntryIds,
      primaryLocationId,
      declensions: declensionsIn,
    } = parsed.data;

    let declensions = declensionsIn;

    if (type === 'character' && translated && original && !declensions) {
      const result = getNameDeclensions(original, gender || 'unknown');
      declensions = result.declensions;
    }

    const updates: Parameters<typeof updateGlossaryEntry>[2] = {
      original,
      translated,
      type,
      gender,
      description,
      notes,
      declensions,
    };
    if (relatedEntryIds !== undefined)
      updates.relatedEntryIds = Array.isArray(relatedEntryIds) ? relatedEntryIds : [];
    if (primaryLocationId !== undefined) updates.primaryLocationId = primaryLocationId || undefined;

    const entryId = requireRouteParam(req.params.entryId, 'entryId');
    const entry = await updateGlossaryEntry(projectId, entryId, updates, token);

    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    clearAgentCache(projectId);

    req.log?.info(
      {
        event: 'glossary.updated',
        entryId: entry.id,
        original: entry.original,
        translated: entry.translated,
      },
      `Glossary updated: ${entry.original} → ${entry.translated}`
    );

    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);
    res.json(entry);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to update glossary entry' });
  }
}

export async function handleDeleteGlossaryEntry(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const entryId = requireRouteParam(req.params.entryId, 'entryId');
    const success = await deleteGlossaryEntry(projectId, entryId, token);
    if (!success) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    clearAgentCache(projectId);

    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);
    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to delete glossary entry' });
  }
}

export async function handleBulkDeleteGlossaryEntries(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const parsed = glossaryBulkDeleteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { entryIds } = parsed.data;

    const deletedCount = await deleteGlossaryEntriesBulk(projectId, entryIds, token);

    clearAgentCache(projectId);
    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);
    res.json({ success: true, deletedCount });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to bulk delete glossary entries' });
  }
}

export function createHandleSuggestGlossaryMerges(deps: RouteDeps) {
  return async function handleSuggestGlossaryMerges(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const token = requireToken(req);
      const projectId = requireRouteParam(req.params.projectId, 'projectId');
      const project = await getProject(projectId, req.user.id, token);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (!deps.config.openai?.apiKey) {
        res.status(503).json({
          error: 'AI not configured',
          message: 'Configure OpenAI API key to use merge suggestions.',
        });
        return;
      }
      const model =
        project.settings?.stageModels?.analysis ??
        project.settings?.model ??
        deps.config.openai.model;
      const suggestions: MergeSuggestion[] = await suggestGlossaryMerges(project.glossary, {
        apiKey: deps.config.openai.apiKey,
        model,
        timeout: deps.config.openai.timeout,
      });
      res.json({ suggestions });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'suggest-merges failed');
      res.status(500).json({ error: 'Failed to get merge suggestions' });
    }
  };
}

export async function handleMergeGlossaryEntries(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const parsed = glossaryMergeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { entryIds, keepEntryId } = parsed.data;

    const idSet = new Set(entryIds);
    const entries = project.glossary.filter((e) => idSet.has(e.id));
    if (entries.length !== entryIds.length) {
      res.status(400).json({
        error: 'Bad request',
        message: 'One or more entry IDs not found in this project glossary.',
      });
      return;
    }

    const types = entries.map((e) => e.type);
    if (new Set(types).size > 1) {
      res.status(400).json({
        error: 'Bad request',
        message: 'All entries must be of the same type (character, location, or term).',
      });
      return;
    }

    if (keepEntryId !== undefined && !idSet.has(keepEntryId)) {
      res.status(400).json({
        error: 'Bad request',
        message: 'keepEntryId must be one of the entryIds.',
      });
      return;
    }

    let primary: GlossaryEntry;
    if (keepEntryId) {
      primary = entries.find((e) => e.id === keepEntryId)!;
    } else {
      const withChapters = entries.map((e) => ({
        entry: e,
        count: (e.mentionedInChapters ?? []).length,
      }));
      withChapters.sort((a, b) => b.count - a.count);
      primary = withChapters[0].entry;
    }

    const others = entries.filter((e) => e.id !== primary.id);

    const allChapters = new Set<number>();
    for (const e of entries) {
      (e.mentionedInChapters ?? []).forEach((n) => allChapters.add(n));
    }
    const mergedChapters = [...allChapters].sort((a, b) => a - b);

    const descriptions = entries.map((e) => e.description?.trim()).filter(Boolean) as string[];
    const mergedDescription =
      descriptions.length > 0
        ? [...new Set(descriptions)].filter(Boolean).join(' ; ')
        : primary.description;

    const notesList = entries.map((e) => e.notes?.trim()).filter(Boolean) as string[];
    const mergedNotes =
      notesList.length > 0 ? [...new Set(notesList)].filter(Boolean).join(' ; ') : primary.notes;

    await updateGlossaryEntry(
      projectId,
      primary.id,
      {
        mentionedInChapters: mergedChapters,
        ...(mergedDescription !== undefined && { description: mergedDescription }),
        ...(mergedNotes !== undefined && { notes: mergedNotes }),
      },
      token
    );

    for (const e of others) {
      await deleteGlossaryEntry(projectId, e.id, token);
    }

    clearAgentCache(projectId);

    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);
    const kept = await getGlossaryEntry(projectId, primary.id, token);
    res.json({
      kept: kept ?? primary,
      deletedCount: others.length,
    });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'glossary merge failed');
    res.status(500).json({ error: 'Failed to merge glossary entries' });
  }
}

export async function handleUploadGlossaryEntryImage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const entryId = requireRouteParam(req.params.entryId, 'entryId');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const entry = project.glossary.find((e) => e.id === entryId);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
    const storagePath = generateUniqueFilename(`glossary-${entryId}`, ext, projectId);

    const uploadResult = await uploadFile('images', storagePath, req.file.buffer, {
      contentType: req.file.mimetype,
    });

    let imageUrls = entry.imageUrls || [];
    if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
      imageUrls = [entry.imageUrl, ...imageUrls];
    }

    imageUrls = [...imageUrls, uploadResult.publicUrl];

    const updatedEntry = await updateGlossaryEntry(
      projectId,
      entryId,
      {
        imageUrls,
        imageUrl: imageUrls[0],
      },
      token
    );

    if (!updatedEntry) {
      await deleteFile('images', storagePath).catch((err) =>
        logger.error({ err, storagePath }, 'Failed to delete file from storage')
      );
      res.status(404).json({ error: 'Failed to update entry' });
      return;
    }

    clearAgentCache(projectId);

    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);
    res.json({
      imageUrl: uploadResult.publicUrl,
      imageUrls: updatedEntry.imageUrls,
      entry: updatedEntry,
    });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to upload image');
    res.status(500).json({ error: 'Failed to upload image' });
  }
}

export async function handleDeleteGlossaryEntryImageByIndex(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const entryId = requireRouteParam(req.params.entryId, 'entryId');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const entry = project.glossary.find((e) => e.id === entryId);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const imageIndex = parseInt(requireRouteParam(req.params.imageIndex, 'imageIndex'), 10);
    if (isNaN(imageIndex)) {
      res.status(400).json({ error: 'Invalid image index' });
      return;
    }

    let imageUrls = entry.imageUrls || [];
    if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
      imageUrls = [entry.imageUrl, ...imageUrls];
    }

    if (imageIndex < 0 || imageIndex >= imageUrls.length) {
      res.status(400).json({ error: 'Image index out of range' });
      return;
    }

    const imageUrlToDelete = imageUrls[imageIndex];
    const storagePath = extractPathFromUrl(imageUrlToDelete, 'images');
    if (storagePath) {
      await deleteFile('images', storagePath).catch((err) => {
        req.log?.error({ err }, 'Failed to delete image from storage');
      });
    }

    imageUrls = imageUrls.filter((_, idx) => idx !== imageIndex);

    const updatedEntry = await updateGlossaryEntry(
      projectId,
      entryId,
      {
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        imageUrl: imageUrls.length > 0 ? imageUrls[0] : undefined,
      },
      token
    );

    clearAgentCache(projectId);

    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);
    res.json({ success: true, imageUrls: updatedEntry?.imageUrls || [] });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to delete image');
    res.status(500).json({ error: 'Failed to delete image' });
  }
}

export async function handleDeleteGlossaryEntryImages(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const entryId = requireRouteParam(req.params.entryId, 'entryId');
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const entry = project.glossary.find((e) => e.id === entryId);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    let imageUrls = entry.imageUrls || [];
    if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
      imageUrls = [entry.imageUrl, ...imageUrls];
    }

    const storagePaths = imageUrls
      .map((url) => extractPathFromUrl(url, 'images'))
      .filter((p): p is string => p !== null);

    if (storagePaths.length > 0) {
      await deleteFiles('images', storagePaths).catch((err) => {
        req.log?.error({ err }, 'Failed to delete images from storage');
      });
    }

    await updateGlossaryEntry(
      projectId,
      entryId,
      {
        imageUrls: undefined,
        imageUrl: undefined,
      },
      token
    );

    clearAgentCache(projectId);

    await invalidateProjectAndRelatedCaches(req.user.id, projectId, token);
    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to delete images');
    res.status(500).json({ error: 'Failed to delete images' });
  }
}
