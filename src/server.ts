/**
 * Arcane Reader - Web server for novel translation UI
 *
 * Integrated with:
 * - LowDB for persistent storage
 * - OpenAI for translation
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadConfig, validateConfig, hasAIProvider } from './config.js';
import {
  initDatabase,
  getAllProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  addChapter,
  updateChapter,
  getChapter,
  deleteChapter,
  updateChapterNumber,
  addGlossaryEntry,
  updateGlossaryEntry,
  deleteGlossaryEntry,
  updateParagraph,
  getChapterStats,
  parseTextToParagraphs,
  mergeParagraphsToText,
  updateReaderSettings,
  getReaderSettings,
  resetStuckChapters,
  type Chapter,
  type GlossaryEntry,
  type Project,
  type Paragraph,
} from './storage/database.js';
import {
  translateChapterWithPipeline,
  translateSimple,
  getNameDeclensions,
  clearAgentCache,
} from './services/engine-integration.js';
import { exportProject } from './services/export/index.js';

// Load configuration
const config = loadConfig();
const configValidation = validateConfig(config);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.port;

// Storage for uploaded chapter files
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'));
    }
  },
});

// Storage for glossary images
const imagesDir = path.join(__dirname, '../data/images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Storage for exported files
const exportsDir = path.join(__dirname, '../data/exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, imagesDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `glossary-${uniqueSuffix}${ext}`);
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files - prefer dist/client if exists (production), fallback to public (legacy)
const distClientPath = path.join(__dirname, '../dist/client');
const publicPath = path.join(__dirname, '../public');
const clientPath = fs.existsSync(distClientPath) ? distClientPath : publicPath;

app.use(express.static(clientPath));
app.use('/images', express.static(imagesDir)); // Serve uploaded images
app.use('/exports', express.static(exportsDir)); // Serve exported files

// ============ API Routes ============

// System status
app.get('/api/status', (_req, res) => {
  res.json({
    version: '0.1.0',
    ready: Boolean(config.openai.apiKey),
    ai: {
      provider: config.openai.apiKey ? 'OpenAI' : null,
      model: config.openai.model,
      configured: hasAIProvider(config),
    },
    config: {
      valid: configValidation.valid,
      errors: configValidation.errors,
    },
    storage: 'lowdb',
  });
});

// ============ Projects ============

// Get all projects
app.get('/api/projects', async (_req, res) => {
  try {
    // Reset stuck chapters across all projects on startup/refresh
    const resetCount = await resetStuckChapters();
    if (resetCount > 0) {
      console.log(`🔄 Сброшено застрявших глав: ${resetCount}`);
    }

    const projects = await getAllProjects();
    const projectList = projects.map((p) => ({
      id: p.id,
      name: p.name,
      chapterCount: p.chapters.length,
      translatedCount: p.chapters.filter((c) => c.status === 'completed').length,
      glossaryCount: p.glossary.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    res.json(projectList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// Create new project
app.post('/api/projects', async (req, res) => {
  try {
    const { name, sourceLanguage, targetLanguage } = req.body;
    const project = await createProject({ name, sourceLanguage, targetLanguage });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get project by ID
app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Reset stuck chapters is called inside getProject
    // This ensures chapters are checked every time project is loaded

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const success = await deleteProject(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Update project settings
app.put('/api/projects/:id/settings', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const {
      model, // Legacy: single model
      stageModels, // New: per-stage models
      temperature,
      enableAnalysis,
      enableEditing,
    } = req.body;

    // Preserve existing reader settings
    const existingReader = project.settings.reader;

    // Update settings, preserving existing stageModels if not provided
    const updatedSettings: typeof project.settings = {
      ...project.settings,
      temperature: temperature ?? project.settings.temperature,
      enableAnalysis: enableAnalysis ?? project.settings.enableAnalysis ?? true,
      enableTranslation: true, // Always required
      enableEditing: enableEditing ?? project.settings.enableEditing ?? true,
      reader: existingReader,
    };

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

    await updateProject(req.params.id, { settings: updatedSettings });

    const stagesStatus = [
      project.settings.enableAnalysis ? '✅ Анализ' : '⏭️ Анализ',
      '✅ Перевод',
      project.settings.enableEditing ? '✅ Редактура' : '⏭️ Редактура',
    ].join(' → ');

    console.log(`⚙️  Настройки проекта "${project.name}" обновлены:`);
    console.log(`   Модель: ${project.settings.model} | Стадии: ${stagesStatus}`);

    res.json(project.settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get reader settings
app.get('/api/projects/:id/settings/reader', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const reader = getReaderSettings(project);
    res.json(reader);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get reader settings' });
  }
});

// Update reader settings
app.put('/api/projects/:id/settings/reader', async (req, res) => {
  try {
    const reader = await updateReaderSettings(req.params.id, req.body);
    if (!reader) {
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log(
      `📖 Reader настройки обновлены: шрифт=${reader.fontFamily}, размер=${reader.fontSize}px, тема=${reader.colorScheme}`
    );

    res.json(reader);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reader settings' });
  }
});

// ============ Chapters ============

// Upload chapter to project
app.post('/api/projects/:id/chapters', upload.single('file'), async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const text = req.file.buffer.toString('utf-8');
    const title = req.body.title || `Глава ${project.chapters.length + 1}`;

    const chapter = await addChapter(req.params.id, { title, originalText: text });
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add chapter' });
  }
});

// Get chapter
app.get('/api/projects/:projectId/chapters/:chapterId', async (req, res) => {
  try {
    const chapter = await getChapter(req.params.projectId, req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chapter' });
  }
});

// Delete chapter
app.delete('/api/projects/:projectId/chapters/:chapterId', async (req, res) => {
  try {
    const success = await deleteChapter(req.params.projectId, req.params.chapterId);
    if (!success) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

// ============ Translation ============

// Cancel translation (reset stuck status)
app.post('/api/projects/:projectId/chapters/:chapterId/translate/cancel', async (req, res) => {
  try {
    const chapter = await getChapter(req.params.projectId, req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Only reset if status is translating
    if (chapter.status === 'translating') {
      await updateChapter(req.params.projectId, req.params.chapterId, {
        status: 'pending',
      });
      console.log(`⏹️  Перевод отменён: ${chapter.title}`);
      res.json({ success: true, message: 'Translation cancelled' });
    } else {
      res.json({ success: false, message: 'Chapter is not being translated' });
    }
  } catch (error) {
    console.error('Failed to cancel translation:', error);
    res.status(500).json({ error: 'Failed to cancel translation' });
  }
});

// Manual sync translated chunks to paragraphs (recovery endpoint)
// NOTE: Sync is now automatic after translation. This endpoint is for recovery only.
app.post('/api/projects/:projectId/chapters/:chapterId/translate/sync', async (req, res) => {
  try {
    const chapter = await getChapter(req.params.projectId, req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Check if translatedChunks exist
    if (!chapter.translatedChunks || chapter.translatedChunks.length === 0) {
      return res
        .status(400)
        .json({ error: 'No translated chunks found. Please translate the chapter first.' });
    }

    // Check if paragraphs exist
    if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
      return res.status(400).json({ error: 'No paragraphs found in chapter' });
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔄 РУЧНАЯ СИНХРОНИЗАЦИЯ ПЕРЕВОДА С ПАРАГРАФАМИ (восстановление)`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`📖 Глава: ${chapter.title}`);
    console.log(`📦 Чанков для синхронизации: ${chapter.translatedChunks.length}`);
    console.log(`📄 Параграфов: ${chapter.paragraphs.length}`);
    console.log(`${'─'.repeat(60)}`);

    // Determine if this is a partial translation (some paragraphs already have translations)
    const hasExistingTranslations = chapter.paragraphs.some(
      (p) => p.translatedText && p.translatedText.trim().length > 0
    );
    const partialTranslation = hasExistingTranslations;

    // Perform synchronization
    const syncedParagraphs = syncTranslationChunksToParagraphs(
      chapter.paragraphs,
      chapter.translatedChunks,
      partialTranslation
    );

    // Update chapter with synced paragraphs
    await updateChapter(req.params.projectId, req.params.chapterId, {
      paragraphs: syncedParagraphs,
    });

    console.log(`${'═'.repeat(60)}\n`);

    res.json({
      success: true,
      message: 'Translation synchronized',
      syncedParagraphs: syncedParagraphs.filter(
        (p) => p.translatedText && p.translatedText.trim().length > 0
      ).length,
      totalParagraphs: chapter.paragraphs.length,
      recovered: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to sync translation:', error);
    res.status(500).json({ error: `Failed to sync translation: ${errorMessage}` });
  }
});

// Translation endpoint with logging
app.post('/api/projects/:projectId/chapters/:chapterId/translate', async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const chapter = project.chapters.find((c) => c.id === req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Parse request body for translateOnlyEmpty flag
    const body = req.body || {};
    const translateOnlyEmpty = body.translateOnlyEmpty === true;

    // Log chapter state before translation
    const hasTranslatedText = !!chapter.translatedText && chapter.translatedText.trim().length > 0;
    const hasTranslatedParagraphs = chapter.paragraphs?.some(
      (p) => p.translatedText && p.translatedText.trim().length > 0
    );
    console.log(`📋 Состояние главы перед переводом: ${chapter.title}`);
    console.log(`   ID: ${chapter.id}, Статус: ${chapter.status}`);
    console.log(`   Есть переведенный текст: ${hasTranslatedText}`);
    console.log(`   Есть переведенные параграфы: ${hasTranslatedParagraphs}`);
    console.log(`   Количество параграфов: ${chapter.paragraphs?.length || 0}`);
    console.log(
      `   Режим перевода: ${translateOnlyEmpty ? 'Только пустые параграфы' : 'Вся глава'}`
    );

    // Update status
    await updateChapter(req.params.projectId, req.params.chapterId, { status: 'translating' });

    const startTime = Date.now();
    const textLength = chapter.originalText.length;
    const wordCount = chapter.originalText.split(/\s+/).length;

    // Get models for each stage
    const getStageModel = (stage: 'analysis' | 'translation' | 'editing'): string => {
      if (project.settings?.stageModels) {
        return project.settings.stageModels[stage];
      }
      return project.settings?.model || config.openai.model;
    };

    const analysisModel = getStageModel('analysis');
    const translationModel = getStageModel('translation');
    const editingModel = getStageModel('editing');

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔮 ЗАПРОС НА ПЕРЕВОД`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`📖 Глава: ${chapter.title}`);
    console.log(`📊 Размер: ${textLength} символов, ~${wordCount} слов`);
    console.log(`🔑 API ключ: ${config.openai.apiKey ? '✅ Настроен' : '❌ Не настроен'}`);
    console.log(
      `🤖 Модели: Анализ=${analysisModel} | Перевод=${translationModel} | Редактура=${editingModel}`
    );
    console.log(
      `🎨 Креативность: ${project.settings?.temperature ?? config.translation.temperature}`
    );
    console.log(`💾 Хранилище: LowDB (persistent)`);
    console.log(`${'─'.repeat(60)}`);

    // Perform translation using arcane-engine
    performTranslation(
      req.params.projectId,
      req.params.chapterId,
      chapter,
      project,
      startTime,
      translateOnlyEmpty
    );

    res.json({ status: 'started', chapterId: chapter.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start translation' });
  }
});

// Translation logic - uses arcane-engine
async function performTranslation(
  projectId: string,
  chapterId: string,
  chapter: Chapter,
  project: Project,
  startTime: number,
  translateOnlyEmpty: boolean = false
): Promise<void> {
  try {
    // Validate input data
    if (!chapter || !chapter.originalText) {
      throw new Error('Глава не содержит исходного текста');
    }

    const paragraphs = chapter.paragraphs || [];
    if (paragraphs.length === 0) {
      throw new Error('Глава не содержит параграфов');
    }

    if (!config.openai.apiKey) {
      console.log(`⚠️  ДЕМО РЕЖИМ - API ключ не настроен`);
      console.log(`${'═'.repeat(60)}\n`);

      // Demo mode - translate paragraphs individually
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Update paragraphs with demo translations
      const paragraphs = chapter.paragraphs || [];
      const updatedParagraphs = paragraphs.map((p, idx) => ({
        ...p,
        translatedText: `[ДЕМО ${idx + 1}] ${p.originalText.substring(0, 50)}...`,
        status: 'translated' as const,
        editedAt: new Date().toISOString(),
        editedBy: 'ai' as const,
      }));

      const demoText = updatedParagraphs.map((p) => p.translatedText).join('\n\n');

      await updateChapter(projectId, chapterId, {
        paragraphs: updatedParagraphs,
        translatedText: demoText,
        status: 'completed',
        translationMeta: {
          tokensUsed: 0,
          duration: Date.now() - startTime,
          model: 'demo',
          translatedAt: new Date().toISOString(),
        },
      });

      console.log(
        `✅ Демо-перевод завершён за ${Date.now() - startTime}ms (${paragraphs.length} абзацев)`
      );
      return;
    }

    // Get models for each stage
    const getStageModel = (stage: 'analysis' | 'translation' | 'editing'): string => {
      if (project.settings?.stageModels) {
        return project.settings.stageModels[stage];
      }
      return project.settings?.model || config.openai.model;
    };

    const analysisModel = getStageModel('analysis');
    const translationModel = getStageModel('translation');
    const editingModel = getStageModel('editing');

    const projectTemperature = project.settings?.temperature ?? config.translation.temperature;
    const enableAnalysis = project.settings?.enableAnalysis ?? true;
    const enableEditing = project.settings?.enableEditing ?? true;

    const stagesInfo = [
      enableAnalysis ? '✅ Анализ' : '⏭️ Анализ',
      '✅ Перевод',
      enableEditing ? '✅ Редактура' : '⏭️ Редактура',
    ].join(' → ');

    console.log(`🚀 Запуск arcane-engine TranslationPipeline...`);
    console.log(
      `   Модели: Анализ=${analysisModel} | Перевод=${translationModel} | Редактура=${editingModel}`
    );
    console.log(`   Креативность: ${projectTemperature}`);
    console.log(`   Стадии: ${stagesInfo}`);

    // Helper function to check if paragraph has valid translation
    const hasValidTranslation = (p: Paragraph): boolean => {
      const text = p.translatedText?.trim() || '';
      if (text.length === 0) return false;
      // Ignore error messages
      if (text.startsWith('❌') || text.startsWith('[ERROR')) return false;
      return true;
    };

    // Add paragraph markers to text before translation
    // Format: --para:{paragraphId}--{text}
    const addParagraphMarkers = (text: string, paragraphs: Paragraph[]): string => {
      const textParagraphs = text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      // Match text paragraphs with database paragraphs
      let paraIndex = 0;
      const markedParagraphs: string[] = [];

      for (const textPara of textParagraphs) {
        // Try to find matching paragraph by comparing original text
        let matchedPara: Paragraph | undefined;

        if (paraIndex < paragraphs.length) {
          // Try exact match first
          if (paragraphs[paraIndex].originalText.trim() === textPara) {
            matchedPara = paragraphs[paraIndex];
            paraIndex++;
          } else {
            // Try to find by similarity
            for (let i = 0; i < paragraphs.length; i++) {
              if (paragraphs[i].originalText.trim() === textPara) {
                matchedPara = paragraphs[i];
                paraIndex = i + 1;
                break;
              }
            }
          }
        }

        if (matchedPara) {
          markedParagraphs.push(`--para:${matchedPara.id}--${textPara}`);
        } else {
          // If no match found, use auto-generated marker
          markedParagraphs.push(`--para:auto_${markedParagraphs.length}--${textPara}`);
        }
      }

      return markedParagraphs.join('\n\n');
    };

    // If translateOnlyEmpty is true, filter empty paragraphs and create modified chapter
    let chapterToTranslate = chapter;
    let paragraphsToTranslate = chapter.paragraphs || [];

    if (translateOnlyEmpty) {
      const paragraphs = chapter.paragraphs || [];
      const emptyParagraphs = paragraphs.filter((p) => !hasValidTranslation(p));

      if (emptyParagraphs.length === 0) {
        console.log(`ℹ️  Нет пустых параграфов для перевода. Перевод пропущен.`);
        await updateChapter(projectId, chapterId, { status: 'completed' });
        return;
      }

      const textToTranslate = mergeParagraphsToText(emptyParagraphs, 'originalText');
      const textLength = textToTranslate.length;
      const wordCount = textToTranslate.split(/\s+/).length;

      console.log(`📝 Режим частичного перевода:`);
      console.log(`   Переводим: ${emptyParagraphs.length} из ${paragraphs.length} параграфов`);
      console.log(`   Размер текста: ${textLength} символов, ~${wordCount} слов`);
      console.log(
        `   Пропускаем: ${paragraphs.length - emptyParagraphs.length} уже переведенных параграфов`
      );

      // Add markers to text before translation
      const markedText = addParagraphMarkers(textToTranslate, emptyParagraphs);
      paragraphsToTranslate = emptyParagraphs;

      // Create temporary chapter object with marked text
      chapterToTranslate = {
        ...chapter,
        originalText: markedText,
      };
    } else {
      // Add markers for full translation
      const markedText = addParagraphMarkers(chapter.originalText, chapter.paragraphs || []);
      chapterToTranslate = {
        ...chapter,
        originalText: markedText,
      };
    }

    // Create project-specific config
    // Note: Models are now passed per-stage via providers in createPipeline
    // This config is used for other settings like temperature
    const projectConfig = {
      ...config,
      openai: {
        ...config.openai,
        // Keep default model for compatibility, but actual models come from stageModels
        model: translationModel, // Use translation model as default
      },
      translation: {
        ...config.translation,
        temperature: projectTemperature,
        skipEditing: !enableEditing,
      },
    };

    // Use arcane-engine for translation
    let result;
    try {
      result = await translateChapterWithPipeline(projectConfig, project, chapterToTranslate, {
        skipAnalysis: !enableAnalysis,
        skipEditing: !enableEditing,
      });
    } catch (pipelineError) {
      // Pipeline error - rethrow to outer catch block
      const errorMessage =
        pipelineError instanceof Error ? pipelineError.message : 'Unknown pipeline error';
      console.error(`❌ [Pipeline] Ошибка в translateChapterWithPipeline: ${errorMessage}`);
      throw pipelineError; // Re-throw to be caught by outer catch
    }

    console.log(`${'─'.repeat(60)}`);
    console.log(`✅ ПЕРЕВОД ЗАВЕРШЁН (arcane-engine)`);
    console.log(`⏱️  Время: ${(result.duration / 1000).toFixed(1)}s`);

    // Show tokens by stage
    if (result.tokensByStage) {
      const stageTokens: string[] = [];
      if (result.tokensByStage.analysis) {
        stageTokens.push(`🔍 Анализ: ${result.tokensByStage.analysis.toLocaleString()}`);
      }
      stageTokens.push(`🔮 Перевод: ${result.tokensByStage.translation.toLocaleString()}`);
      if (result.tokensByStage.editing) {
        stageTokens.push(`✨ Редактура: ${result.tokensByStage.editing.toLocaleString()}`);
      }
      console.log(`📝 Токенов по стейджам: ${stageTokens.join(' | ')}`);
      console.log(`📊 Всего токенов: ${result.tokensUsed.toLocaleString()}`);
    } else {
      console.log(`📝 Токенов: ${result.tokensUsed.toLocaleString()}`);
    }

    if (result.glossaryUpdates?.length) {
      console.log(`📚 Новые записи в глоссарии: ${result.glossaryUpdates.length}`);
    }
    console.log(`${'═'.repeat(60)}\n`);

    // Validate translation result
    const isValidTranslationResult =
      result.translatedText &&
      result.translatedText.trim().length > 0 &&
      !result.translatedText.startsWith('[ERROR]');

    const hasValidTokens = result.tokensUsed > 0 || result.duration > 0;

    if (!isValidTranslationResult || (!hasValidTokens && result.duration === 0)) {
      // Translation failed or returned empty/invalid result
      const errorMessage = !isValidTranslationResult
        ? 'Перевод пустой или содержит ошибку'
        : 'Перевод завершился без использования токенов (возможна ошибка)';

      console.log(`⚠️  ВАЛИДАЦИЯ НЕ ПРОЙДЕНА: ${errorMessage}`);
      console.log(
        `   Текст перевода: ${
          result.translatedText ? `"${result.translatedText.substring(0, 100)}..."` : 'отсутствует'
        }`
      );
      console.log(`   Токены: ${result.tokensUsed}, Время: ${result.duration}ms`);

      await updateChapter(projectId, chapterId, {
        status: 'error',
        translatedText: result.translatedText || `❌ Ошибка перевода: ${errorMessage}`,
      });

      return;
    }

    // Try to parse JSON structure from translation
    // The model should return JSON with paragraph markers
    let parsedJSON: { paragraphs: Array<{ id: string; translated: string }> } | null = null;
    let translatedChunks: string[] = [];

    try {
      // Try to parse as JSON first
      const jsonMatch = result.translatedText.match(/\{[\s\S]*"paragraphs"[\s\S]*\}/);
      if (jsonMatch) {
        const jsonText = jsonMatch[0];
        const parsed = JSON.parse(jsonText);
        if (parsed && parsed.paragraphs && Array.isArray(parsed.paragraphs)) {
          parsedJSON = parsed;
          if (parsedJSON) {
            console.log(
              `✅ Обнаружен JSON-формат перевода с ${parsedJSON.paragraphs.length} параграфами`
            );
          }
        }
      }
    } catch (jsonError) {
      console.log(
        `ℹ️  JSON-парсинг не удался, используем текстовый формат: ${
          jsonError instanceof Error ? jsonError.message : 'Unknown error'
        }`
      );
    }

    // Prepare text-based chunks as fallback
    if (!parsedJSON) {
      // Helper function to check if a chunk is a separator
      const isSeparatorChunk = (text: string): boolean => {
        const trimmed = text.trim();
        if (trimmed.length === 0) return false;
        // Check if chunk contains only separator characters (repeated)
        const separatorPattern = /^[\s*\-_=~#]+$/;
        return separatorPattern.test(trimmed);
      };

      translatedChunks = result.translatedText
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0)
        // Filter out separator chunks (e.g., ***, ---, etc.)
        .filter((chunk) => !isSeparatorChunk(chunk));

      console.log(
        `📦 Перевод разбит на ${translatedChunks.length} чанков для автоматической синхронизации (текстовый формат)`
      );
    }

    // Get current chapter state for synchronization
    const currentChapter = await getChapter(projectId, chapterId);
    if (!currentChapter) {
      throw new Error('Не удалось получить главу для синхронизации');
    }

    let syncedParagraphs: Paragraph[];

    if (parsedJSON && parsedJSON.paragraphs && Array.isArray(parsedJSON.paragraphs)) {
      // Use JSON-based synchronization
      console.log(`🔄 Автоматическая синхронизация перевода с параграфами (JSON-формат)...`);
      syncedParagraphs = syncTranslationJSONToParagraphs(
        currentChapter.paragraphs,
        parsedJSON,
        translateOnlyEmpty
      );
    } else {
      // Fallback to text-based synchronization
      console.log(`🔄 Автоматическая синхронизация перевода с параграфами (текстовый формат)...`);
      syncedParagraphs = syncTranslationChunksToParagraphs(
        currentChapter.paragraphs,
        translatedChunks,
        translateOnlyEmpty
      );
    }

    // Create model info string showing all models used
    const modelInfo =
      enableAnalysis && enableEditing
        ? `${analysisModel}/${translationModel}/${editingModel}`
        : enableAnalysis
        ? `${analysisModel}/${translationModel}`
        : enableEditing
        ? `${translationModel}/${editingModel}`
        : translationModel;

    // Prepare translatedChunks for saving (use from parsedJSON or text-based chunks)
    const chunksToSave =
      parsedJSON && parsedJSON.paragraphs
        ? parsedJSON.paragraphs.map((p) => p.translated)
        : translatedChunks;

    // Save translation with synced paragraphs
    await updateChapter(projectId, chapterId, {
      translatedText: result.translatedText,
      translatedChunks: chunksToSave,
      paragraphs: syncedParagraphs, // Auto-synced paragraphs
      status: 'completed',
      translationMeta: {
        tokensUsed: result.tokensUsed,
        tokensByStage: result.tokensByStage,
        duration: result.duration,
        model: modelInfo, // Store all models used (or single model if stages skipped)
        translatedAt: new Date().toISOString(),
      },
    });

    console.log(`📦 Сохранено ${chunksToSave.length} чанков перевода`);
    console.log(`✅ Глава успешно переведена и синхронизирована: ${chapter.title}`);

    // Verify the chapter was saved correctly
    const savedChapter = await getChapter(projectId, chapterId);
    if (savedChapter) {
      const savedHasText =
        !!savedChapter.translatedText && savedChapter.translatedText.trim().length > 0;
      const savedHasChunks =
        !!savedChapter.translatedChunks && savedChapter.translatedChunks.length > 0;
      const savedHasParagraphs = savedChapter.paragraphs?.some(
        (p) => p.translatedText && p.translatedText.trim().length > 0
      );
      const syncedCount =
        savedChapter.paragraphs?.filter(
          (p) => p.translatedText && p.translatedText.trim().length > 0
        ).length || 0;

      // Prepare chunks info for logging
      const chunksInfo =
        parsedJSON && parsedJSON.paragraphs
          ? `JSON-параграфов=${parsedJSON.paragraphs.length}`
          : `чанков=${translatedChunks.length}`;

      console.log(
        `🔍 Проверка сохранения: текст=${savedHasText}, ${chunksInfo}, параграфы=${savedHasParagraphs} (${syncedCount} синхронизировано), статус=${savedChapter.status}`
      );

      if (!savedHasText && !savedHasChunks) {
        console.error(`⚠️ ПРЕДУПРЕЖДЕНИЕ: Глава сохранена, но перевод и чанки отсутствуют!`);
      }

      if (savedHasChunks && !savedHasParagraphs) {
        console.error(
          `⚠️ ПРЕДУПРЕЖДЕНИЕ: Перевод сохранен в чанках, но не синхронизирован с параграфами!`
        );
      }
    } else {
      console.error(`❌ ОШИБКА: Не удалось получить сохраненную главу для проверки!`);
    }

    // Auto-add detected glossary entries
    if (result.glossaryUpdates?.length) {
      for (const entry of result.glossaryUpdates) {
        await addGlossaryEntry(projectId, entry);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.log(`❌ ОШИБКА: ${errorMessage}`);
    if (errorStack) {
      console.log(`   Stack trace: ${errorStack.substring(0, 500)}...`);
    }
    console.log(`${'═'.repeat(60)}\n`);

    // Try to preserve existing translation if any
    const currentChapter = await getChapter(projectId, chapterId);
    const existingTranslation = currentChapter?.translatedText;

    await updateChapter(projectId, chapterId, {
      translatedText: existingTranslation || `❌ Ошибка перевода: ${errorMessage}`,
      status: 'error',
    });

    console.log(`⚠️ Глава помечена как ошибка: ${chapter.title}`);
    console.log(`   Сохранен существующий перевод: ${!!existingTranslation}`);
  }
}

/**
 * Sync translated text to paragraph structure
 * Tries to match translated paragraphs to original ones
 * Improved to handle cases where paragraph count doesn't match
 * Preserves existing translations for paragraphs that already have valid translations
 */
