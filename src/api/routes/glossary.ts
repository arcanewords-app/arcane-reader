import type { Application } from 'express';
import multer from 'multer';
import path from 'path';
import {
  glossaryCreateBodySchema,
  glossaryUpdateBodySchema,
  glossaryMergeBodySchema,
  glossaryBulkDeleteBodySchema,
  glossaryExportQuerySchema,
} from '../schemas/index.js';
import {
  getProject,
  addGlossaryEntry,
  updateGlossaryEntry,
  getGlossaryEntry,
  deleteGlossaryEntry,
  deleteGlossaryEntriesBulk,
  importGlossaryEntriesBatch,
} from '../../services/supabaseDatabase.js';
import { type GlossaryEntry } from '../../storage/database.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { handleServiceError } from '../../middleware/serviceHealth.js';
import { logger } from '../../logger.js';

import { requireToken } from '../../utils/requestHelpers.js';

import { getNameDeclensions, clearAgentCache } from '../../services/engine-integration.js';
import { asUploadMiddleware } from '../../shared/multerCompat.js';
import { normalizeQueryRecord, requireRouteParam } from '../validateRoute.js';

import {
  suggestGlossaryMerges,
  type MergeSuggestion,
} from '../../services/glossaryMergeSuggestions.js';
import {
  buildGlossaryCsvExport,
  buildGlossaryJsonExport,
  filterNewGlossaryEntries,
  GLOSSARY_IMPORT_MAX_ENTRIES,
  parseGlossaryImportFile,
  prepareGlossaryEntryForInsert,
} from '../../services/glossaryImportExport.js';

import {
  uploadFile,
  deleteFile,
  deleteFiles,
  extractPathFromUrl,
  generateUniqueFilename,
} from '../../services/storage.js';

import { invalidateProjectAndRelatedCaches } from '../../services/cacheInvalidation.js';
import { decodeMultipartFilename } from '../routeHelpers.js';
import type { RouteDeps } from './deps.js';

