/**
 * Dev-only Prompt Lab API routes.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { Express, Response } from 'express';
import express from 'express';
import multer from 'multer';
import {
  promptLabCurrentQuerySchema,
  promptLabPreviewBodySchema,
  promptLabRunBodySchema,
  promptLabTextBodySchema,
  promptLabPromptBodySchema,
  promptLabRunPatchSchema,
  promptLabEvaluateBodySchema,
} from '../api/schemas/prompt-lab.js';
import { loadConfig } from '../config.js';
import {
  assertSupportedPair,
  getEffectiveStagePrompts,
  languageDisplayName,
  normalizeLabSourceText,
  parseProjectLanguage,
  SUPPORTED_TRANSLATION_PAIRS,
} from '../engine/index.js';
import { analysisExcludedModelIds, DEFAULT_LLM_MODEL, LLM_MODELS } from '../shared/llmModels.js';
import { parseGlossaryImportFile } from '../services/glossaryImportExport.js';
import {
  deletePromptLabPrompt,
  deletePromptLabRun,
  deletePromptLabText,
  deletePromptLabEvaluation,
  getPromptLabEvaluation,
  getPromptLabPrompt,
  getPromptLabRun,
  insertPromptLabEvaluation,
  insertPromptLabPrompt,
  insertPromptLabRun,
  insertPromptLabText,
  listPromptLabEvaluations,
  listPromptLabPrompts,
  listPromptLabRuns,
  listPromptLabTexts,
  updatePromptLabPrompt,
  updatePromptLabRun,
  updatePromptLabText,
} from './db.js';
import {
  buildEvaluationPrompts,
  EvaluationModeError,
  runPromptLabEvaluation,
} from './evaluator.js';
import { buildRunDisplayName } from './runNaming.js';
import { buildInputSnapshot, previewUserPrompt, runPromptLabStage } from './runner.js';
import {
  rowToPromptLabEvaluation,
  rowToPromptLabPrompt,
  rowToPromptLabRun,
  rowToPromptLabText,
  type PromptLabRunParams,
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_LAB_DIST = path.resolve(__dirname, '../../dist/prompt-lab');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function sendZodError(res: Response, error: { flatten: () => unknown }): void {
  res.status(400).json({ error: 'Validation failed', details: error.flatten() });
}

export function registerPromptLabRoutes(app: Express): void {
  if (process.env.NODE_ENV === 'production') return;

  app.get('/prompt-lab', (_req, res) => {
    const port = process.env.PROMPT_LAB_APP_PORT ?? '5175';
    res.redirect(302, `http://localhost:${port}/prompt-lab/`);
  });

  app.use('/prompt-lab', express.static(PROMPT_LAB_DIST));

  app.get('/api/prompt-lab/meta', (_req, res) => {
    const appConfig = loadConfig();
    const defaultModel = appConfig.openai.model || DEFAULT_LLM_MODEL;
    const pairs = SUPPORTED_TRANSLATION_PAIRS.map((pair) => {
      const [source, target] = pair.split('-') as [string, string];
      const srcLabel = languageDisplayName(parseProjectLanguage(source, 'source'));
      const tgtLabel = languageDisplayName(parseProjectLanguage(target, 'target'));
      return {
        source,
        target,
        label: `${srcLabel} → ${tgtLabel}`,
      };
    });
    res.json({
      pairs,
      stages: ['analyze', 'translate', 'edit'],
      presets: ['default', 'literary', 'minimal', 'ai_revivification'],
      focusOptions: ['fix_problems', 'style_only', 'both'],
      defaultModel,
      models: LLM_MODELS,
      analysisExcludedModels: analysisExcludedModelIds(),
    });
  });

  app.get('/api/prompt-lab/prompts/current', (req, res) => {
    const parsed = promptLabCurrentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    const { stage, source, target, preset, focus } = parsed.data;
    try {
      assertSupportedPair(source, target);
      const effective = getEffectiveStagePrompts(stage, source, target, { preset, focus });
      res.json(effective);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid pair' });
    }
  });

  app.post('/api/prompt-lab/prompts/preview-user', (req, res) => {
    const parsed = promptLabPreviewBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    try {
      assertSupportedPair(parsed.data.sourceLanguage, parsed.data.targetLanguage);
      const userPrompt = previewUserPrompt(parsed.data);
      res.json({ userPrompt });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Preview failed' });
    }
  });

  app.get('/api/prompt-lab/prompts', async (req, res) => {
    try {
      const rows = await listPromptLabPrompts({
        stage: typeof req.query.stage === 'string' ? req.query.stage : undefined,
        sourceLanguage: typeof req.query.source === 'string' ? req.query.source : undefined,
        targetLanguage: typeof req.query.target === 'string' ? req.query.target : undefined,
      });
      res.json({ prompts: rows.map(rowToPromptLabPrompt) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to list prompts' });
    }
  });

  app.post('/api/prompt-lab/prompts', async (req, res) => {
    const parsed = promptLabPromptBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    try {
      assertSupportedPair(parsed.data.sourceLanguage, parsed.data.targetLanguage);
      const row = await insertPromptLabPrompt({
        stage: parsed.data.stage,
        source_language: parsed.data.sourceLanguage,
        target_language: parsed.data.targetLanguage,
        name: parsed.data.name,
        system_prompt: parsed.data.systemPrompt,
        user_prompt_override: parsed.data.userPromptOverride ?? null,
        preset: parsed.data.preset ?? null,
        focus: parsed.data.focus ?? null,
        origin: parsed.data.origin ?? 'manual',
      });
      res.status(201).json(rowToPromptLabPrompt(row));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to save prompt' });
    }
  });

  app.put('/api/prompt-lab/prompts/:id', async (req, res) => {
    const parsed = promptLabPromptBodySchema.partial().safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    try {
      const patch: Record<string, unknown> = {};
      if (parsed.data.name) patch.name = parsed.data.name;
      if (parsed.data.systemPrompt) patch.system_prompt = parsed.data.systemPrompt;
      if (parsed.data.userPromptOverride !== undefined)
        patch.user_prompt_override = parsed.data.userPromptOverride;
      if (parsed.data.preset !== undefined) patch.preset = parsed.data.preset;
      if (parsed.data.focus !== undefined) patch.focus = parsed.data.focus;
      const row = await updatePromptLabPrompt(req.params.id, patch);
      res.json(rowToPromptLabPrompt(row));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to update prompt' });
    }
  });

  app.delete('/api/prompt-lab/prompts/:id', async (req, res) => {
    try {
      await deletePromptLabPrompt(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to delete prompt' });
    }
  });

  app.get('/api/prompt-lab/texts', async (_req, res) => {
    try {
      const rows = await listPromptLabTexts();
      res.json({ texts: rows.map(rowToPromptLabText) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to list texts' });
    }
  });

  app.post('/api/prompt-lab/texts', async (req, res) => {
    const parsed = promptLabTextBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    try {
      assertSupportedPair(parsed.data.sourceLanguage, parsed.data.targetLanguage);
      const row = await insertPromptLabText({
        title: parsed.data.title,
        source_language: parsed.data.sourceLanguage,
        target_language: parsed.data.targetLanguage,
        stage_hint: parsed.data.stageHint ?? null,
        content: normalizeLabSourceText(parsed.data.content),
        translated_text: parsed.data.translatedText
          ? normalizeLabSourceText(parsed.data.translatedText)
          : null,
        glossary_snapshot: parsed.data.glossarySnapshot ?? null,
      });
      res.status(201).json(rowToPromptLabText(row));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to save text' });
    }
  });

  app.put('/api/prompt-lab/texts/:id', async (req, res) => {
    const parsed = promptLabTextBodySchema.partial().safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    try {
      const patch: Record<string, unknown> = {};
      if (parsed.data.title) patch.title = parsed.data.title;
      if (parsed.data.content !== undefined) patch.content = parsed.data.content;
      if (parsed.data.translatedText !== undefined)
        patch.translated_text = parsed.data.translatedText;
      if (parsed.data.glossarySnapshot !== undefined)
        patch.glossary_snapshot = parsed.data.glossarySnapshot;
      if (parsed.data.sourceLanguage) patch.source_language = parsed.data.sourceLanguage;
      if (parsed.data.targetLanguage) patch.target_language = parsed.data.targetLanguage;
      if (parsed.data.stageHint !== undefined) patch.stage_hint = parsed.data.stageHint;
      const row = await updatePromptLabText(req.params.id, patch);
      res.json(rowToPromptLabText(row));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to update text' });
    }
  });

  app.delete('/api/prompt-lab/texts/:id', async (req, res) => {
    try {
      await deletePromptLabText(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to delete text' });
    }
  });

  app.get('/api/prompt-lab/runs', async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const rows = await listPromptLabRuns(limit);
      res.json({ runs: rows.map(rowToPromptLabRun) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to list runs' });
    }
  });

  app.get('/api/prompt-lab/runs/:id', async (req, res) => {
    try {
      const row = await getPromptLabRun(req.params.id);
      if (!row) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      res.json(rowToPromptLabRun(row));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to get run' });
    }
  });

  app.get('/api/prompt-lab/runs/:id/export', async (req, res) => {
    try {
      const row = await getPromptLabRun(req.params.id);
      if (!row) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      const payload = {
        format: 'arcane-prompt-lab-run',
        version: 1,
        exportedAt: new Date().toISOString(),
        run: rowToPromptLabRun(row),
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="prompt-lab-run-${row.id}.json"`);
      res.send(JSON.stringify(payload, null, 2));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
    }
  });

  app.delete('/api/prompt-lab/runs/:id', async (req, res) => {
    try {
      await deletePromptLabRun(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to delete run' });
    }
  });

  app.patch('/api/prompt-lab/runs/:id', async (req, res) => {
    const parsed = promptLabRunPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    try {
      const row = await updatePromptLabRun(req.params.id, {
        display_name: parsed.data.displayName,
      });
      res.json(rowToPromptLabRun(row));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to update run' });
    }
  });

  app.get('/api/prompt-lab/evaluations', async (req, res) => {
    try {
      const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined;
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const rows = await listPromptLabEvaluations({ runId, limit });
      res.json({ evaluations: rows.map(rowToPromptLabEvaluation) });
    } catch (e) {
      res
        .status(500)
        .json({ error: e instanceof Error ? e.message : 'Failed to list evaluations' });
    }
  });

  app.get('/api/prompt-lab/evaluations/:id', async (req, res) => {
    try {
      const row = await getPromptLabEvaluation(req.params.id);
      if (!row) {
        res.status(404).json({ error: 'Evaluation not found' });
        return;
      }
      res.json(rowToPromptLabEvaluation(row));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to get evaluation' });
    }
  });

  app.delete('/api/prompt-lab/evaluations/:id', async (req, res) => {
    try {
      await deletePromptLabEvaluation(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res
        .status(500)
        .json({ error: e instanceof Error ? e.message : 'Failed to delete evaluation' });
    }
  });

  app.post('/api/prompt-lab/evaluate/preview', async (req, res) => {
    const parsed = promptLabEvaluateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    if (parsed.data.leftMode === 'source' || parsed.data.rightMode === 'source') {
      res.status(400).json({ error: 'Both panels must use Output mode for A/B evaluation' });
      return;
    }
    try {
      const leftRun = await getPromptLabRun(parsed.data.leftRunId);
      const rightRun = await getPromptLabRun(parsed.data.rightRunId);
      if (!leftRun || !rightRun) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      const referenceRun = parsed.data.referenceRunId
        ? await getPromptLabRun(parsed.data.referenceRunId)
        : null;

      const prompts = buildEvaluationPrompts({
        leftRun,
        rightRun,
        leftMode: parsed.data.leftMode,
        rightMode: parsed.data.rightMode,
        referenceRun,
        glossarySnapshot: parsed.data.glossarySnapshot,
      });

      res.json({
        systemPrompt: prompts.systemPrompt,
        userPrompt: prompts.userPrompt,
        compareMode: prompts.compareMode,
        stats: prompts.stats,
      });
    } catch (e) {
      if (e instanceof EvaluationModeError) {
        res.status(400).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: e instanceof Error ? e.message : 'Preview failed' });
    }
  });

  app.post('/api/prompt-lab/evaluate', async (req, res) => {
    const parsed = promptLabEvaluateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    if (parsed.data.leftMode === 'source' || parsed.data.rightMode === 'source') {
      res.status(400).json({ error: 'Both panels must use Output mode for A/B evaluation' });
      return;
    }
    try {
      const leftRun = await getPromptLabRun(parsed.data.leftRunId);
      const rightRun = await getPromptLabRun(parsed.data.rightRunId);
      if (!leftRun || !rightRun) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      const referenceRun = parsed.data.referenceRunId
        ? await getPromptLabRun(parsed.data.referenceRunId)
        : null;

      const evalResult = await runPromptLabEvaluation({
        leftRun,
        rightRun,
        leftMode: parsed.data.leftMode,
        rightMode: parsed.data.rightMode,
        referenceRun,
        model: parsed.data.model,
        glossarySnapshot: parsed.data.glossarySnapshot,
      });

      const row = await insertPromptLabEvaluation({
        left_run_id: leftRun.id,
        right_run_id: rightRun.id,
        left_mode: parsed.data.leftMode,
        right_mode: parsed.data.rightMode,
        score: null,
        result: evalResult.result,
        model: evalResult.model,
        tokens_used: evalResult.tokensUsed,
        duration_ms: evalResult.durationMs,
      });

      res.status(201).json(rowToPromptLabEvaluation(row));
    } catch (e) {
      if (e instanceof EvaluationModeError) {
        res.status(400).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: e instanceof Error ? e.message : 'Evaluation failed' });
    }
  });

  app.post('/api/prompt-lab/glossary/import', upload.single('file'), async (req, res) => {
    try {
      let buffer: Buffer;
      let filename: string;
      if (req.file) {
        buffer = req.file.buffer;
        filename = req.file.originalname;
      } else if (req.body?.content && typeof req.body.content === 'string') {
        buffer = Buffer.from(req.body.content, 'utf8');
        filename = req.body.filename ?? 'import.json';
      } else {
        res.status(400).json({ error: 'Provide multipart file or JSON body with content' });
        return;
      }
      const parsed = parseGlossaryImportFile(buffer, filename);
      res.json(parsed);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Import failed' });
    }
  });

  app.post('/api/prompt-lab/run', async (req, res) => {
    const parsed = promptLabRunBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }
    const data = parsed.data;
    try {
      assertSupportedPair(data.sourceLanguage, data.targetLanguage);
      parseProjectLanguage(data.sourceLanguage, 'source');
      parseProjectLanguage(data.targetLanguage, 'target');

      let systemOverride = data.systemPromptOverride;
      let userOverride = data.userPromptOverride;

      if (data.promptId) {
        const saved = await getPromptLabPrompt(data.promptId);
        if (saved) {
          systemOverride = systemOverride ?? saved.system_prompt;
          userOverride = userOverride ?? saved.user_prompt_override ?? undefined;
        }
      }

      const output = await runPromptLabStage({
        ...data,
        systemPromptOverride: systemOverride,
        userPromptOverride: userOverride,
      });

      let runId: string | undefined;
      if (data.saveRun) {
        let promptName: string | null = null;
        if (data.promptId) {
          const savedPrompt = await getPromptLabPrompt(data.promptId);
          promptName = savedPrompt?.name ?? null;
        }
        const params: PromptLabRunParams = {
          model: data.model,
          temperature: data.temperature,
          sourceLanguage: data.sourceLanguage,
          targetLanguage: data.targetLanguage,
          preset: data.preset,
          focus: data.focus,
          customInstructions: data.customInstructions,
          includeGlossary: data.includeGlossary,
          chapterNumber: data.chapterNumber,
          chunkSize: data.chunkSize,
          analysisMaxSectionTokens: data.analysisMaxSectionTokens,
          injectMarkers: data.injectMarkers,
          enableTranslateFewShot: data.enableTranslateFewShot,
          enableTranslateCoT: data.enableTranslateCoT,
          enableTranslateStructuredCoT: data.enableTranslateStructuredCoT,
          translateLeadingContextParagraphs: data.translateLeadingContextParagraphs,
          miniModelTranslationProfile: data.miniModelTranslationProfile,
          runLabel: data.runLabel,
          userPromptOverride: Boolean(data.userPromptOverride),
        };
        const displayName = buildRunDisplayName({
          stage: data.stage,
          model: data.model,
          promptName,
          userLabel: data.runLabel,
        });
        const row = await insertPromptLabRun({
          text_id: data.textId ?? null,
          prompt_id: data.promptId ?? null,
          stage: data.stage,
          display_name: displayName,
          params,
          input_snapshot: buildInputSnapshot(data, output.prompts),
          output,
          tokens_used: output.tokensUsed,
          duration_ms: output.durationMs,
        });
        runId = row.id;
      }

      res.json({ ...output, runId });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Run failed' });
    }
  });
}
