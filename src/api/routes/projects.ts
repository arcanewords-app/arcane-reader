import type { Application } from 'express';
import {
  projectCreateBodySchema,
  projectCloneBodySchema,
  projectRenameBodySchema,
  transferChaptersBodySchema,
  projectLanguagesBodySchema,
  projectSearchQuerySchema,
  projectAiReplaceBodySchema,
  projectSettingsBodySchema,
  paragraphBulkUpdateBodySchema,
} from '../schemas/index.js';
import {
  getAllProjectsLightweight,
  getProject,
  createProject,
  createProjectFromCatalogRequest,
  cloneProject,
  transferChaptersFromProject,
  updateProject,
  deleteProject,
  getChaptersSummary,
  searchParagraphsInProject,
  bulkUpdateParagraphs,
  updateReaderSettings,
  getReaderSettings,
  resetStuckChapters,
} from '../../services/supabaseDatabase.js';

import { requireAuth, requireRole } from '../../middleware/auth.js';
import { handleServiceError } from '../../middleware/serviceHealth.js';

import { requireToken } from '../../utils/requestHelpers.js';
import { checkTokenLimit, incrementTokenUsage } from '../../middleware/tokenLimits.js';

import { isProjectLimitError } from '../../config/projectLimits.js';
import { clearAgentCache } from '../../services/engine-integration.js';
import { clampStageModelsForRole, clampStageModelForRole } from '../../shared/modelAccess.js';
import { normalizeQueryRecord, requireRouteParam } from '../validateRoute.js';

import { invalidateAnalysisForProject } from '../../services/analysisCache.js';
import { isProjectLanguagePairLocked } from '../../services/projectLanguagePair.js';

import { invalidateProjectAndRelatedCaches } from '../../services/cacheInvalidation.js';
import { invalidateUserProjectCaches } from '../routeHelpers.js';
import type { RouteDeps } from './deps.js';