export function registerGlossaryRoutes(app: Application, deps: RouteDeps): void {
  app.get('/api/projects/:id/glossary', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const project = await getProject(requireRouteParam(req.params.id, 'id'), req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project.glossary);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to get glossary' });
    }
  });

  app.get(
    '/api/projects/:id/glossary/export',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const parsed = glossaryExportQuerySchema.safeParse(
          normalizeQueryRecord(req.query as Record<string, unknown>)
        );
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.id, 'id'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const { format } = parsed.data;
        const filename = `glossary-${requireRouteParam(req.params.id, 'id')}.${format}`;

        if (format === 'csv') {
          const buffer = buildGlossaryCsvExport(project.glossary);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          return res.send(buffer);
        }

        const json = buildGlossaryJsonExport(project.glossary);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(json);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to export glossary' });
      }
    }
  );

  app.post(
    '/api/projects/:id/glossary/import',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadGlossaryFile.single('file')),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.id, 'id'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const filename = decodeMultipartFilename(req.file.originalname);
        const { entries: parsedEntries, errors: parseErrors } = parseGlossaryImportFile(
          req.file.buffer,
          filename
        );

        if (parsedEntries.length === 0 && parseErrors.length > 0) {
          return res.status(400).json({
            error: 'Failed to parse glossary file',
            added: 0,
            skipped: 0,
            errors: parseErrors,
          });
        }

        if (parsedEntries.length > GLOSSARY_IMPORT_MAX_ENTRIES) {
          return res.status(400).json({
            error: `Too many entries (max ${GLOSSARY_IMPORT_MAX_ENTRIES})`,
            added: 0,
            skipped: 0,
            errors: parseErrors,
          });
        }

        const { toInsert, skipped } = filterNewGlossaryEntries(parsedEntries, project.glossary);

        const prepared = toInsert.map((entry) => prepareGlossaryEntryForInsert(entry));
        const inserted = await importGlossaryEntriesBatch(
          requireRouteParam(req.params.id, 'id'),
          prepared,
          token
        );

        clearAgentCache(requireRouteParam(req.params.id, 'id'));
        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.id, 'id'),
          token
        );

        req.log?.info(
          {
            event: 'glossary.imported',
            projectId: requireRouteParam(req.params.id, 'id'),
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
          return res.status(400).json({ error: error.message });
        }
        if (error instanceof Error && error.message.includes('Supported formats')) {
          return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to import glossary' });
      }
    }
  );

  app.post('/api/projects/:id/glossary', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify project belongs to user
      const token = requireToken(req);
      const project = await getProject(requireRouteParam(req.params.id, 'id'), req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const parsed = glossaryCreateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const prepared = prepareGlossaryEntryForInsert(parsed.data);

      const entry = await addGlossaryEntry(
        requireRouteParam(req.params.id, 'id'),
        prepared,
        requireToken(req)
      );

      // Clear agent cache to reload glossary
      clearAgentCache(requireRouteParam(req.params.id, 'id'));

      if (!entry) {
        return res.status(404).json({ error: 'Project not found' });
      }

      await invalidateProjectAndRelatedCaches(
        req.user.id,
        requireRouteParam(req.params.id, 'id'),
        token
      );
      res.json(entry);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to add glossary entry' });
    }
  });

  app.put(
    '/api/projects/:projectId/glossary/:entryId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify project belongs to user
        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const parsed = glossaryUpdateBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
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

        // Re-generate declensions if character name changed
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
        if (primaryLocationId !== undefined)
          updates.primaryLocationId = primaryLocationId || undefined;

        const entry = await updateGlossaryEntry(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.entryId, 'entryId'),
          updates,
          token
        );

        if (!entry) {
          return res.status(404).json({ error: 'Entry not found' });
        }

        // Clear agent cache to reload glossary
        clearAgentCache(requireRouteParam(req.params.projectId, 'projectId'));

        req.log?.info(
          {
            event: 'glossary.updated',
            entryId: entry.id,
            original: entry.original,
            translated: entry.translated,
          },
          `Glossary updated: ${entry.original} → ${entry.translated}`
        );

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        res.json(entry);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to update glossary entry' });
      }
    }
  );

  app.delete(
    '/api/projects/:projectId/glossary/:entryId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify project belongs to user
        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const success = await deleteGlossaryEntry(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.entryId, 'entryId'),
          token
        );
        if (!success) {
          return res.status(404).json({ error: 'Entry not found' });
        }

        // Clear agent cache
        clearAgentCache(requireRouteParam(req.params.projectId, 'projectId'));

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        res.json({ success: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to delete glossary entry' });
      }
    }
  );

  // Bulk delete glossary entries
  app.post(
    '/api/projects/:projectId/glossary/bulk-delete',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const parsed = glossaryBulkDeleteBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }
        const { entryIds } = parsed.data;

        const deletedCount = await deleteGlossaryEntriesBulk(
          requireRouteParam(req.params.projectId, 'projectId'),
          entryIds,
          token
        );

        clearAgentCache(requireRouteParam(req.params.projectId, 'projectId'));
        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        res.json({ success: true, deletedCount });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to bulk delete glossary entries' });
      }
    }
  );
  // Suggest glossary merges (LLM analyzes and returns groups of entries to merge)
  app.post(
    '/api/projects/:projectId/glossary/suggest-merges',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }
        if (!deps.config.openai?.apiKey) {
          return res.status(503).json({
            error: 'AI not configured',
            message: 'Configure OpenAI API key to use merge suggestions.',
          });
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
    }
  );

  // Merge glossary entries into one (keep one, merge fields, delete others)
  app.post(
    '/api/projects/:projectId/glossary/merge',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const parsed = glossaryMergeBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }
        const { entryIds, keepEntryId } = parsed.data;

        const idSet = new Set(entryIds);
        const entries = project.glossary.filter((e) => idSet.has(e.id));
        if (entries.length !== entryIds.length) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'One or more entry IDs not found in this project glossary.',
          });
        }

        const types = entries.map((e) => e.type);
        if (new Set(types).size > 1) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'All entries must be of the same type (character, location, or term).',
          });
        }

        if (keepEntryId !== undefined && !idSet.has(keepEntryId)) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'keepEntryId must be one of the entryIds.',
          });
        }

        // Pick primary: keepEntryId, or entry with most mentionedInChapters, or first
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

        // Merge: mentionedInChapters union (sorted), description/notes concatenation
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
          notesList.length > 0
            ? [...new Set(notesList)].filter(Boolean).join(' ; ')
            : primary.notes;

        await updateGlossaryEntry(
          requireRouteParam(req.params.projectId, 'projectId'),
          primary.id,
          {
            mentionedInChapters: mergedChapters,
            ...(mergedDescription !== undefined && { description: mergedDescription }),
            ...(mergedNotes !== undefined && { notes: mergedNotes }),
          },
          token
        );

        for (const e of others) {
          await deleteGlossaryEntry(
            requireRouteParam(req.params.projectId, 'projectId'),
            e.id,
            token
          );
        }

        clearAgentCache(requireRouteParam(req.params.projectId, 'projectId'));

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        const kept = await getGlossaryEntry(
          requireRouteParam(req.params.projectId, 'projectId'),
          primary.id,
          token
        );
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
  );

  app.post(
    '/api/projects/:projectId/glossary/:entryId/image',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadImage.single('image')),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No image file provided' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const entry = project.glossary.find(
          (e) => e.id === requireRouteParam(req.params.entryId, 'entryId')
        );
        if (!entry) {
          return res.status(404).json({ error: 'Entry not found' });
        }

        // Upload to Supabase Storage
        const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
        const storagePath = generateUniqueFilename(
          `glossary-${requireRouteParam(req.params.entryId, 'entryId')}`,
          ext,
          requireRouteParam(req.params.projectId, 'projectId')
        );

        const uploadResult = await uploadFile('images', storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });

        // Migrate legacy imageUrl to imageUrls array if needed
        let imageUrls = entry.imageUrls || [];
        if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
          imageUrls = [entry.imageUrl, ...imageUrls];
        }

        // Add new image to gallery
        imageUrls = [...imageUrls, uploadResult.publicUrl];

        // Update entry with new gallery
        const updatedEntry = await updateGlossaryEntry(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.entryId, 'entryId'),
          {
            imageUrls,
            // Keep legacy imageUrl for backward compatibility (use first image)
            imageUrl: imageUrls[0],
          },
          token
        );

        if (!updatedEntry) {
          // Rollback: delete uploaded file if update failed
          await deleteFile('images', storagePath).catch((err) =>
            logger.error({ err, storagePath }, 'Failed to delete file from storage')
          );
          return res.status(404).json({ error: 'Failed to update entry' });
        }

        // Clear agent cache so next translation uses updated entry (e.g. imageUrls)
        clearAgentCache(requireRouteParam(req.params.projectId, 'projectId'));

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
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
  );

  app.delete(
    '/api/projects/:projectId/glossary/:entryId/image/:imageIndex',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const entry = project.glossary.find(
          (e) => e.id === requireRouteParam(req.params.entryId, 'entryId')
        );
        if (!entry) {
          return res.status(404).json({ error: 'Entry not found' });
        }

        const imageIndex = parseInt(requireRouteParam(req.params.imageIndex, 'imageIndex'), 10);
        if (isNaN(imageIndex)) {
          return res.status(400).json({ error: 'Invalid image index' });
        }

        // Get current imageUrls (migrate from legacy if needed)
        let imageUrls = entry.imageUrls || [];
        if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
          imageUrls = [entry.imageUrl, ...imageUrls];
        }

        if (imageIndex < 0 || imageIndex >= imageUrls.length) {
          return res.status(400).json({ error: 'Image index out of range' });
        }

        // Delete the image file from Supabase Storage
        const imageUrlToDelete = imageUrls[imageIndex];
        const storagePath = extractPathFromUrl(imageUrlToDelete, 'images');
        if (storagePath) {
          await deleteFile('images', storagePath).catch((err) => {
            req.log?.error({ err }, 'Failed to delete image from storage');
            // Continue even if deletion fails
          });
        }

        // Remove from array
        imageUrls = imageUrls.filter((_, idx) => idx !== imageIndex);

        // Update entry
        const updatedEntry = await updateGlossaryEntry(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.entryId, 'entryId'),
          {
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
            imageUrl: imageUrls.length > 0 ? imageUrls[0] : undefined, // Legacy support
          },
          token
        );

        clearAgentCache(requireRouteParam(req.params.projectId, 'projectId'));

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        res.json({ success: true, imageUrls: updatedEntry?.imageUrls || [] });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to delete image');
        res.status(500).json({ error: 'Failed to delete image' });
      }
    }
  );

  // Legacy endpoint: delete all images (for backward compatibility) (requires auth)
  app.delete(
    '/api/projects/:projectId/glossary/:entryId/image',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const entry = project.glossary.find(
          (e) => e.id === requireRouteParam(req.params.entryId, 'entryId')
        );
        if (!entry) {
          return res.status(404).json({ error: 'Entry not found' });
        }

        // Get all image URLs (migrate from legacy if needed)
        let imageUrls = entry.imageUrls || [];
        if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
          imageUrls = [entry.imageUrl, ...imageUrls];
        }

        // Delete all image files from Supabase Storage
        const storagePaths = imageUrls
          .map((url) => extractPathFromUrl(url, 'images'))
          .filter((p): p is string => p !== null);

        if (storagePaths.length > 0) {
          await deleteFiles('images', storagePaths).catch((err) => {
            req.log?.error({ err }, 'Failed to delete images from storage');
            // Continue even if deletion fails
          });
        }

        // Update entry to remove all images
        await updateGlossaryEntry(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.entryId, 'entryId'),
          {
            imageUrls: undefined,
            imageUrl: undefined,
          },
          token
        );

        clearAgentCache(requireRouteParam(req.params.projectId, 'projectId'));

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        res.json({ success: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to delete images');
        res.status(500).json({ error: 'Failed to delete images' });
      }
    }
  );
}