function syncTranslationToParagraphs(
  originalParagraphs: Paragraph[],
  translatedText: string
): Paragraph[] {
  if (!originalParagraphs || originalParagraphs.length === 0) {
    console.warn('⚠️ syncTranslationToParagraphs: Нет оригинальных параграфов');
    return [];
  }

  if (!translatedText || translatedText.trim().length === 0) {
    console.warn('⚠️ syncTranslationToParagraphs: Переведенный текст пуст');
    return originalParagraphs; // Return original paragraphs unchanged
  }

  // Split translated text into paragraphs
  const translatedParts = translatedText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const now = new Date().toISOString();

  // Helper function to check if paragraph is a separator
  const isSeparatorParagraph = (p: Paragraph): boolean => {
    const text = p.originalText.trim();
    if (text.length === 0) return false;
    // Check if paragraph contains only separator characters (repeated)
    const separatorPattern = /^[\s*\-_=~#]+$/;
    return separatorPattern.test(text);
  };

  // Helper function to check if paragraph has valid translation
  const hasValidTranslation = (p: Paragraph): boolean => {
    const text = p.translatedText?.trim() || '';
    if (text.length === 0) return false;
    // Ignore error messages
    if (text.startsWith('❌') || text.startsWith('[ERROR')) return false;
    return true;
  };

  console.log(
    `📊 Синхронизация: ${originalParagraphs.length} оригинальных параграфов, ${translatedParts.length} переведенных частей`
  );

  // Count empty paragraphs that need translation (excluding separators)
  const emptyParagraphsCount = originalParagraphs.filter(
    (p) => !isSeparatorParagraph(p) && !hasValidTranslation(p)
  ).length;

  // If counts don't match, log info (this is normal when some paragraphs already have translations)
  if (translatedParts.length !== originalParagraphs.length) {
    console.log(
      `ℹ️  Несоответствие количества: оригинал=${originalParagraphs.length}, перевод=${translatedParts.length}, пустых=${emptyParagraphsCount}`
    );
    if (translatedParts.length !== emptyParagraphsCount) {
      console.warn(
        `⚠️ Количество переведенных частей (${translatedParts.length}) не совпадает с количеством пустых параграфов (${emptyParagraphsCount})`
      );
    }
  }

  // Map translations to original paragraphs
  // Preserve existing valid translations, only update empty or error paragraphs
  // Use relative index for empty paragraphs instead of direct mapping
  let translationIndex = 0; // Relative index in translatedParts array

  const result = originalParagraphs.map((original, originalIndex) => {
    // Skip separator paragraphs - they don't need translation
    if (isSeparatorParagraph(original)) {
      return original; // Keep separator paragraph as-is, don't try to translate it
    }

    // If paragraph already has valid translation, preserve it
    if (hasValidTranslation(original)) {
      return original; // Keep existing translation, skip it in translation mapping
    }

    // Otherwise, get next available translation using relative index
    if (translationIndex < translatedParts.length) {
      const translatedPart = translatedParts[translationIndex];
      translationIndex++; // Move to next translation

      // Update paragraph with new translation
      if (translatedPart && translatedPart.trim().length > 0) {
        return {
          ...original,
          translatedText: translatedPart,
          status: 'translated' as const,
          editedAt: now,
          editedBy: 'ai' as const,
        };
      }
    }

    // Keep original if no new translation available
    return original;
  });

  // Handle edge cases
  const translatedCount = result.filter((p) => hasValidTranslation(p)).length;
  const preservedCount = originalParagraphs.filter((p) => hasValidTranslation(p)).length;
  const newTranslations = translatedCount - preservedCount;
  const emptyCount = originalParagraphs.length - preservedCount;

  // Check if not all translations were used
  if (translationIndex < translatedParts.length) {
    const unusedCount = translatedParts.length - translationIndex;
    console.warn(
      `⚠️ Не все переводы использованы: осталось ${unusedCount} неиспользованных частей из ${translatedParts.length}`
    );
    console.warn(`   Это может указывать на несоответствие формата перевода`);
  }

  // Check if translation didn't fill all empty paragraphs
  if (newTranslations < emptyCount && translationIndex >= translatedParts.length) {
    const missingCount = emptyCount - newTranslations;
    console.warn(
      `⚠️ Не все пустые параграфы получили перевод: ${newTranslations} из ${emptyCount} пустых параграфов заполнено`
    );
    console.warn(`   Отсутствует перевод для ${missingCount} параграфов`);
  }

  // Log summary
  console.log(
    `✅ Синхронизировано: ${translatedCount}/${originalParagraphs.length} параграфов имеют перевод (сохранено: ${preservedCount}, новых: ${newTranslations})`
  );

  // Critical error check
  if (translatedCount === 0 && translatedText.trim().length > 0) {
    console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: Весь перевод потерян при синхронизации!`);
    console.error(`   Длина переведенного текста: ${translatedText.length} символов`);
    console.error(`   Количество частей после разбиения: ${translatedParts.length}`);
    console.error(`   Пустых параграфов было: ${emptyCount}`);
  }

  // Validation: check if all expected translations were applied (if we translated everything)
  if (emptyCount > 0 && newTranslations === 0 && translatedText.trim().length > 0) {
    console.error(`❌ ОШИБКА: Перевод получен, но не применен ни к одному параграфу!`);
    console.error(
      `   Пустых параграфов: ${emptyCount}, Переведенных частей: ${translatedParts.length}`
    );
  }

  return result;
}

/**
 * Sync translated chunks to paragraph structure (mechanical sync stage)
 * Uses saved translatedChunks instead of splitting text
 * Follows the same logic as syncTranslationToParagraphs but works with pre-parsed chunks
 *
 * @param originalParagraphs - Original paragraphs to sync with
 * @param translatedChunks - Translated chunks to map to paragraphs
 * @param partialTranslation - If true, only empty paragraphs will be updated (for translateOnlyEmpty mode)
 */
function syncTranslationChunksToParagraphs(
  originalParagraphs: Paragraph[],
  translatedChunks: string[],
  partialTranslation: boolean = false
): Paragraph[] {
  if (!originalParagraphs || originalParagraphs.length === 0) {
    console.warn('⚠️ syncTranslationChunksToParagraphs: Нет оригинальных параграфов');
    return [];
  }

  if (!translatedChunks || translatedChunks.length === 0) {
    console.warn('⚠️ syncTranslationChunksToParagraphs: Нет переведенных чанков');
    return originalParagraphs; // Return original paragraphs unchanged
  }

  const now = new Date().toISOString();

  // Helper function to check if paragraph is a separator
  const isSeparatorParagraph = (p: Paragraph): boolean => {
    const text = p.originalText.trim();
    if (text.length === 0) return false;
    // Check if paragraph contains only separator characters (repeated)
    const separatorPattern = /^[\s*\-_=~#]+$/;
    return separatorPattern.test(text);
  };

  // Helper function to check if paragraph has valid translation
  const hasValidTranslation = (p: Paragraph): boolean => {
    const text = p.translatedText?.trim() || '';
    if (text.length === 0) return false;
    // Ignore error messages
    if (text.startsWith('❌') || text.startsWith('[ERROR')) return false;
    return true;
  };

  console.log(
    `📊 Синхронизация чанков: ${originalParagraphs.length} оригинальных параграфов, ${translatedChunks.length} переведенных чанков`
  );

  // Count empty paragraphs that need translation (excluding separators)
  const emptyParagraphsCount = originalParagraphs.filter(
    (p) => !isSeparatorParagraph(p) && !hasValidTranslation(p)
  ).length;

  // If counts don't match, log info (this is normal when some paragraphs already have translations)
  if (translatedChunks.length !== originalParagraphs.length) {
    console.log(
      `ℹ️  Несоответствие количества: оригинал=${originalParagraphs.length}, чанков=${translatedChunks.length}, пустых=${emptyParagraphsCount}`
    );
    if (translatedChunks.length !== emptyParagraphsCount) {
      console.warn(
        `⚠️ Количество переведенных чанков (${translatedChunks.length}) не совпадает с количеством пустых параграфов (${emptyParagraphsCount})`
      );
    }
  }

  // Map translations to original paragraphs
  // For partial translation: preserve existing valid translations, only update empty or error paragraphs
  // For full translation: update all paragraphs regardless of existing translations
  let translationIndex = 0; // Relative index in translatedChunks array

  const result = originalParagraphs.map((original, originalIndex) => {
    // Skip separator paragraphs - they don't need translation
    // This handles cases where old chapters have separator paragraphs that weren't filtered
    if (isSeparatorParagraph(original)) {
      return original; // Keep separator paragraph as-is, don't try to translate it
    }

    // If partial translation mode, preserve existing valid translations
    if (partialTranslation && hasValidTranslation(original)) {
      return original; // Keep existing translation, skip it in translation mapping
    }

    // Otherwise, get next available translation using relative index
    if (translationIndex < translatedChunks.length) {
      const translatedChunk = translatedChunks[translationIndex];
      translationIndex++; // Move to next translation

      // Update paragraph with new translation
      if (translatedChunk && translatedChunk.trim().length > 0) {
        return {
          ...original,
          translatedText: translatedChunk,
          status: 'translated' as const,
          editedAt: now,
          editedBy: 'ai' as const,
        };
      }
    }

    // Keep original if no new translation available
    // For full translation, if we run out of chunks but there are more paragraphs,
    // this indicates a problem (shouldn't happen in normal operation)
    return original;
  });

  // Handle edge cases
  const translatedCount = result.filter((p) => hasValidTranslation(p)).length;
  const preservedCount = originalParagraphs.filter((p) => hasValidTranslation(p)).length;
  const newTranslations = translatedCount - preservedCount;
  const emptyCount = originalParagraphs.length - preservedCount;

  // Check if not all translations were used
  if (translationIndex < translatedChunks.length) {
    const unusedCount = translatedChunks.length - translationIndex;
    console.warn(
      `⚠️ Не все чанки использованы: осталось ${unusedCount} неиспользованных чанков из ${translatedChunks.length}`
    );
    console.warn(`   Это может указывать на несоответствие формата перевода`);
  }

  // Check if translation didn't fill all empty paragraphs
  // This is expected for partial translation, but should not happen for full translation
  if (
    !partialTranslation &&
    newTranslations < emptyCount &&
    translationIndex >= translatedChunks.length
  ) {
    const missingCount = emptyCount - newTranslations;
    console.warn(
      `⚠️ Не все пустые параграфы получили перевод: ${newTranslations} из ${emptyCount} пустых параграфов заполнено`
    );
    console.warn(`   Отсутствует перевод для ${missingCount} параграфов`);
  } else if (partialTranslation && newTranslations < emptyCount) {
    // For partial translation, this is expected - we only translate empty paragraphs
    console.log(
      `ℹ️  Частичный перевод: заполнено ${newTranslations} из ${emptyCount} пустых параграфов (${preservedCount} уже переведенных сохранено)`
    );
  }

  // Log summary
  console.log(
    `✅ Синхронизировано: ${translatedCount}/${originalParagraphs.length} параграфов имеют перевод (сохранено: ${preservedCount}, новых: ${newTranslations})`
  );

  // Critical error check - should never happen after auto-sync
  if (translatedCount === 0 && translatedChunks.length > 0 && !partialTranslation) {
    console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: Весь перевод потерян при синхронизации!`);
    console.error(`   Количество чанков: ${translatedChunks.length}`);
    console.error(`   Пустых параграфов было: ${emptyCount}`);
    console.error(`   Это указывает на серьезную проблему в логике синхронизации!`);
  }

  // Validation: check if all expected translations were applied (only for full translation)
  if (
    !partialTranslation &&
    emptyCount > 0 &&
    newTranslations === 0 &&
    translatedChunks.length > 0
  ) {
    console.error(`❌ ОШИБКА: Перевод получен, но не применен ни к одному параграфу!`);
    console.error(
      `   Пустых параграфов: ${emptyCount}, Переведенных чанков: ${translatedChunks.length}`
    );
    console.error(
      `   Возможно, все параграфы уже имели переводы (не должно происходить при полном переводе)`
    );
  }

  return result;
}