export function registerProjectRoutes(app: Application, _deps: RouteDeps): void {
  app.get('/api/projects', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = req.user;

      const token = requireToken(req);

      // Reset stuck chapters across all projects on startup/refresh
      let resetCount = 0;
      try {
        resetCount = await resetStuckChapters(token, undefined);
        if (resetCount > 0) {
          req.log?.info(
            { event: 'stuck_chapters.reset', count: resetCount },
            `Reset ${resetCount} stuck chapter(s)`
          );
        }
      } catch (resetErr) {
        req.log?.error({ err: resetErr, phase: 'resetStuckChapters' }, 'resetStuckChapters failed');
        throw resetErr;
      }

      let projectList;
      try {
        projectList = await getAllProjectsLightweight(user.id, token);
      } catch (getAllErr) {
        req.log?.error(
          { err: getAllErr, phase: 'getAllProjectsLightweight' },
          'getAllProjectsLightweight failed'
        );
        throw getAllErr;
      }

      res.json(projectList);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to get projects');
      res.status(500).json({ error: 'Failed to get projects' });
    }
  });

  app.post('/api/projects', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const parsed = projectCreateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const {
        name,
        sourceLanguage,
        targetLanguage,
        catalogTranslationRequestId,
        translatorEntityId,
      } = parsed.data;
      const token = requireToken(req);
      const project = catalogTranslationRequestId
        ? await createProjectFromCatalogRequest(
            {
              name,
              sourceLanguage,
              targetLanguage,
              catalogTranslationRequestId,
              translatorEntityId,
              role: req.user.role,
            },
            req.user.id,
            token
          )
        : await createProject(
            { name, sourceLanguage, targetLanguage, role: req.user.role },
            req.user.id,
            token
          );
      await invalidateUserProjectCaches(req.user.id);
      res.json(project);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      if (isProjectLimitError(error)) {
        return res.status(409).json({
          error: 'Project limit reached',
          code: 'PROJECT_LIMIT',
          limit: error.limit,
          current: error.current,
        });
      }
      const code = (error as Error & { code?: string }).code;
      if (code === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Translation request not found' });
      }
      if (code === 'SELF_ASSIGN') {
        return res.status(409).json({
          error: 'Cannot take your own translation request',
          code: 'SELF_ASSIGN',
        });
      }
      if (code === 'REQUEST_CLOSED') {
        return res.status(409).json({
          error: 'Translation request is not open',
          code: 'REQUEST_CLOSED',
        });
      }
      if (code === 'INVALID_TRANSLATOR') {
        return res.status(400).json({
          error: 'Translator entity is required',
          code: 'INVALID_TRANSLATOR',
        });
      }
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // Clone project (requires auth)
  app.post('/api/projects/:id/clone', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const parsed = projectCloneBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const token = requireToken(req);
      const cloned = await cloneProject(
        requireRouteParam(req.params.id, 'id'),
        req.user.id,
        token,
        {
          name: parsed.data.name,
          role: req.user.role,
        }
      );
      if (!cloned) {
        return res.status(404).json({ error: 'Project not found' });
      }
      await invalidateUserProjectCaches(req.user.id);
      res.json(cloned);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      if (isProjectLimitError(error)) {
        return res.status(409).json({
          error: 'Project limit reached',
          code: 'PROJECT_LIMIT',
          limit: error.limit,
          current: error.current,
        });
      }
      if (
        error instanceof Error &&
        (error as Error & { code?: string }).code === 'CLONE_INCOMPLETE'
      ) {
        const incomplete = error as Error & { expected?: number; actual?: number };
        return res.status(500).json({
          error: incomplete.message,
          code: 'CLONE_INCOMPLETE',
          expected: incomplete.expected,
          actual: incomplete.actual,
        });
      }
      req.log?.error(
        { err: error, projectId: requireRouteParam(req.params.id, 'id') },
        'Failed to clone project'
      );
      res.status(500).json({ error: 'Failed to clone project' });
    }
  });

  // Transfer chapters from another project (requires auth)
  app.post(
    '/api/projects/:targetProjectId/transfer-from',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const parsed = transferChaptersBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }

        const token = requireToken(req);
        const result = await transferChaptersFromProject(
          requireRouteParam(req.params.targetProjectId, 'targetProjectId'),
          req.user.id,
          token,
          {
            sourceProjectId: parsed.data.sourceProjectId,
            chapterIds: parsed.data.chapterIds,
            includeGlossary: parsed.data.includeGlossary,
          }
        );

        if (!result) {
          return res.status(404).json({ error: 'Project not found' });
        }

        clearAgentCache(requireRouteParam(req.params.targetProjectId, 'targetProjectId'));
        if (parsed.data.includeGlossary) {
          clearAgentCache(parsed.data.sourceProjectId);
        }
        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.targetProjectId, 'targetProjectId'),
          token
        );

        res.json(result);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const coded = error as Error & { code?: string; expected?: number; actual?: number };
        if (coded.code === 'SAME_PROJECT') {
          return res.status(409).json({ error: coded.message, code: 'SAME_PROJECT' });
        }
        if (coded.code === 'TARGET_LANGUAGE_MISMATCH') {
          return res.status(409).json({ error: coded.message, code: 'TARGET_LANGUAGE_MISMATCH' });
        }
        if (coded.code === 'INVALID_CHAPTER_IDS') {
          return res.status(400).json({ error: coded.message, code: 'INVALID_CHAPTER_IDS' });
        }
        if (coded.code === 'TRANSFER_INCOMPLETE') {
          return res.status(500).json({
            error: coded.message,
            code: 'TRANSFER_INCOMPLETE',
            expected: coded.expected,
            actual: coded.actual,
          });
        }
        req.log?.error(
          {
            err: error,
            targetProjectId: requireRouteParam(req.params.targetProjectId, 'targetProjectId'),
          },
          'Failed to transfer chapters'
        );
        res.status(500).json({ error: 'Failed to transfer chapters' });
      }
    }
  );

  app.get('/api/projects/:id', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = req.user;

      const token = requireToken(req);
      const project = await getProject(requireRouteParam(req.params.id, 'id'), user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Reset stuck chapters is called inside getProject
      // This ensures chapters are checked every time project is loaded

      res.json(project);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to get project' });
    }
  });

  app.get(
    '/api/projects/:id/chapters/summary',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const user = req.user;

        const token = requireToken(req);
        const summary = await getChaptersSummary(
          requireRouteParam(req.params.id, 'id'),
          user.id,
          token
        );
        res.json(summary);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to get chapters summary' });
      }
    }
  );

  // Search paragraphs in project (requires auth)
  app.get('/api/projects/:id/search', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const projectId = requireRouteParam(req.params.id, 'id');
      const queryResult = projectSearchQuerySchema.safeParse(
        normalizeQueryRecord(req.query as Record<string, unknown>)
      );
      if (!queryResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: queryResult.error.flatten().fieldErrors,
        });
      }
      const {
        q,
        field,
        caseSensitive,
        wholeWord,
        chapterIds,
        chapterFrom,
        chapterTo,
        offset,
        limit,
      } = queryResult.data;

      const token = requireToken(req);
      const project = await getProject(projectId, req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const parsedChapterIds = chapterIds
        ? chapterIds
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined;

      const result = await searchParagraphsInProject(projectId, q, field, token, {
        caseSensitive,
        wholeWord,
        chapterIds: parsedChapterIds,
        chapterFrom,
        chapterTo,
        offset,
        limit,
      });
      res.json(result);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to search project' });
    }
  });

  // AI smart replace for project search (Author+)
  app.post(
    '/api/projects/:id/search/ai-replace',
    requireAuth,
    requireRole('author_plus'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const projectId = requireRouteParam(req.params.id, 'id');
        const parsed = projectAiReplaceBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }

        const token = requireToken(req);
        const project = await getProject(projectId, req.user.id, token);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const {
          runProjectAiReplace,
          AiReplaceTooManyError,
          AiReplaceInputTooLargeError,
          AiReplaceNoChangesError,
          AiReplaceOutputInvalidError,
        } = await import('../../services/project-ai-replace.js');
        const { loadParagraphsForAiReplace } = await import('../../services/supabaseDatabase.js');
        const { sanitizeAiReplaceDetail } = await import('../../shared/aiReplacePresets.js');
        const { estimateAiReplaceTokens } = await import('../../shared/aiReplaceEstimate.js');

        const body = {
          ...parsed.data,
          detail: sanitizeAiReplaceDetail(parsed.data.detail),
        };

        const loaded = await loadParagraphsForAiReplace(projectId, body.paragraphs, token);
        const totalChars = loaded.reduce((sum, p) => sum + p.translatedText.length, 0);
        const estimatedTokens = estimateAiReplaceTokens(totalChars, loaded.length);
        const limitCheck = await checkTokenLimit(
          req.user.id,
          token,
          estimatedTokens,
          req.user.role
        );
        if (!limitCheck.allowed) {
          const now = new Date();
          const resetTime = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
          );
          return res.status(429).json({
            error: 'Token limit exceeded',
            code: 'AI_REPLACE_TOKEN_LIMIT',
            message: limitCheck.message || 'Дневной лимит токенов исчерпан. Попробуйте завтра.',
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            estimatedTokens,
            resetAt: resetTime.toISOString(),
          });
        }

        let result;
        try {
          result = await runProjectAiReplace(project, body, token);
        } catch (err) {
          if (err instanceof AiReplaceTooManyError) {
            return res.status(400).json({ error: err.message, code: err.code });
          }
          if (err instanceof AiReplaceInputTooLargeError) {
            return res.status(400).json({ error: err.message, code: err.code });
          }
          if (err instanceof AiReplaceNoChangesError) {
            return res.status(422).json({ error: err.message, code: err.code });
          }
          if (err instanceof AiReplaceOutputInvalidError) {
            req.log?.warn(
              {
                event: 'ai_replace.validation_failed',
                reason: err.reason,
                paragraphId: err.paragraphId,
                beforeLen: err.beforeLen,
                afterLen: err.afterLen,
                changeRatio: err.changeRatio,
              },
              'AI replace paragraph rejected'
            );
            return res.status(422).json({
              error: err.message,
              code: err.code,
              paragraphId: err.paragraphId,
              reason: err.reason,
              changeRatio: err.changeRatio,
            });
          }
          throw err;
        }

        await incrementTokenUsage(req.user.id, token, result.tokensUsed);

        res.json(result);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Project AI replace failed');
        res.status(500).json({ error: 'Failed to run AI replace' });
      }
    }
  );

  // Bulk update paragraphs (requires auth)
  app.post(
    '/api/projects/:id/paragraphs/bulk-update',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const projectId = requireRouteParam(req.params.id, 'id');
        const parsed = paragraphBulkUpdateBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }
        const { updates } = parsed.data;

        const token = requireToken(req);
        const project = await getProject(projectId, req.user.id, token);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const result = await bulkUpdateParagraphs(projectId, updates, token);
        await invalidateUserProjectCaches(req.user.id, projectId);
        res.json(result);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to bulk update paragraphs' });
      }
    }
  );

  // Rename project (requires auth)
  app.patch('/api/projects/:id', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parsed = projectRenameBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const token = requireToken(req);
      const updatedProject = await updateProject(
        requireRouteParam(req.params.id, 'id'),
        { name: parsed.data.name },
        req.user.id,
        token
      );
      if (!updatedProject) {
        return res.status(404).json({ error: 'Project not found' });
      }

      await invalidateUserProjectCaches(req.user.id, requireRouteParam(req.params.id, 'id'));
      res.json(updatedProject);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to rename project' });
    }
  });

  app.delete('/api/projects/:id', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const success = await deleteProject(
        requireRouteParam(req.params.id, 'id'),
        req.user.id,
        requireToken(req)
      );
      if (!success) {
        return res.status(404).json({ error: 'Project not found' });
      }
      await invalidateUserProjectCaches(req.user.id, requireRouteParam(req.params.id, 'id'));
      res.json({ success: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  app.put('/api/projects/:id/settings', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parsed = projectSettingsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const body = parsed.data;

      const token = requireToken(req);
      const project = await getProject(requireRouteParam(req.params.id, 'id'), req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const {
        model, // Legacy: single model
        stageModels, // New: per-stage models
        temperature,
        temperatureByStage, // Per-stage creativity
        enableAnalysis,
        enableEditing,
        enableTranslation, // Allow toggling translation (for original reading mode)
        originalReadingMode, // New: original reading mode flag
        includeGlossaryInAnalysis,
        includeGlossaryInTranslation,
        includeGlossaryInEditing,
        textBlockTypes,
        includeTextBlockTypesInTranslation,
        customInstructions,
        editingStylePreset,
        editingFocus,
        allowReasoningModelsForAnalysis,
        translateExecutionMode,
        editExecutionMode,
        enableTranslateFewShot,
        enableTranslateCoT,
        enableTranslateStructuredCoT,
        translateLeadingContextParagraphs,
        miniModelTranslationProfile,
        forceChunked,
        chunkSize,
      } = body;

      // Preserve existing reader settings
      const existingReader = project.settings.reader;

      // Update settings, preserving existing stageModels if not provided
      const updatedSettings: typeof project.settings = {
        ...project.settings,
        temperature: temperature ?? project.settings.temperature,
        enableAnalysis: enableAnalysis ?? project.settings.enableAnalysis ?? true,
        enableTranslation: enableTranslation ?? project.settings.enableTranslation ?? true,
        enableEditing: enableEditing ?? project.settings.enableEditing ?? true,
        originalReadingMode: originalReadingMode ?? project.settings.originalReadingMode ?? false,
        includeGlossaryInAnalysis:
          includeGlossaryInAnalysis ?? project.settings.includeGlossaryInAnalysis ?? true,
        includeGlossaryInTranslation:
          includeGlossaryInTranslation ?? project.settings.includeGlossaryInTranslation ?? true,
        includeGlossaryInEditing:
          includeGlossaryInEditing ?? project.settings.includeGlossaryInEditing ?? true,
        reader: existingReader,
      };

      if (temperatureByStage != null && typeof temperatureByStage === 'object') {
        updatedSettings.temperatureByStage = {
          ...(project.settings.temperatureByStage || {}),
          ...temperatureByStage,
        };
      }

      // Handle model updates
      if (stageModels) {
        // Update per-stage models
        updatedSettings.stageModels = {
          ...(project.settings.stageModels || {}),
          ...stageModels,
        };
      } else if (model) {
        // Legacy: update single model (will be migrated to stageModels on next load)
        updatedSettings.model = model;
      }

      if (updatedSettings.stageModels) {
        updatedSettings.stageModels =
          clampStageModelsForRole(updatedSettings.stageModels, req.user.role) ??
          updatedSettings.stageModels;
      }
      if (updatedSettings.model) {
        updatedSettings.model = clampStageModelForRole(
          updatedSettings.model,
          'translation',
          req.user.role
        );
      }

      if (textBlockTypes !== undefined) {
        updatedSettings.textBlockTypes = textBlockTypes as typeof project.settings.textBlockTypes;
      }
      if (includeTextBlockTypesInTranslation !== undefined) {
        updatedSettings.includeTextBlockTypesInTranslation = includeTextBlockTypesInTranslation;
      }
      if (customInstructions !== undefined) {
        updatedSettings.customInstructions = customInstructions;
      }
      if (editingStylePreset !== undefined) {
        updatedSettings.editingStylePreset = editingStylePreset;
      }
      if (editingFocus !== undefined) {
        updatedSettings.editingFocus = editingFocus;
      }
      if (allowReasoningModelsForAnalysis !== undefined) {
        updatedSettings.allowReasoningModelsForAnalysis = allowReasoningModelsForAnalysis;
      }

      const clearableEngineKeys = {
        translateExecutionMode,
        editExecutionMode,
        chunkSize,
        enableTranslateFewShot,
        enableTranslateCoT,
        enableTranslateStructuredCoT,
        translateLeadingContextParagraphs,
        miniModelTranslationProfile,
      } as const;
      for (const [key, value] of Object.entries(clearableEngineKeys)) {
        if (value === null) {
          delete (updatedSettings as unknown as Record<string, unknown>)[key];
        } else if (value !== undefined) {
          (updatedSettings as unknown as Record<string, unknown>)[key] = value;
        }
      }
      if (forceChunked !== undefined) {
        updatedSettings.forceChunked = forceChunked;
      }

      await updateProject(
        requireRouteParam(req.params.id, 'id'),
        { settings: updatedSettings },
        req.user.id,
        token
      );
      await invalidateUserProjectCaches(req.user.id, requireRouteParam(req.params.id, 'id'));

      // Get updated project to return fresh settings
      const updatedProject = await getProject(
        requireRouteParam(req.params.id, 'id'),
        req.user.id,
        token
      );
      if (!updatedProject) {
        return res.status(404).json({ error: 'Project not found' });
      }

      req.log?.info(
        {
          event: 'project.settings.updated',
          projectId: updatedProject.id,
          projectName: updatedProject.name,
          model: updatedSettings.stageModels?.translation || updatedSettings.model || 'N/A',
          originalReadingMode: !!updatedSettings.originalReadingMode,
        },
        `Project settings updated: ${updatedProject.name}`
      );

      res.json(updatedProject.settings);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  app.put('/api/projects/:id/languages', requireAuth, requireRole('author'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parsed = projectLanguagesBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const token = requireToken(req);
      const project = await getProject(requireRouteParam(req.params.id, 'id'), req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const { sourceLanguage, targetLanguage } = parsed.data;

      if (isProjectLanguagePairLocked(project)) {
        return res.status(409).json({
          error: 'Language pair locked',
          message: 'Language pair cannot be changed after analysis or glossary entries exist.',
          code: 'LANGUAGE_PAIR_LOCKED',
        });
      }

      const updatedProject = await updateProject(
        requireRouteParam(req.params.id, 'id'),
        { sourceLanguage, targetLanguage },
        req.user.id,
        token
      );
      if (!updatedProject) {
        return res.status(404).json({ error: 'Project not found' });
      }

      clearAgentCache(requireRouteParam(req.params.id, 'id'));
      await invalidateAnalysisForProject(requireRouteParam(req.params.id, 'id'));
      await invalidateUserProjectCaches(req.user.id, requireRouteParam(req.params.id, 'id'));

      req.log?.info(
        {
          event: 'project.languages.updated',
          projectId: requireRouteParam(req.params.id, 'id'),
          sourceLanguage,
          targetLanguage,
        },
        'Project language pair updated'
      );

      res.json({
        sourceLanguage: updatedProject.sourceLanguage,
        targetLanguage: updatedProject.targetLanguage,
      });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to update project languages' });
    }
  });

  app.get(
    '/api/projects/:id/settings/reader',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
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

        const reader = getReaderSettings(project);
        res.json(reader);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to get reader settings' });
      }
    }
  );

  app.put(
    '/api/projects/:id/settings/reader',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const reader = await updateReaderSettings(
          requireRouteParam(req.params.id, 'id'),
          req.body,
          req.user.id,
          token
        );
        if (!reader) {
          return res.status(404).json({ error: 'Project not found' });
        }

        req.log?.info(
          {
            event: 'reader.settings.updated',
            projectId: requireRouteParam(req.params.id, 'id'),
            fontFamily: reader.fontFamily,
            fontSize: reader.fontSize,
            colorScheme: reader.colorScheme,
          },
          'Reader settings updated'
        );

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.id, 'id'),
          token
        );
        res.json(reader);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to update reader settings' });
      }
    }
  );
}
