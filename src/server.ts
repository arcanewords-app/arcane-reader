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
    
    const { model, temperature, enableAnalysis, enableEditing } = req.body;
    
    // Preserve existing reader settings
    const existingReader = project.settings.reader;
    
    project.settings = {
      model: model || project.settings.model,
      temperature: temperature ?? project.settings.temperature,
      enableAnalysis: enableAnalysis ?? project.settings.enableAnalysis ?? true,
      enableTranslation: true, // Always required
      enableEditing: enableEditing ?? project.settings.enableEditing ?? true,
      reader: existingReader,
    };
    
    await updateProject(req.params.id, { settings: project.settings });
    
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
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔮 ЗАПРОС НА ПЕРЕВОД`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`📖 Глава: ${chapter.title}`);
    console.log(`📊 Размер: ${textLength} символов, ~${wordCount} слов`);
    console.log(`🔑 API ключ: ${config.openai.apiKey ? '✅ Настроен' : '❌ Не настроен'}`);
    console.log(`🤖 Модель: ${project.settings?.model || config.openai.model}`);
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
    
    // Use project settings or fallback to config
    const projectModel = project.settings?.model || config.openai.model;
    const projectTemperature = project.settings?.temperature ?? config.translation.temperature;
    const enableAnalysis = project.settings?.enableAnalysis ?? true;
    const enableEditing = project.settings?.enableEditing ?? true;
    
    const stagesInfo = [
      enableAnalysis ? '✅ Анализ' : '⏭️ Анализ',
      '✅ Перевод',
      enableEditing ? '✅ Редактура' : '⏭️ Редактура',
    ].join(' → ');
    
    console.log(`🚀 Запуск arcane-engine TranslationPipeline...`);
    console.log(`   Модель: ${projectModel} | Креативность: ${projectTemperature}`);
    console.log(`   Стадии: ${stagesInfo}`);
    
    // Create project-specific config
    const projectConfig = {
      ...config,
      openai: {
        ...config.openai,
        model: projectModel,
      },
      translation: {
        ...config.translation,
        temperature: projectTemperature,
        skipEditing: !enableEditing,
      },
    };
    
    // Use arcane-engine for translation
    const result = await translateChapterWithPipeline(
      projectConfig,
      project,
      chapter,
      {
        skipAnalysis: !enableAnalysis,
        skipEditing: !enableEditing,
      }
    );
    
    console.log(`${'─'.repeat(60)}`);
    console.log(`✅ ПЕРЕВОД ЗАВЕРШЁН (arcane-engine)`);
    console.log(`⏱️  Время: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`📝 Токенов: ${result.tokensUsed}`);
    if (result.glossaryUpdates?.length) {
      console.log(`📚 Новые записи в глоссарии: ${result.glossaryUpdates.length}`);
    }
    console.log(`${'═'.repeat(60)}\n`);
    
    // Sync translated text to paragraphs
    const translatedParagraphs = syncTranslationToParagraphs(
      chapter.paragraphs || [],
      result.translatedText
    );
    
    await updateChapter(projectId, chapterId, {
      paragraphs: translatedParagraphs,
      translatedText: result.translatedText,
      status: 'completed',
      translationMeta: {
        tokensUsed: result.tokensUsed,
        duration: result.duration,
        model: projectModel,
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
      notes: req.body.notes,
      declensions: declensions,
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
    const { original, translated, type, gender, notes } = req.body;
    
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
      notes,
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

// Upload image for glossary entry
app.post('/api/projects/:projectId/glossary/:entryId/image', uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const imageUrl = `/images/${req.file.filename}`;
    
    const entry = await updateGlossaryEntry(req.params.projectId, req.params.entryId, {
      imageUrl
    });
    
    if (!entry) {
      // Delete uploaded file if entry not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    res.json({ imageUrl, entry });
  } catch (error) {
    console.error('Failed to upload image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Delete image from glossary entry
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
    
    // Delete the image file
    if (entry.imageUrl) {
      const imagePath = path.join(imagesDir, path.basename(entry.imageUrl));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Update entry to remove imageUrl
    await updateGlossaryEntry(req.params.projectId, req.params.entryId, {
      imageUrl: undefined
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
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
