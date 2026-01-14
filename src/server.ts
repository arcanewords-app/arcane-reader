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
  }
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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `glossary-${uniqueSuffix}${ext}`);
  }
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
  }
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
    const projectList = projects.map(p => ({
      id: p.id,
      name: p.name,
      chapterCount: p.chapters.length,
      translatedCount: p.chapters.filter(c => c.status === 'completed').length,
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
      enableEditing 
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
    
    console.log(`📖 Reader настройки обновлены: шрифт=${reader.fontFamily}, размер=${reader.fontSize}px, тема=${reader.colorScheme}`);
    
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
        status: 'pending' 
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

// Translation endpoint with logging
app.post('/api/projects/:projectId/chapters/:chapterId/translate', async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const chapter = project.chapters.find(c => c.id === req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    
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
    console.log(`🤖 Модели: Анализ=${analysisModel} | Перевод=${translationModel} | Редактура=${editingModel}`);
    console.log(`🎨 Креативность: ${project.settings?.temperature ?? config.translation.temperature}`);
    console.log(`💾 Хранилище: LowDB (persistent)`);
    console.log(`${'─'.repeat(60)}`);
    
    // Perform translation using arcane-engine
    performTranslation(
      req.params.projectId,
      req.params.chapterId,
      chapter,
      project,
      startTime
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
  startTime: number
): Promise<void> {
  try {
    if (!config.openai.apiKey) {
      console.log(`⚠️  ДЕМО РЕЖИМ - API ключ не настроен`);
      console.log(`${'═'.repeat(60)}\n`);
      
      // Demo mode - translate paragraphs individually
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update paragraphs with demo translations
      const paragraphs = chapter.paragraphs || [];
      const updatedParagraphs = paragraphs.map((p, idx) => ({
        ...p,
        translatedText: `[ДЕМО ${idx + 1}] ${p.originalText.substring(0, 50)}...`,
        status: 'translated' as const,
        editedAt: new Date().toISOString(),
        editedBy: 'ai' as const,
      }));
      
      const demoText = updatedParagraphs.map(p => p.translatedText).join('\n\n');
      
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
      
      console.log(`✅ Демо-перевод завершён за ${Date.now() - startTime}ms (${paragraphs.length} абзацев)`);
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
    console.log(`   Модели: Анализ=${analysisModel} | Перевод=${translationModel} | Редактура=${editingModel}`);
    console.log(`   Креативность: ${projectTemperature}`);
    console.log(`   Стадии: ${stagesInfo}`);
    
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
      result = await translateChapterWithPipeline(
        projectConfig,
        project,
        chapter,
        {
          skipAnalysis: !enableAnalysis,
          skipEditing: !enableEditing,
        }
      );
    } catch (pipelineError) {
      // Pipeline error - rethrow to outer catch block
      const errorMessage = pipelineError instanceof Error ? pipelineError.message : 'Unknown pipeline error';
      console.error(`❌ [Pipeline] Ошибка в translateChapterWithPipeline: ${errorMessage}`);
      throw pipelineError; // Re-throw to be caught by outer catch
    }
    
    console.log(`${'─'.repeat(60)}`);
    console.log(`✅ ПЕРЕВОД ЗАВЕРШЁН (arcane-engine)`);
    console.log(`⏱️  Время: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`📝 Токенов: ${result.tokensUsed}`);
    if (result.glossaryUpdates?.length) {
      console.log(`📚 Новые записи в глоссарии: ${result.glossaryUpdates.length}`);
    }
    console.log(`${'═'.repeat(60)}\n`);
    
    // Validate translation result
    const hasValidTranslation = result.translatedText && 
      result.translatedText.trim().length > 0 && 
      !result.translatedText.startsWith('[ERROR]');
    
    const hasValidTokens = result.tokensUsed > 0 || result.duration > 0;
    
    if (!hasValidTranslation || (!hasValidTokens && result.duration === 0)) {
      // Translation failed or returned empty/invalid result
      const errorMessage = !hasValidTranslation 
        ? 'Перевод пустой или содержит ошибку'
        : 'Перевод завершился без использования токенов (возможна ошибка)';
      
      console.log(`⚠️  ВАЛИДАЦИЯ НЕ ПРОЙДЕНА: ${errorMessage}`);
      console.log(`   Текст перевода: ${result.translatedText ? `"${result.translatedText.substring(0, 100)}..."` : 'отсутствует'}`);
      console.log(`   Токены: ${result.tokensUsed}, Время: ${result.duration}ms`);
      
      await updateChapter(projectId, chapterId, {
        status: 'error',
        translatedText: result.translatedText || `❌ Ошибка перевода: ${errorMessage}`,
      });
      
      return;
    }
    
    // Sync translated text to paragraphs
    const translatedParagraphs = syncTranslationToParagraphs(
      chapter.paragraphs || [],
      result.translatedText
    );
    
    // Create model info string showing all models used
    const modelInfo = enableAnalysis && enableEditing
      ? `${analysisModel}/${translationModel}/${editingModel}`
      : enableAnalysis
      ? `${analysisModel}/${translationModel}`
      : enableEditing
      ? `${translationModel}/${editingModel}`
      : translationModel;
    
    await updateChapter(projectId, chapterId, {
      paragraphs: translatedParagraphs,
      translatedText: result.translatedText,
      status: 'completed',
      translationMeta: {
        tokensUsed: result.tokensUsed,
        duration: result.duration,
        model: modelInfo, // Store all models used (or single model if stages skipped)
        translatedAt: new Date().toISOString(),
      },
    });
    
    console.log(`📄 Синхронизировано ${translatedParagraphs.length} абзацев`);
    
    // Auto-add detected glossary entries
    if (result.glossaryUpdates?.length) {
      for (const entry of result.glossaryUpdates) {
        await addGlossaryEntry(projectId, entry);
      }
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`❌ ОШИБКА: ${errorMessage}`);
    console.log(`${'═'.repeat(60)}\n`);
    
    await updateChapter(projectId, chapterId, {
      translatedText: `❌ Ошибка перевода: ${errorMessage}`,
      status: 'error',
    });
  }
}

/**
 * Sync translated text to paragraph structure
 * Tries to match translated paragraphs to original ones
 */
function syncTranslationToParagraphs(
  originalParagraphs: Paragraph[],
  translatedText: string
): Paragraph[] {
  if (!originalParagraphs || originalParagraphs.length === 0) {
    return [];
  }
  
  // Split translated text into paragraphs
  const translatedParts = translatedText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  const now = new Date().toISOString();
  
  // Map translations to original paragraphs
  return originalParagraphs.map((original, index) => {
    const translatedPart = translatedParts[index] || '';
    
    return {
      ...original,
      translatedText: translatedPart,
      status: translatedPart ? 'translated' as const : 'pending' as const,
      editedAt: translatedPart ? now : original.editedAt,
      editedBy: translatedPart ? 'ai' as const : original.editedBy,
    };
  });
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
- Имена персонажей транслитерируй и склоняй по правилам русского языка${glossaryText}`
      },
      {
        role: 'user',
        content: chapter.originalText
      }
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
      const result = getNameDeclensions(
        req.body.original,
        req.body.gender || 'unknown'
      );
      
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
app.post('/api/projects/:projectId/glossary/:entryId/image', uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const project = await getProject(req.params.projectId);
    if (!project) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const entry = project.glossary.find(e => e.id === req.params.entryId);
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
});

// Delete specific image from glossary entry gallery
app.delete('/api/projects/:projectId/glossary/:entryId/image/:imageIndex', async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const entry = project.glossary.find(e => e.id === req.params.entryId);
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
    
    const entry = project.glossary.find(e => e.id === req.params.entryId);
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

app.put('/api/projects/:projectId/chapters/:chapterId/paragraphs/:paragraphId', async (req, res) => {
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
});

// Bulk update paragraph statuses (e.g., approve all)
app.post('/api/projects/:projectId/chapters/:chapterId/paragraphs/bulk-status', async (req, res) => {
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
});

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
║   🤖 AI: ${config.openai.apiKey ? 'OpenAI ✅' : 'Не настроен ⚠️'}                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
  });
}

startServer().catch(console.error);
