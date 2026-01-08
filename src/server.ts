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
  addGlossaryEntry,
  updateGlossaryEntry,
  deleteGlossaryEntry,
  type Chapter,
  type GlossaryEntry,
  type Project,
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

// Storage for uploaded files
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

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
    
    const { model, temperature, skipEditing } = req.body;
    
    project.settings = {
      model: model || project.settings.model,
      temperature: temperature ?? project.settings.temperature,
      skipEditing: skipEditing ?? project.settings.skipEditing,
    };
    
    await updateProject(req.params.id, { settings: project.settings });
    
    console.log(`⚙️  Настройки проекта "${project.name}" обновлены:`, project.settings);
    
    res.json(project.settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
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
      
      // Demo mode
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const demoText = `[ДЕМО] Перевод главы "${chapter.title}"\n\n` + 
        `⚠️ Это демонстрационный режим.\n` +
        `Для реального перевода добавьте OPENAI_API_KEY в файл .env\n\n` +
        `${'─'.repeat(40)}\n\n` +
        chapter.originalText.split('\n').map(line => 
          line ? `📖 ${line}` : ''
        ).join('\n');
      
      await updateChapter(projectId, chapterId, {
        translatedText: demoText,
        status: 'completed',
        translationMeta: {
          tokensUsed: 0,
          duration: Date.now() - startTime,
          model: 'demo',
          translatedAt: new Date().toISOString(),
        },
      });
      
      console.log(`✅ Демо-перевод завершён за ${Date.now() - startTime}ms`);
      return;
    }
    
    // Use project settings or fallback to config
    const projectModel = project.settings?.model || config.openai.model;
    const projectTemperature = project.settings?.temperature ?? config.translation.temperature;
    const projectSkipEditing = project.settings?.skipEditing ?? config.translation.skipEditing;
    
    console.log(`🚀 Запуск arcane-engine TranslationPipeline...`);
    console.log(`   Модель: ${projectModel} | Креативность: ${projectTemperature}`);
    
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
        skipEditing: projectSkipEditing,
      },
    };
    
    // Use arcane-engine for translation
    const result = await translateChapterWithPipeline(
      projectConfig,
      project,
      chapter,
      {
        skipAnalysis: true, // Can enable later for auto-glossary
        skipEditing: projectSkipEditing,
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
    
    await updateChapter(projectId, chapterId, {
      translatedText: result.translatedText,
      status: 'completed',
      translationMeta: {
        tokensUsed: result.tokensUsed,
        duration: result.duration,
        model: config.openai.model,
        translatedAt: new Date().toISOString(),
      },
    });
    
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

app.delete('/api/projects/:projectId/glossary/:entryId', async (req, res) => {
  try {
    const success = await deleteGlossaryEntry(req.params.projectId, req.params.entryId);
    if (!success) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete glossary entry' });
  }
});

// ============ SPA Fallback ============

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
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