/**
 * Sync translated JSON structure to paragraph structure
 * Uses paragraph markers (--para:{id}--) to map translations to paragraphs
 */
function syncTranslationJSONToParagraphs(
  originalParagraphs: Paragraph[],
  translationJSON: { paragraphs: Array<{ id: string; translated: string }> },
  partialTranslation: boolean = false
): Paragraph[] {
  if (!originalParagraphs || originalParagraphs.length === 0) {
    console.warn('⚠️ syncTranslationJSONToParagraphs: Нет оригинальных параграфов');
    return [];
  }

  if (!translationJSON || !translationJSON.paragraphs || translationJSON.paragraphs.length === 0) {
    console.warn('⚠️ syncTranslationJSONToParagraphs: Нет переведенных параграфов в JSON');
    return originalParagraphs;
  }

  const now = new Date().toISOString();

  // Helper function to check if paragraph is a separator
  const isSeparatorParagraph = (p: Paragraph): boolean => {
    const text = p.originalText.trim();
    if (text.length === 0) return false;
    // Check if paragraph contains only separator characters (repeated)
    const separatorPattern = /^[\s*\-_=~#]+$/;
    return separatorPattern.test(text);
  };

  // Helper function to check if paragraph has valid translation
  const hasValidTranslation = (p: Paragraph): boolean => {
    const text = p.translatedText?.trim() || '';
    if (text.length === 0) return false;
    if (text.startsWith('❌') || text.startsWith('[ERROR')) return false;
    return true;
  };

  console.log(
    `📊 JSON-синхронизация: ${originalParagraphs.length} оригинальных параграфов, ${translationJSON.paragraphs.length} переведенных параграфов`
  );

  // Create map of translations by paragraph ID
  const translationMap = new Map<string, string>();
  for (const tp of translationJSON.paragraphs) {
    // Extract paragraph ID from marker format: --para:{id}--
    let paraId = tp.id;
    if (paraId.startsWith('--para:') && paraId.endsWith('--')) {
      paraId = paraId.slice(7, -2); // Remove --para: and --
    }

    // Also handle case where ID is already extracted or auto-generated
    if (paraId && tp.translated && tp.translated.trim().length > 0) {
      translationMap.set(paraId, tp.translated.trim());
    }
  }

  console.log(`📋 Создана карта переводов: ${translationMap.size} параграфов`);

  // Map translations to original paragraphs
  const result = originalParagraphs.map((original) => {
    // Skip separator paragraphs - they don't need translation
    if (isSeparatorParagraph(original)) {
      return original; // Keep separator paragraph as-is, don't try to translate it
    }

    // If partial translation mode, preserve existing valid translations
    if (partialTranslation && hasValidTranslation(original)) {
      return original;
    }

    // Try to find translation by paragraph ID
    const translation = translationMap.get(original.id);
    if (translation) {
      return {
        ...original,
        translatedText: translation,
        status: 'translated' as const,
        editedAt: now,
        editedBy: 'ai' as const,
      };
    }

    // If no translation found, keep original
    return original;
  });

  // Statistics
  const translatedCount = result.filter((p) => hasValidTranslation(p)).length;
  const preservedCount = originalParagraphs.filter((p) => hasValidTranslation(p)).length;
  const newTranslations = translatedCount - preservedCount;
  const emptyCount = originalParagraphs.length - preservedCount;

  // Log summary
  console.log(
    `✅ JSON-синхронизация завершена: ${translatedCount}/${originalParagraphs.length} параграфов имеют перевод (сохранено: ${preservedCount}, новых: ${newTranslations})`
  );

  // Warning if not all paragraphs got translations
  if (newTranslations < emptyCount && !partialTranslation) {
    const missingCount = emptyCount - newTranslations;
    console.warn(
      `⚠️ Не все параграфы получили перевод: ${newTranslations} из ${emptyCount} пустых параграфов заполнено (отсутствует: ${missingCount})`
    );
  }

  // Critical error check
  if (translatedCount === 0 && translationJSON.paragraphs.length > 0 && !partialTranslation) {
    console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: Весь перевод потерян при JSON-синхронизации!`);
    console.error(`   JSON-параграфов: ${translationJSON.paragraphs.length}`);
    console.error(`   Сопоставлено по ID: ${translationMap.size}`);
  }

  return result;
}

// OpenAI translation function
async function translateWithOpenAI(
  chapter: Chapter,
  glossary: GlossaryEntry[]
): Promise<{ text: string; tokensUsed?: number }> {
  const OpenAI = (await import('openai')).default;

  const client = new OpenAI({
    apiKey: config.openai.apiKey,
  });

  // Build glossary context
  let glossaryText = '';
  if (glossary.length > 0) {
    glossaryText = '\n\nГлоссарий (используй эти переводы):\n';
    for (const entry of glossary) {
      glossaryText += `- ${entry.original} → ${entry.translated}`;
      if (entry.declensions) {
        glossaryText += ` (род.п.: ${entry.declensions.genitive})`;
      }
      glossaryText += '\n';
    }
  }

  console.log(`📤 Отправка ${chapter.originalText.length} символов...`);

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: 'system',
        content: `Ты профессиональный литературный переводчик. Переведи текст с английского на русский.

Правила:
- Сохраняй стиль и тон оригинала
- Используй правильные склонения имён
- Сохраняй форматирование абзацев
- Переводи естественно, как родную русскую литературу
- Имена персонажей транслитерируй и склоняй по правилам русского языка${glossaryText}`,
      },
      {
        role: 'user',
        content: chapter.originalText,
      },
    ],
    temperature: config.translation.temperature,
  });

  const translatedText = response.choices[0]?.message?.content || '';
  const tokensUsed = response.usage?.total_tokens;

  console.log(`📥 Получено ${translatedText.length} символов`);

  return { text: translatedText, tokensUsed };
}

// ============ Glossary ============

app.get('/api/projects/:id/glossary', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project.glossary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get glossary' });
  }
});

app.post('/api/projects/:id/glossary', async (req, res) => {
  try {
    let declensions = req.body.declensions;
    let translated = req.body.translated;

    // Auto-generate declensions for characters using arcane-engine
    if (req.body.type === 'character' && req.body.original && !declensions) {
      const result = getNameDeclensions(req.body.original, req.body.gender || 'unknown');

      // Use auto-generated translation if not provided
      if (!translated) {
        translated = result.translatedName;
      }

      // Generate declensions for the translated name
      declensions = result.declensions;

      console.log(`📝 Auto-declension for "${req.body.original}":`, declensions);
    }

    const entry = await addGlossaryEntry(req.params.id, {
      type: req.body.type || 'term',
      original: req.body.original,
      translated: translated,
      gender: req.body.gender,
      description: req.body.description, // Character/location/term description
      notes: req.body.notes, // User notes (separate from description)
      declensions: declensions,
      firstAppearance: req.body.firstAppearance, // Optional: chapter number
    });

    // Clear agent cache to reload glossary
    clearAgentCache(req.params.id);

    if (!entry) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add glossary entry' });
  }
});

// Update glossary entry
app.put('/api/projects/:projectId/glossary/:entryId', async (req, res) => {
  try {
    const { original, translated, type, gender, description, notes } = req.body;

    let declensions = req.body.declensions;

    // Re-generate declensions if character name changed
    if (type === 'character' && translated && !declensions) {
      const result = getNameDeclensions(original, gender || 'unknown');
      declensions = result.declensions;
    }

    const entry = await updateGlossaryEntry(req.params.projectId, req.params.entryId, {
      original,
      translated,
      type,
      gender,
      description, // Character/location/term description
      notes, // User notes (separate from description)
      declensions,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Clear agent cache to reload glossary
    clearAgentCache(req.params.projectId);

    console.log(`✏️ Глоссарий обновлён: ${entry.original} → ${entry.translated}`);

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update glossary entry' });
  }
});

app.delete('/api/projects/:projectId/glossary/:entryId', async (req, res) => {
  try {
    const success = await deleteGlossaryEntry(req.params.projectId, req.params.entryId);
    if (!success) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Clear agent cache
    clearAgentCache(req.params.projectId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete glossary entry' });
  }
});

// Upload image to glossary entry gallery
app.post(
  '/api/projects/:projectId/glossary/:entryId/image',
  uploadImage.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const project = await getProject(req.params.projectId);
      if (!project) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Project not found' });
      }

      const entry = project.glossary.find((e) => e.id === req.params.entryId);
      if (!entry) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Entry not found' });
      }

      const imageUrl = `/images/${req.file.filename}`;

      // Migrate legacy imageUrl to imageUrls array if needed
      let imageUrls = entry.imageUrls || [];
      if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
        imageUrls = [entry.imageUrl, ...imageUrls];
      }

      // Add new image to gallery
      imageUrls = [...imageUrls, imageUrl];

      // Update entry with new gallery
      const updatedEntry = await updateGlossaryEntry(req.params.projectId, req.params.entryId, {
        imageUrls,
        // Keep legacy imageUrl for backward compatibility (use first image)
        imageUrl: imageUrls[0],
      });

      if (!updatedEntry) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Failed to update entry' });
      }

      res.json({ imageUrl, imageUrls: updatedEntry.imageUrls, entry: updatedEntry });
    } catch (error) {
      console.error('Failed to upload image:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  }
);

// Delete specific image from glossary entry gallery
app.delete('/api/projects/:projectId/glossary/:entryId/image/:imageIndex', async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const entry = project.glossary.find((e) => e.id === req.params.entryId);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const imageIndex = parseInt(req.params.imageIndex, 10);
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

    // Delete the image file
    const imageUrlToDelete = imageUrls[imageIndex];
    const imagePath = path.join(imagesDir, path.basename(imageUrlToDelete));
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    // Remove from array
    imageUrls = imageUrls.filter((_, idx) => idx !== imageIndex);

    // Update entry
    const updatedEntry = await updateGlossaryEntry(req.params.projectId, req.params.entryId, {
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : undefined, // Legacy support
    });

    res.json({ success: true, imageUrls: updatedEntry?.imageUrls || [] });
  } catch (error) {
    console.error('Failed to delete image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Legacy endpoint: delete all images (for backward compatibility)
app.delete('/api/projects/:projectId/glossary/:entryId/image', async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const entry = project.glossary.find((e) => e.id === req.params.entryId);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Get all image URLs (migrate from legacy if needed)
    let imageUrls = entry.imageUrls || [];
    if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
      imageUrls = [entry.imageUrl, ...imageUrls];
    }

    // Delete all image files
    for (const imageUrl of imageUrls) {
      const imagePath = path.join(imagesDir, path.basename(imageUrl));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Update entry to remove all images
    await updateGlossaryEntry(req.params.projectId, req.params.entryId, {
      imageUrls: undefined,
      imageUrl: undefined,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete images:', error);
    res.status(500).json({ error: 'Failed to delete images' });
  }
});

// ============ Paragraphs ============

// Get chapter with paragraph stats
app.get('/api/projects/:projectId/chapters/:chapterId/stats', async (req, res) => {
  try {
    const chapter = await getChapter(req.params.projectId, req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const stats = getChapterStats(chapter);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chapter stats' });
  }
});

// Update single paragraph
// Update chapter title
app.put('/api/projects/:projectId/chapters/:chapterId/title', async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const chapter = await updateChapter(req.params.projectId, req.params.chapterId, {
      title: title.trim(),
    });

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    console.log(`✏️ Название главы обновлено: "${chapter.title}"`);

    res.json(chapter);
  } catch (error) {
    console.error('Failed to update chapter title:', error);
    res.status(500).json({ error: 'Failed to update chapter title' });
  }
});

// Update chapter number
app.put('/api/projects/:projectId/chapters/:chapterId/number', async (req, res) => {
  try {
    const { number } = req.body;

    if (typeof number !== 'number' || number < 1 || !Number.isInteger(number)) {
      return res.status(400).json({ error: 'Valid chapter number is required (positive integer)' });
    }

    const chapter = await updateChapterNumber(req.params.projectId, req.params.chapterId, number);

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    console.log(`🔢 Номер главы обновлён: "${chapter.title}" → ${number}`);

    // Return updated project with reordered chapters
    const project = await getProject(req.params.projectId);
    res.json(project);
  } catch (error) {
    console.error('Failed to update chapter number:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update chapter number';
    res.status(500).json({ error: errorMessage });
  }
});

app.put(
  '/api/projects/:projectId/chapters/:chapterId/paragraphs/:paragraphId',
  async (req, res) => {
    try {
      const { translatedText, status } = req.body;

      const updates: Partial<Paragraph> = {};
      if (translatedText !== undefined) {
        updates.translatedText = translatedText;
        updates.editedAt = new Date().toISOString();
        updates.editedBy = 'user';
      }
      if (status !== undefined) {
        updates.status = status;
      }

      const paragraph = await updateParagraph(
        req.params.projectId,
        req.params.chapterId,
        req.params.paragraphId,
        updates
      );

      if (!paragraph) {
        return res.status(404).json({ error: 'Paragraph not found' });
      }

      console.log(`✏️  Абзац обновлён: ${paragraph.id.slice(0, 8)}... -> ${paragraph.status}`);

      res.json(paragraph);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update paragraph' });
    }
  }
);

// Bulk update paragraph statuses (e.g., approve all)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/paragraphs/bulk-status',
  async (req, res) => {
    try {
      const { paragraphIds, status } = req.body;

      if (!paragraphIds || !Array.isArray(paragraphIds) || !status) {
        return res.status(400).json({ error: 'paragraphIds array and status required' });
      }

      const results: Paragraph[] = [];
      for (const paragraphId of paragraphIds) {
        const paragraph = await updateParagraph(
          req.params.projectId,
          req.params.chapterId,
          paragraphId,
          { status }
        );
        if (paragraph) {
          results.push(paragraph);
        }
      }

      console.log(`✏️  Массовое обновление: ${results.length} абзацев -> ${status}`);

      res.json({ updated: results.length, paragraphs: results });
    } catch (error) {
      res.status(500).json({ error: 'Failed to bulk update paragraphs' });
    }
  }
);

// ============ Export ============

// Export project to EPUB or FB2
app.post('/api/projects/:id/export', async (req, res) => {
  try {
    const { format, author } = req.body;
    const projectId = req.params.id;

    if (!format || (format !== 'epub' && format !== 'fb2')) {
      return res.status(400).json({ error: 'Invalid format. Use "epub" or "fb2"' });
    }

    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Export project
    const filePath = await exportProject(project, {
      format,
      outputDir: exportsDir,
      author,
    });

    // Get relative path for download
    const relativePath = path.relative(exportsDir, filePath);
    const filename = path.basename(filePath);

    console.log(`📤 Экспорт проекта: ${project.name} -> ${format.toUpperCase()} (${filename})`);

    res.json({
      success: true,
      format,
      filename,
      url: `/exports/${relativePath.replace(/\\/g, '/')}`,
      path: relativePath,
    });
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export project' });
  }
});

// ============ SPA Fallback ============

app.get('*', (_req, res) => {
  // Serve index.html from dist/client if exists, fallback to public
  const indexPath = fs.existsSync(path.join(clientPath, 'index.html'))
    ? path.join(clientPath, 'index.html')
    : path.join(publicPath, 'index.html');
  res.sendFile(indexPath);
});

// ============ Start Server ============

async function startServer() {
  // Initialize database
  await initDatabase(config.storage.projectsDir);

  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     █████╗ ██████╗  ██████╗ █████╗ ███╗   ██╗███████╗     ║
║    ██╔══██╗██╔══██╗██╔════╝██╔══██╗████╗  ██║██╔════╝     ║
║    ███████║██████╔╝██║     ███████║██╔██╗ ██║█████╗       ║
║    ██╔══██║██╔══██╗██║     ██╔══██║██║╚██╗██║██╔══╝       ║
║    ██║  ██║██║  ██║╚██████╗██║  ██║██║ ╚████║███████╗     ║
║    ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝     ║
║                                                           ║
║                  Переводчик новелл                        ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   🌐 Сервер: http://localhost:${PORT}                        ║
║   💾 База данных: LowDB (persistent)                      ║
║   🤖 AI: ${
      config.openai.apiKey ? 'OpenAI ✅' : 'Не настроен ⚠️'
    }                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
  });
}

startServer().catch(console.error);
