/**
 * Arcane Reader - Web server for novel translation UI
 *
 * Integrated with:
 * - Supabase PostgreSQL for persistent storage
 * - OpenAI for translation
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { loadConfig, validateConfig, hasAIProvider } from './config.js';
// Database operations from Supabase
import {
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
  updateChaptersOrder,
  addGlossaryEntry,
  updateGlossaryEntry,
  getGlossaryEntry,
  deleteGlossaryEntry,
  updateParagraph,
  updateReaderSettings,
  getReaderSettings,
  resetStuckChapters,
  listPublicationsPublic,
  getPublicationById,
  getPublicationWithChapters,
  getPublicationChapterContent,
  getGlossaryForPublication,
  createOrUpdatePublication,
  unpublishProject,
  getUserPublications,
  getPublicationByProjectId,
} from './services/supabaseDatabase.js';
// Types and utilities from database.ts (still used for compatibility)
import {
  getChapterStats,
  parseTextToParagraphs,
  mergeParagraphsToText,
  type Chapter,
  type GlossaryEntry,
  type Project,
  type Paragraph,
} from './storage/database.js';
import { requireAuth } from './middleware/auth.js';
import { requireToken } from './utils/requestHelpers.js';
import {
  getUserTokenUsage,
  checkTokenLimit,
  incrementTokenUsage,
  getTokenUsageHistory,
} from './middleware/tokenLimits.js';
import {
  estimateTokensForTranslation,
  estimateTokensForStages,
  estimateTokensByStage,
  type TranslationStages,
} from './config/tokenLimits.js';
import {
  translateChapterWithPipeline,
  translateSimple,
  getNameDeclensions,
  clearAgentCache,
} from './services/engine-integration.js';
import {
  suggestGlossaryMerges,
  type MergeSuggestion,
} from './services/glossaryMergeSuggestions.js';
import { exportProject } from './services/export/index.js';
import { authService } from './services/authService.js';
import { parseFile, isSupportedFormat, getProjectTypeFromFormat } from './services/import/index.js';
import type { ParseResult } from './services/import/index.js';
import {
  uploadFile,
  deleteFile,
  deleteFiles,
  getPublicUrl,
  extractPathFromUrl,
  generateUniqueFilename,
  downloadFile,
} from './services/storage.js';
import { createSignedUrl } from './services/storage.js';
import { listFiles } from './services/storage.js';

// Load configuration
const config = loadConfig();
const configValidation = validateConfig(config);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Decode filename from multipart uploads.
 * Browsers may send UTF-8 names that some stacks interpret as Latin-1, causing mojibake.
 * Prefer client-sent "filename" field; use this when only originalname is available.
 */
function decodeMultipartFilename(originalname: string): string {
  if (!originalname || typeof originalname !== 'string') return originalname;
  try {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  } catch {
    return originalname;
  }
}

const app = express();
const PORT = config.port;

// Storage for uploaded chapter files
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit (increased for EPUB/FB2)
  fileFilter: (_req, file, cb) => {
    const filename = decodeMultipartFilename(file.originalname).toLowerCase();
    const allowedExtensions = ['.txt', '.epub', '.fb2'];
    const allowedMimes = [
      'text/plain',
      'application/epub+zip',
      'application/x-epub+zip',
      'application/xml',
      'text/xml',
    ];

    const hasValidExtension = allowedExtensions.some((ext) => filename.endsWith(ext));
    const hasValidMime = allowedMimes.includes(file.mimetype);

    if (hasValidExtension || hasValidMime) {
      cb(null, true);
    } else {
      cb(new Error('Поддерживаемые форматы: .txt, .epub, .fb2'));
    }
  },
});

// Storage for glossary images - using memory storage for Supabase upload
const uploadImage = multer({
  storage: multer.memoryStorage(),
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

// In-memory registry for translation cancellation: when user clicks Cancel, server checks this and stops pipeline
const translationCancelRegistry = new Map<string, boolean>();
function translationCancelKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files - prefer dist/client if exists (production), fallback to public (legacy)
const distClientPath = path.join(__dirname, '../dist/client');
const publicPath = path.join(__dirname, '../public');
const clientPath = fs.existsSync(distClientPath) ? distClientPath : publicPath;

app.use(express.static(clientPath));
// Images and exports are now served from Supabase Storage via public URLs
// No need for local static file serving

// ============ API Routes ============

// ============ Auth Routes ============

// Check if invitation code is required for registration
app.get('/api/auth/invite-required', (_req, res) => {
  res.json({ required: !!process.env.INVITATION_CODE });
});

// Validate invitation code (optional: used when INVITATION_CODE env is set)
app.post('/api/auth/check-invite', (req, res) => {
  const requiredCode = process.env.INVITATION_CODE;
  if (!requiredCode) {
    return res.status(200).json({ valid: true });
  }
  const { code } = req.body || {};
  if (!code || code !== requiredCode) {
    return res.status(400).json({ error: 'Invalid invitation code' });
  }
  res.status(200).json({ valid: true });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, invitationCode } = req.body;
    const requiredCode = process.env.INVITATION_CODE;

    if (requiredCode) {
      if (!invitationCode || invitationCode !== requiredCode) {
        return res.status(403).json({ error: 'Valid invitation code is required to register' });
      }
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await authService.register(email, password);
    res.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    res.status(400).json({ error: message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await authService.login(email, password);

    // Get session token to return to client
    const session = await authService.getSession();

    res.json({
      user,
      session: session
        ? {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    res.status(401).json({ error: message });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    await authService.logout();
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Logout failed';
    res.status(500).json({ error: message });
  }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  try {
    // Get JWT token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token and get user using the same style as middleware
    const user = await authService.getUserByToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get user';
    res.status(500).json({ error: message });
  }
});

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
    storage: 'supabase',
  });
});

// ============ Token Usage ============

// Get current token usage (requires auth)
app.get('/api/user/token-usage', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const date = req.query.date as string | undefined;
    const usage = await getUserTokenUsage(req.user.id, requireToken(req), date, req.user.role);
    res.json(usage);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get token usage';
    console.error('Error getting token usage:', error);
    res.status(500).json({ error: errorMessage });
  }
});

// Get token usage history (requires auth)
app.get('/api/user/token-usage/history', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt((req.query.days as string) || '7', 10);
    const history = await getTokenUsageHistory(req.user.id, requireToken(req), days, req.user.role);
    res.json({ history });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get token usage history';
    console.error('Error getting token usage history:', error);
    res.status(500).json({ error: errorMessage });
  }
});

// ============ Projects ============

// Get all projects (requires auth)
app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Reset stuck chapters across all projects on startup/refresh
    const token = requireToken(req);
    const resetCount = await resetStuckChapters(token, undefined);
    if (resetCount > 0) {
      console.log(`🔄 Сброшено застрявших глав: ${resetCount}`);
    }

    const projects = await getAllProjects(req.user.id, token);
    const projectList = projects.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type, // Include project type
      chapterCount: p.chapters.length,
      translatedCount: p.chapters.filter((c) => c.status === 'completed').length,
      glossaryCount: p.glossary.length,
      originalReadingMode: p.settings?.originalReadingMode ?? false, // Include original reading mode flag
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      metadata: p.metadata || undefined, // Include metadata (for cover images, etc.)
    }));
    res.json(projectList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// Create new project (requires auth)
app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, sourceLanguage, targetLanguage } = req.body;
    const token = requireToken(req);
    const project = await createProject(
      { name, sourceLanguage, targetLanguage },
      req.user.id,
      token
    );
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get project by ID (requires auth)
app.get('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = requireToken(req);
    const project = await getProject(req.params.id, req.user.id, token);
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

// Delete project (requires auth)
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const success = await deleteProject(req.params.id, req.user.id, requireToken(req));
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Update project settings (requires auth)
app.put('/api/projects/:id/settings', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = requireToken(req);
    const project = await getProject(req.params.id, req.user.id, token);
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
    } = req.body;

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

    await updateProject(req.params.id, { settings: updatedSettings }, req.user.id, token);

    // Get updated project to return fresh settings
    const updatedProject = await getProject(req.params.id, req.user.id, token);
    if (!updatedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const stagesStatus = [
      updatedSettings.enableAnalysis ? '✅ Анализ' : '⏭️ Анализ',
      updatedSettings.enableTranslation ? '✅ Перевод' : '⏭️ Перевод',
      updatedSettings.enableEditing ? '✅ Редактура' : '⏭️ Редактура',
    ].join(' → ');

    console.log(`⚙️  Настройки проекта "${updatedProject.name}" обновлены:`);
    console.log(`   Модель: ${updatedSettings.stageModels?.translation || updatedSettings.model || 'N/A'} | Стадии: ${stagesStatus}`);
    if (updatedSettings.originalReadingMode) {
      console.log(`   📖 Режим оригинального чтения: включен`);
    }

    res.json(updatedProject.settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get reader settings (requires auth)
app.get('/api/projects/:id/settings/reader', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = requireToken(req);
    const project = await getProject(req.params.id, req.user.id, token);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const reader = getReaderSettings(project);
    res.json(reader);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get reader settings' });
  }
});

// Update reader settings (requires auth)
app.put('/api/projects/:id/settings/reader', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = requireToken(req);
    const reader = await updateReaderSettings(req.params.id, req.body, req.user.id, token);
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

// Upload chapter to project (requires auth)
app.post('/api/projects/:id/chapters', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = requireToken(req);
    const project = await getProject(req.params.id, req.user.id, token);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Use client-sent filename (correct UTF-8) when present; else decode multipart originalname for any locale
    const filename =
      typeof req.body?.filename === 'string' && req.body.filename.trim()
        ? req.body.filename.trim()
        : decodeMultipartFilename(req.file.originalname);

    // Check if format is supported
    if (!isSupportedFormat(filename)) {
      return res.status(400).json({
        error: 'Неподдерживаемый формат файла',
        details: 'Поддерживаемые форматы: .txt, .epub, .fb2',
      });
    }

    // Parse file based on format
    let parseResult: ParseResult;
    try {
      parseResult = await parseFile(req.file.buffer, filename);
    } catch (parseError) {
      const errorMessage =
        parseError instanceof Error ? parseError.message : 'Ошибка парсинга файла';
      console.error('Parse error:', parseError);
      return res.status(400).json({
        error: 'Ошибка при парсинге файла',
        details: errorMessage,
        parseErrors: [errorMessage],
      });
    }

    // Handle parsing errors and warnings
    if (parseResult.errors && parseResult.errors.length > 0) {
      console.error('Parse errors:', parseResult.errors);
      return res.status(400).json({
        error: 'Ошибки при парсинге файла',
        details: parseResult.errors.join('; '),
        parseErrors: parseResult.errors,
        warnings: parseResult.warnings,
      });
    }

    // Determine project type from file format
    const detectedType = getProjectTypeFromFormat(parseResult.format);
    
    // Update project type if not set or if it's the first chapter (auto-detect)
    const isFirstChapter = project.chapters.length === 0;
    const needsTypeUpdate = !project.type || project.type === 'text' && detectedType !== 'text';
    
    if (isFirstChapter && needsTypeUpdate) {
      await updateProject(
        req.params.id,
        { type: detectedType },
        req.user.id,
        token
      );
      console.log(`📌 Тип проекта определен: ${detectedType}`);
    }

    // Update project metadata if available (for EPUB/FB2) and it's the first chapter
    // For subsequent chapters, don't update metadata (as per requirement #4)
    if (isFirstChapter && parseResult.metadata && Object.keys(parseResult.metadata).length > 0) {
      let updatedMetadata = {
        ...project.metadata,
        ...parseResult.metadata,
      };

      // Save cover image if present
      if (parseResult.metadata.coverImage) {
        try {
          const ext = parseResult.metadata.coverImage.mimeType.split('/')[1] || 'jpg';
          const storagePath = generateUniqueFilename('cover', ext, req.params.id);
          
          const uploadResult = await uploadFile(
            'images',
            storagePath,
            parseResult.metadata.coverImage.data,
            {
              contentType: parseResult.metadata.coverImage.mimeType,
            }
          );
          
          updatedMetadata.coverImageUrl = uploadResult.publicUrl;
          console.log(`🖼️  Обложка сохранена в Supabase Storage: ${storagePath}`);
        } catch (coverError) {
          console.error('Failed to save cover image:', coverError);
        }
        // Remove coverImage buffer from metadata (we only store URL)
        delete (updatedMetadata as any).coverImage;
      }

      // Only update if there's new metadata
      if (JSON.stringify(updatedMetadata) !== JSON.stringify(project.metadata || {})) {
        await updateProject(
          req.params.id,
          { metadata: updatedMetadata },
          req.user.id,
          token
        );
        console.log(`📚 Метаданные проекта обновлены: ${parseResult.metadata.title || 'N/A'}`);
      }
    } else if (!isFirstChapter && parseResult.metadata && Object.keys(parseResult.metadata).length > 0) {
      console.log(`ℹ️  Пропущено обновление метаданных: проект уже содержит главы`);
    }

    // Handle multiple chapters (EPUB/FB2) or single chapter (TXT)
    if (parseResult.chapters.length === 0) {
      return res.status(400).json({
        error: 'Файл не содержит глав',
        details: 'Не удалось извлечь ни одной главы из файла',
      });
    }

    // Add all chapters from parsed result
    const addedChapters = [];
    for (const parsedChapter of parseResult.chapters) {
      const chapter = await addChapter(
        req.params.id,
        {
          title: parsedChapter.title,
          originalText: parsedChapter.content,
        },
        token
      );
      addedChapters.push(chapter);
    }

    // Return single chapter for backward compatibility, or array if multiple
    if (addedChapters.length === 1) {
      res.json(addedChapters[0]);
    } else {
      res.json({
        chapters: addedChapters,
        count: addedChapters.length,
        warnings: parseResult.warnings,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add chapter';
    // Check if error is related to token validation
    if (message.includes('Token is required') || message.includes('Invalid token')) {
      return res.status(401).json({ error: message });
    }
    console.error('Failed to add chapter:', error);
    res.status(500).json({
      error: 'Failed to add chapter',
      details: message,
    });
  }
});

// Get chapter status only (lightweight, for polling during translation)
app.get('/api/projects/:projectId/chapters/:chapterId/status', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const chapter = await getChapter(req.params.projectId, req.params.chapterId, requireToken(req));
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json({ status: chapter.status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chapter status' });
  }
});

// Get chapter (requires auth)
app.get('/api/projects/:projectId/chapters/:chapterId', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify project belongs to user (RLS will check automatically, but good to verify)
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const chapter = await getChapter(req.params.projectId, req.params.chapterId, requireToken(req));
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chapter' });
  }
});

// Delete chapter (requires auth)
app.delete('/api/projects/:projectId/chapters/:chapterId', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify project belongs to user
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const success = await deleteChapter(
      req.params.projectId,
      req.params.chapterId,
      requireToken(req)
    );
    if (!success) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

// ============ Translation ============

// Cancel translation (reset stuck status) (requires auth)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/translate/cancel',
  requireAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify project belongs to user
      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const chapter = await getChapter(
        req.params.projectId,
        req.params.chapterId,
        requireToken(req)
      );
      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      // Only set cancel flag if status is translating; performTranslation will set status to pending when it exits (single source of truth)
      if (chapter.status === 'translating') {
        translationCancelRegistry.set(translationCancelKey(req.params.projectId, req.params.chapterId), true);
        console.log(`⏹️  Перевод отменён (флаг): ${chapter.title}`);
        res.json({ success: true, message: 'Translation cancelled' });
      } else {
        res.json({ success: false, message: 'Chapter is not being translated' });
      }
    } catch (error) {
      console.error('Failed to cancel translation:', error);
      res.status(500).json({ error: 'Failed to cancel translation' });
    }
  }
);

// Manual sync translated chunks to paragraphs (recovery endpoint) (requires auth)
// NOTE: Sync is now automatic after translation. This endpoint is for recovery only.
app.post(
  '/api/projects/:projectId/chapters/:chapterId/translate/sync',
  requireAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify project belongs to user
      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const chapter = await getChapter(
        req.params.projectId,
        req.params.chapterId,
        requireToken(req)
      );
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
      await updateChapter(
        req.params.projectId,
        req.params.chapterId,
        {
          paragraphs: syncedParagraphs,
        },
        requireToken(req)
      );

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
  }
);

// Upload ready-made translation (requires auth)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/upload-translation',
  requireAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const project = await getProject(req.params.projectId, req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const chapter = await getChapter(
        req.params.projectId,
        req.params.chapterId,
        token
      );
      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      if (chapter.status === 'translating') {
        return res.status(400).json({
          error: 'Translation in progress',
          message: 'Дождитесь окончания перевода или отмените его.',
        });
      }

      if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
        return res.status(400).json({
          error: 'No paragraphs',
          message: 'Глава не содержит параграфов. Сначала добавьте главу с текстом.',
        });
      }

      const translatedText = (req.body?.translatedText ?? '').trim();
      if (!translatedText) {
        return res.status(400).json({
          error: 'Empty translation',
          message: 'Текст перевода не может быть пустым.',
        });
      }

      const syncedParagraphs = syncTranslationToParagraphs(
        chapter.paragraphs,
        translatedText,
        { replaceAll: true, editedBy: 'user' }
      );

      const mergedText = mergeParagraphsToText(syncedParagraphs, 'translatedText');
      const chunks = mergedText
        .split(/\n\s*\n/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      const now = new Date().toISOString();
      const updatedChapter = await updateChapter(
        req.params.projectId,
        req.params.chapterId,
        {
          paragraphs: syncedParagraphs,
          translatedText: mergedText,
          translatedChunks: chunks,
          status: 'completed',
          translationMeta: {
            ...(chapter.translationMeta || {}),
            source: 'uploaded',
            translatedAt: now,
            tokensUsed: 0,
            duration: 0,
            model: 'uploaded',
          },
        },
        token
      );

      if (updatedChapter) {
        console.log(`📤 Загружен готовый перевод: ${chapter.title}`);
        res.json(updatedChapter);
      } else {
        res.status(500).json({ error: 'Failed to update chapter' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to upload translation:', error);
      res.status(500).json({
        error: 'Failed to upload translation',
        details: errorMessage,
      });
    }
  }
);

// Mark chapter as translated (treat current content as ready-made translation)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/mark-as-translated',
  requireAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const project = await getProject(req.params.projectId, req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const chapter = await getChapter(
        req.params.projectId,
        req.params.chapterId,
        token
      );
      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      if (chapter.status === 'translating') {
        return res.status(400).json({
          error: 'Translation in progress',
          message: 'Дождитесь окончания перевода или отмените его.',
        });
      }

      if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
        return res.status(400).json({
          error: 'No paragraphs',
          message: 'Глава не содержит параграфов.',
        });
      }

      // Debug: input state
      const withOriginal = chapter.paragraphs.filter((p) => (p.originalText || '').trim().length > 0).length;
      const totalOriginalChars = chapter.paragraphs.reduce((s, p) => s + (p.originalText || '').length, 0);
      console.log(
        `[mark-as-translated] Вход: ${chapter.title}, параграфов=${chapter.paragraphs.length}, с текстом=${withOriginal}, символов=${totalOriginalChars}`
      );

      const now = new Date().toISOString();

      // Copy originalText → translatedText for each paragraph (1:1)
      const updatedParagraphs = chapter.paragraphs.map((p) => ({
        ...p,
        translatedText: p.originalText,
        status: 'translated' as const,
        editedBy: 'user' as const,
        editedAt: now,
      }));

      const mergedText = mergeParagraphsToText(updatedParagraphs, 'translatedText');
      // Keep 1:1 mapping: chunks[i] = paragraph[i].translatedText (for auto-recovery consistency)
      const chunks = [...updatedParagraphs]
        .sort((a, b) => a.index - b.index)
        .map((p) => p.translatedText || '');

      // Debug: verify counts match
      console.log(
        `[mark-as-translated] ${chapter.title}: paragraphs=${chapter.paragraphs.length}, chunks=${chunks.length}, mergedLen=${mergedText.length}, emptyParagraphs=${updatedParagraphs.filter((p) => !(p.translatedText || '').trim()).length}`
      );

      const updatedChapter = await updateChapter(
        req.params.projectId,
        req.params.chapterId,
        {
          paragraphs: updatedParagraphs,
          translatedText: mergedText,
          translatedChunks: chunks,
          originalText: '',
          status: 'completed',
          translationMeta: {
            ...(chapter.translationMeta || {}),
            source: 'uploaded',
            translatedAt: now,
            tokensUsed: 0,
            duration: 0,
            model: 'uploaded',
          },
        },
        token
      );

      if (updatedChapter) {
        console.log(`✅ Глава помечена как переведённая: ${chapter.title}`);
        res.json(updatedChapter);
      } else {
        res.status(500).json({ error: 'Failed to update chapter' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to mark chapter as translated:', error);
      res.status(500).json({
        error: 'Failed to mark chapter as translated',
        details: errorMessage,
      });
    }
  }
);

// Translation endpoint with logging (requires auth)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/translate',
  requireAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const chapter = project.chapters.find((c) => c.id === req.params.chapterId);
      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      // Idempotency: only one translation job per chapter (refactor TRANSLATION_CANCEL_REFACTOR)
      if (chapter.status === 'translating') {
        return res.status(409).json({
          error: 'Translation already in progress',
          code: 'ALREADY_RUNNING',
          message: 'Перевод этой главы уже выполняется. Дождитесь завершения или отмените.',
        });
      }

      // Use chapter.originalText if set; otherwise derive from paragraphs (e.g. after "mark as translated" which clears chapter.originalText but keeps paragraph.originalText)
      const effectiveOriginalText =
        (chapter.originalText && chapter.originalText.trim().length > 0)
          ? chapter.originalText.trim()
          : (chapter.paragraphs && chapter.paragraphs.length > 0)
            ? mergeParagraphsToText(chapter.paragraphs, 'originalText').trim()
            : '';
      if (!effectiveOriginalText) {
        return res.status(400).json({
          error: 'No source text',
          message: 'Глава не содержит исходного текста. Добавьте текст или импортируйте главу заново.',
        });
      }
      const chapterForTranslation = { ...chapter, originalText: effectiveOriginalText };

      // Parse request body: translateOnlyEmpty, paragraphIds, stages (array or 'all')
      const body = req.body || {};
      const translateOnlyEmpty = body.translateOnlyEmpty === true;
      const paragraphIds = Array.isArray(body.paragraphIds) ? body.paragraphIds : undefined;
      const stagesRaw = body.stages;
      const validStage = (s: unknown): s is 'analysis' | 'translation' | 'editing' =>
        s === 'analysis' || s === 'translation' || s === 'editing';
      let stages: TranslationStages = 'all';
      if (Array.isArray(stagesRaw) && stagesRaw.length > 0) {
        const arr = stagesRaw.filter(validStage);
        if (arr.length > 0) stages = [...new Set(arr)]; // unique, preserve order
      } else if (stagesRaw === 'all') {
        stages = 'all';
      }

      const hasValidTranslation = (p: { translatedText?: string | null }) => {
        const t = p.translatedText?.trim() || '';
        if (!t.length) return false;
        if (t.startsWith('❌') || t.startsWith('[ERROR')) return false;
        return true;
      };

      // Text length for token estimate: selected paragraphs, or empty only, or full chapter
      let textLength = chapterForTranslation.originalText.length;
      if (paragraphIds?.length && chapterForTranslation.paragraphs?.length) {
        const idSet = new Set(paragraphIds);
        textLength = chapterForTranslation.paragraphs
          .filter((p) => idSet.has(p.id))
          .reduce((sum, p) => sum + p.originalText.length, 0);
      } else if (translateOnlyEmpty && chapterForTranslation.paragraphs?.length) {
        const empty = chapterForTranslation.paragraphs.filter((p) => !hasValidTranslation(p));
        textLength = empty.reduce((sum, p) => sum + p.originalText.length, 0);
      }

      // Log chapter state before translation
      const hasTranslatedText =
        !!chapterForTranslation.translatedText && chapterForTranslation.translatedText.trim().length > 0;
      const hasTranslatedParagraphs = chapterForTranslation.paragraphs?.some(
        (p) => p.translatedText && p.translatedText.trim().length > 0
      );
      console.log(`📋 Состояние главы перед переводом: ${chapterForTranslation.title}`);
      console.log(`   ID: ${chapterForTranslation.id}, Статус: ${chapterForTranslation.status}`);
      console.log(`   Есть переведенный текст: ${hasTranslatedText}`);
      console.log(`   Есть переведенные параграфы: ${hasTranslatedParagraphs}`);
      console.log(`   Количество параграфов: ${chapterForTranslation.paragraphs?.length || 0}`);
      console.log(
        `   Режим: ${paragraphIds?.length ? `Выбранные параграфы (${paragraphIds.length})` : translateOnlyEmpty ? 'Только пустые параграфы' : 'Вся глава'}`
      );

      const token = requireToken(req);
      const startTime = Date.now();
      const wordCount = Math.max(1, textLength / 5);

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

      // Estimate tokens for the requested stages
      const estimatedTokens = estimateTokensForStages(textLength, stages);

      // Check token limit before starting translation (limit depends on user role)
      const limitCheck = await checkTokenLimit(req.user.id, token, estimatedTokens, req.user.role);
      
      if (!limitCheck.allowed) {
        // Reset chapter status back to pending
        await updateChapter(
          req.params.projectId,
          req.params.chapterId,
          { status: 'pending' },
          token
        );

        // Calculate reset time (next midnight UTC)
        const now = new Date();
        const resetTime = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
          0, 0, 0
        ));

        return res.status(429).json({
          error: 'Token limit exceeded',
          message: limitCheck.message || 'Дневной лимит токенов исчерпан. Попробуйте завтра.',
          currentUsage: limitCheck.currentUsage,
          limit: limitCheck.limit,
          estimatedTokens,
          resetAt: resetTime.toISOString(),
        });
      }

      // Update status to translating
      await updateChapter(
        req.params.projectId,
        req.params.chapterId,
        { status: 'translating' },
        token
      );

      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🔮 ЗАПРОС НА ПЕРЕВОД`);
      console.log(`${'─'.repeat(60)}`);
      console.log(`📖 Глава: ${chapterForTranslation.title}`);
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

      performTranslation(
        req.params.projectId,
        req.params.chapterId,
        chapterForTranslation,
        project,
        startTime,
        translateOnlyEmpty,
        token,
        req.user.id,
        paragraphIds,
        stages
      );

      res.json({ status: 'started', chapterId: chapter.id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to start translation' });
    }
  }
);

/**
 * Translation logic - uses arcane-engine.
 * Glossary accumulates per project: new entries from the analysis stage are saved
 * to the project and available for subsequent chapters. Stages (analysis |
 * translation | editing | all) are passed from the API request body.
 */
async function performTranslation(
  projectId: string,
  chapterId: string,
  chapter: Chapter,
  project: Project,
  startTime: number,
  translateOnlyEmpty: boolean = false,
  token: string,
  userId: string,
  paragraphIds?: string[],
  stages: TranslationStages = 'all'
): Promise<void> {
  const cancelKey = translationCancelKey(projectId, chapterId);
  const isCancelled = () => translationCancelRegistry.get(cancelKey) === true;
  try {
    if (!chapter) {
      throw new Error('Глава не указана');
    }

    // Use chapter.originalText if set; otherwise derive from paragraphs (e.g. after "mark as translated")
    const effectiveOriginalText =
      (chapter.originalText && chapter.originalText.trim().length > 0)
        ? chapter.originalText.trim()
        : (chapter.paragraphs && chapter.paragraphs.length > 0)
          ? mergeParagraphsToText(chapter.paragraphs, 'originalText').trim()
          : '';
    if (!effectiveOriginalText) {
      throw new Error('Глава не содержит исходного текста');
    }
    const chapterWithOriginal = { ...chapter, originalText: effectiveOriginalText };

    const paragraphs = chapterWithOriginal.paragraphs || [];
    if (paragraphs.length === 0) {
      throw new Error('Глава не содержит параграфов');
    }

    if (!config.openai.apiKey) {
      console.log(`⚠️  ДЕМО РЕЖИМ - API ключ не настроен`);
      console.log(`${'═'.repeat(60)}\n`);

      // Demo mode - translate paragraphs individually
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Update paragraphs with demo translations
      const demoParagraphs = chapterWithOriginal.paragraphs || [];
      const updatedParagraphs = demoParagraphs.map((p, idx) => ({
        ...p,
        translatedText: `[ДЕМО ${idx + 1}] ${p.originalText.substring(0, 50)}...`,
        status: 'translated' as const,
        editedAt: new Date().toISOString(),
        editedBy: 'ai' as const,
      }));

      const demoText = updatedParagraphs.map((p) => p.translatedText).join('\n\n');

      await updateChapter(
        projectId,
        chapterId,
        {
          paragraphs: updatedParagraphs,
          translatedText: demoText,
          status: 'completed',
          translationMeta: {
            tokensUsed: 0,
            duration: Date.now() - startTime,
            model: 'demo',
            translatedAt: new Date().toISOString(),
          },
        },
        token
      );

      console.log(
        `✅ Демо-перевод завершён за ${Date.now() - startTime}ms (${demoParagraphs.length} абзацев)`
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

    const stageLabels: Record<string, string> = {
      analysis: 'Анализ',
      translation: 'Перевод',
      editing: 'Редактура',
    };
    const stagesInfo =
      stages === 'all'
        ? '✅ Анализ → ✅ Перевод → ✅ Редактура'
        : Array.isArray(stages)
          ? stages.map((s) => `✅ ${stageLabels[s] || s}`).join(' → ')
          : '✅ Редактура';

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

    // Determine which paragraphs to translate: selected IDs, empty only, or full chapter
    let chapterToTranslate = chapterWithOriginal;
    let paragraphsToTranslate = chapterWithOriginal.paragraphs || [];
    let translateSubsetOnly = false; // true when we merge synced subset back into full paragraphs

    if (paragraphIds?.length) {
      const idSet = new Set(paragraphIds);
      paragraphsToTranslate = (chapterWithOriginal.paragraphs || []).filter((p) => idSet.has(p.id));
      if (paragraphsToTranslate.length === 0) {
        console.log(`ℹ️  Нет выбранных параграфов для перевода.`);
        await updateChapter(projectId, chapterId, { status: 'completed' }, token, { useServiceRole: true });
        return;
      }
      const textToTranslate = mergeParagraphsToText(paragraphsToTranslate, 'originalText');
      const markedText = addParagraphMarkers(textToTranslate, paragraphsToTranslate);
      chapterToTranslate = { ...chapterWithOriginal, originalText: markedText };
      translateSubsetOnly = true;
      console.log(`📝 Режим выбранных параграфов: ${paragraphsToTranslate.length} из ${(chapterWithOriginal.paragraphs || []).length}`);
    } else if (translateOnlyEmpty) {
      const paragraphs = chapterWithOriginal.paragraphs || [];
      const emptyParagraphs = paragraphs.filter((p) => !hasValidTranslation(p));

      if (emptyParagraphs.length === 0) {
        console.log(`ℹ️  Нет пустых параграфов для перевода. Перевод пропущен.`);
        await updateChapter(projectId, chapterId, { status: 'completed' }, token, { useServiceRole: true });
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

      const markedText = addParagraphMarkers(textToTranslate, emptyParagraphs);
      paragraphsToTranslate = emptyParagraphs;

      chapterToTranslate = {
        ...chapterWithOriginal,
        originalText: markedText,
      };
    } else {
      const markedText = addParagraphMarkers(chapterWithOriginal.originalText, chapterWithOriginal.paragraphs || []);
      chapterToTranslate = {
        ...chapterWithOriginal,
        originalText: markedText,
      };
    }

    // Create project-specific config
    const projectConfig = {
      ...config,
      openai: {
        ...config.openai,
        model: translationModel,
      },
      translation: {
        ...config.translation,
        temperature: projectTemperature,
      },
    };

    if (isCancelled()) {
      console.log(`⏹️  Перевод отменён пользователем до запуска пайплайна: ${chapter.title}`);
      await updateChapter(projectId, chapterId, { status: 'pending' }, token, { useServiceRole: true });
      return;
    }

    // Use arcane-engine for translation (stages: array or 'all')
    let result;
    try {
      const needsExistingText =
        Array.isArray(stages) && stages.includes('editing') && !stages.includes('translation');
      result = await translateChapterWithPipeline(projectConfig, project, chapterToTranslate, {
        stages,
        existingTranslatedText: needsExistingText
          ? (chapterWithOriginal.translatedText?.trim() || '') || undefined
          : undefined,
        isCancelled,
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

    // Show tokens by stage (only stages that were run)
    if (result.tokensByStage) {
      const stageTokens: string[] = [];
      if (result.tokensByStage.analysis !== undefined) {
        stageTokens.push(`🔍 Анализ: ${result.tokensByStage.analysis.toLocaleString()}`);
      }
      if (result.tokensByStage.translation !== undefined) {
        stageTokens.push(`🔮 Перевод: ${result.tokensByStage.translation.toLocaleString()}`);
      }
      if (result.tokensByStage.editing !== undefined) {
        stageTokens.push(`✨ Редактура: ${result.tokensByStage.editing.toLocaleString()}`);
      }
      if (stageTokens.length) {
        console.log(`📝 Токенов по стейджам: ${stageTokens.join(' | ')}`);
      }
      console.log(`📊 Всего токенов: ${result.tokensUsed.toLocaleString()}`);
    } else {
      console.log(`📝 Токенов: ${result.tokensUsed.toLocaleString()}`);
    }

    if (result.glossaryUpdates?.length) {
      console.log(`📚 Новые записи в глоссарии: ${result.glossaryUpdates.length}`);
    }
    console.log(`${'═'.repeat(60)}\n`);

    // stages = ['analysis'] only: save glossary, don't update chapter translation
    if (Array.isArray(stages) && stages.length === 1 && stages[0] === 'analysis') {
      if (result.glossaryUpdates?.length) {
        for (const entry of result.glossaryUpdates) {
          await addGlossaryEntry(projectId, entry, token);
        }
      }
      if (result.glossaryUpdatesExisting?.length) {
        for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
          await updateGlossaryEntry(projectId, entryId, updates, token);
        }
      }
      if (result.glossaryAppearanceEntryIds?.length) {
        const chapterNum = chapter.number;
        for (const entryId of result.glossaryAppearanceEntryIds) {
          const entry = await getGlossaryEntry(projectId, entryId, token);
          if (entry) {
            const merged = [...new Set([...(entry.mentionedInChapters ?? []), chapterNum])].sort((a, b) => a - b);
            await updateGlossaryEntry(projectId, entryId, { mentionedInChapters: merged }, token);
          }
        }
      }
      const nowIso = new Date().toISOString();
      // When only analysis ran: always set status to 'analyzed' so UI shows 🔍 (analysis-only),
      // not ✅ (completed). If the chapter already had translation, we keep the content but the
      // badge reflects "last run was analysis only".
      await updateChapter(
        projectId,
        chapterId,
        {
          status: 'analyzed',
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed,
            tokensByStage: result.tokensByStage,
            duration: result.duration,
            model: analysisModel,
            translatedAt: nowIso,
            lastAnalysisAt: nowIso,
          },
        },
        token,
        { useServiceRole: true }
      );
      try {
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage);
      } catch (tokenError) {
        console.error('⚠️ Failed to update token usage (non-critical):', tokenError);
      }
      return;
    }

    // Validate translation result
    const isValidTranslationResult =
      result.translatedText &&
      result.translatedText.trim().length > 0 &&
      !result.translatedText.startsWith('[ERROR]');

    const hasValidTokens = result.tokensUsed > 0 || result.duration > 0;

    if (!isValidTranslationResult || (!hasValidTokens && result.duration === 0)) {
      // Translation failed or returned empty/invalid result — still save tokens used so far
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

      const modelInfoOnError =
        stages === 'all'
          ? `${analysisModel}/${translationModel}/${editingModel}`
          : Array.isArray(stages)
            ? stages
                .map((s) =>
                  s === 'analysis' ? analysisModel : s === 'translation' ? translationModel : editingModel
                )
                .join('/')
            : editingModel;

      await updateChapter(
        projectId,
        chapterId,
        {
          status: 'error',
          translatedText: result.translatedText || `❌ Ошибка перевода: ${errorMessage}`,
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed,
            tokensByStage: result.tokensByStage,
            duration: result.duration,
            model: modelInfoOnError,
            translatedAt: new Date().toISOString(),
          },
        },
        token,
        { useServiceRole: true }
      );

      // Count tokens toward usage even when translation failed (stages were run)
      if (result.tokensUsed > 0) {
        try {
          await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage);
        } catch (tokenError) {
          console.error('⚠️ Failed to update token usage (non-critical):', tokenError);
        }
      }

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

    // Get current chapter state for synchronization (service role so JWT expiry during long run doesn't fail)
    const currentChapter = await getChapter(projectId, chapterId, token, { useServiceRole: true });
    if (!currentChapter) {
      throw new Error('Не удалось получить главу для синхронизации');
    }

    const originalParagraphsForSync = translateSubsetOnly
      ? paragraphsToTranslate
      : currentChapter.paragraphs;
    const partialSync = translateOnlyEmpty && !translateSubsetOnly;

    let syncedParagraphs: Paragraph[];

    if (parsedJSON && parsedJSON.paragraphs && Array.isArray(parsedJSON.paragraphs)) {
      console.log(`🔄 Автоматическая синхронизация перевода с параграфами (JSON-формат)...`);
      syncedParagraphs = syncTranslationJSONToParagraphs(
        originalParagraphsForSync,
        parsedJSON,
        partialSync
      );
    } else {
      console.log(`🔄 Автоматическая синхронизация перевода с параграфами (текстовый формат)...`);
      syncedParagraphs = syncTranslationChunksToParagraphs(
        originalParagraphsForSync,
        translatedChunks,
        partialSync
      );
    }

    // When we translated only a subset (paragraphIds), merge synced subset back into full paragraphs
    if (translateSubsetOnly && currentChapter.paragraphs) {
      const syncedById = new Map(syncedParagraphs.map((p) => [p.id, p]));
      syncedParagraphs = currentChapter.paragraphs.map((p) => syncedById.get(p.id) ?? p);
    }

    // Create model info string based on stages run (analysis-only already returned above)
    const modelInfo =
      stages === 'all'
        ? `${analysisModel}/${translationModel}/${editingModel}`
        : Array.isArray(stages)
          ? stages.map((s) => (s === 'analysis' ? analysisModel : s === 'translation' ? translationModel : editingModel)).join('/')
          : editingModel;

    // Prepare translatedChunks for saving (use from parsedJSON or text-based chunks)
    const chunksToSave =
      parsedJSON && parsedJSON.paragraphs
        ? parsedJSON.paragraphs.map((p) => p.translated)
        : translatedChunks;

    const nowIso = new Date().toISOString();
    const ranAnalysis = stages === 'all' || (Array.isArray(stages) && stages.includes('analysis'));

    // Save translation with synced paragraphs (service role so JWT expiry during long run doesn't fail)
    await updateChapter(
      projectId,
      chapterId,
      {
        translatedText: result.translatedText,
        translatedChunks: chunksToSave,
        paragraphs: syncedParagraphs, // Auto-synced paragraphs
        status: 'completed',
        translationMeta: {
          ...(chapter.translationMeta || {}),
          tokensUsed: result.tokensUsed,
          tokensByStage: result.tokensByStage,
          duration: result.duration,
          model: modelInfo, // Store all models used (or single model if stages skipped)
          translatedAt: nowIso,
          lastAnalysisAt: ranAnalysis ? nowIso : (chapter.translationMeta?.lastAnalysisAt ?? undefined),
        },
      },
      token,
      { useServiceRole: true }
    );

    console.log(`📦 Сохранено ${chunksToSave.length} чанков перевода`);
    console.log(`✅ Глава успешно переведена и синхронизирована: ${chapter.title}`);

    // Update token usage counter
    try {
      await incrementTokenUsage(
        userId,
        token,
        result.tokensUsed,
        result.tokensByStage
      );
    } catch (tokenError) {
      // Don't fail translation if token tracking fails
      console.error('⚠️  Failed to update token usage (non-critical):', tokenError);
    }

    // Verify the chapter was saved correctly (service role for same reason)
    const savedChapter = await getChapter(projectId, chapterId, token, { useServiceRole: true });
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

    // Auto-add detected glossary entries (new + updates for existing)
    if (result.glossaryUpdates?.length) {
      for (const entry of result.glossaryUpdates) {
        await addGlossaryEntry(projectId, entry, token);
      }
    }
    if (result.glossaryUpdatesExisting?.length) {
      for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
        await updateGlossaryEntry(projectId, entryId, updates, token);
      }
    }
    if (result.glossaryAppearanceEntryIds?.length) {
      const chapterNum = chapter.number;
      for (const entryId of result.glossaryAppearanceEntryIds) {
        const entry = await getGlossaryEntry(projectId, entryId, token);
        if (entry) {
          const merged = [...new Set([...(entry.mentionedInChapters ?? []), chapterNum])].sort((a, b) => a - b);
          await updateGlossaryEntry(projectId, entryId, { mentionedInChapters: merged }, token);
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    if (errorMessage === 'Cancelled') {
      console.log(`⏹️  Перевод отменён пользователем: ${chapter.title}`);
      await updateChapter(projectId, chapterId, { status: 'pending' }, token, { useServiceRole: true });
      return;
    }
    console.log(`❌ ОШИБКА: ${errorMessage}`);
    if (errorStack) {
      console.log(`   Stack trace: ${errorStack.substring(0, 500)}...`);
    }
    console.log(`${'═'.repeat(60)}\n`);

    // Try to preserve existing translation if any (service role so expired JWT doesn't lose the error state)
    const currentChapter = await getChapter(projectId, chapterId, token, { useServiceRole: true });
    const existingTranslation = currentChapter?.translatedText;

    await updateChapter(
      projectId,
      chapterId,
      {
        translatedText: existingTranslation || `❌ Ошибка перевода: ${errorMessage}`,
        status: 'error',
      },
      token,
      { useServiceRole: true }
    );

    console.log(`⚠️ Глава помечена как ошибка: ${chapter.title}`);
    console.log(`   Сохранен существующий перевод: ${!!existingTranslation}`);
  } finally {
    translationCancelRegistry.delete(cancelKey);
  }
}

/**
 * Sync translated text to paragraph structure
 * Tries to match translated paragraphs to original ones
 * Improved to handle cases where paragraph count doesn't match
 * Preserves existing translations for paragraphs that already have valid translations (unless replaceAll=true)
 *
 * @param replaceAll - If true, replace all paragraphs with new translation (for uploaded translation)
 * @param editedBy - 'ai' for pipeline translation, 'user' for uploaded translation
 */
function syncTranslationToParagraphs(
  originalParagraphs: Paragraph[],
  translatedText: string,
  options?: { replaceAll?: boolean; editedBy?: 'ai' | 'user' }
): Paragraph[] {
  const replaceAll = options?.replaceAll ?? false;
  const editedBy = options?.editedBy ?? 'ai';
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

    // If paragraph already has valid translation, preserve it (unless replaceAll)
    if (!replaceAll && hasValidTranslation(original)) {
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
          editedBy,
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

app.get('/api/projects/:id/glossary', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = requireToken(req);
    const project = await getProject(req.params.id, req.user.id, token);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project.glossary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get glossary' });
  }
});

app.post('/api/projects/:id/glossary', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify project belongs to user
    const token = requireToken(req);
    const project = await getProject(req.params.id, req.user.id, token);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

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

    const entry = await addGlossaryEntry(
      req.params.id,
      {
        type: req.body.type || 'term',
        original: req.body.original,
        translated: translated,
        gender: req.body.gender,
        description: req.body.description, // Character/location/term description
        notes: req.body.notes, // User notes (separate from description)
        declensions: declensions,
        firstAppearance: req.body.firstAppearance, // Optional: chapter number
      },
      requireToken(req)
    );

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

// Update glossary entry (requires auth)
app.put('/api/projects/:projectId/glossary/:entryId', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify project belongs to user
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { original, translated, type, gender, description, notes } = req.body;

    let declensions = req.body.declensions;

    // Re-generate declensions if character name changed
    if (type === 'character' && translated && !declensions) {
      const result = getNameDeclensions(original, gender || 'unknown');
      declensions = result.declensions;
    }

    const entry = await updateGlossaryEntry(
      req.params.projectId,
      req.params.entryId,
      {
        original,
        translated,
        type,
        gender,
        description, // Character/location/term description
        notes, // User notes (separate from description)
        declensions,
      },
      requireToken(req)
    );

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

app.delete('/api/projects/:projectId/glossary/:entryId', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify project belongs to user
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const success = await deleteGlossaryEntry(
      req.params.projectId,
      req.params.entryId,
      requireToken(req)
    );
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

// Suggest glossary merges (LLM analyzes and returns groups of entries to merge)
app.post('/api/projects/:projectId/glossary/suggest-merges', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = requireToken(req);
    const project = await getProject(req.params.projectId, req.user.id, token);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!config.openai?.apiKey) {
      return res.status(503).json({
        error: 'AI not configured',
        message: 'Configure OpenAI API key to use merge suggestions.',
      });
    }
    const model = project.settings?.stageModels?.analysis ?? project.settings?.model ?? config.openai.model;
    const suggestions: MergeSuggestion[] = await suggestGlossaryMerges(project.glossary, {
      apiKey: config.openai.apiKey,
      model,
      timeout: config.openai.timeout,
    });
    res.json({ suggestions });
  } catch (error) {
    console.error('[suggest-merges]', error);
    res.status(500).json({ error: 'Failed to get merge suggestions' });
  }
});

// Merge glossary entries into one (keep one, merge fields, delete others)
app.post('/api/projects/:projectId/glossary/merge', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = requireToken(req);
    const project = await getProject(req.params.projectId, req.user.id, token);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { entryIds, keepEntryId } = req.body as { entryIds?: string[]; keepEntryId?: string };
    if (!Array.isArray(entryIds) || entryIds.length < 2) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'entryIds must be an array of at least 2 entry IDs.',
      });
    }

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
      notesList.length > 0 ? [...new Set(notesList)].filter(Boolean).join(' ; ') : primary.notes;

    await updateGlossaryEntry(
      req.params.projectId,
      primary.id,
      {
        mentionedInChapters: mergedChapters,
        ...(mergedDescription !== undefined && { description: mergedDescription }),
        ...(mergedNotes !== undefined && { notes: mergedNotes }),
      },
      token
    );

    for (const e of others) {
      await deleteGlossaryEntry(req.params.projectId, e.id, token);
    }

    clearAgentCache(req.params.projectId);

    const kept = await getGlossaryEntry(req.params.projectId, primary.id, token);
    res.json({
      kept: kept ?? primary,
      deletedCount: others.length,
    });
  } catch (error) {
    console.error('[glossary merge]', error);
    res.status(500).json({ error: 'Failed to merge glossary entries' });
  }
});

// Upload image to glossary entry gallery (requires auth)
app.post(
  '/api/projects/:projectId/glossary/:entryId/image',
  requireAuth,
  uploadImage.single('image'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const entry = project.glossary.find((e) => e.id === req.params.entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      // Upload to Supabase Storage
      const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
      const storagePath = generateUniqueFilename(
        `glossary-${req.params.entryId}`,
        ext,
        req.params.projectId
      );

      const uploadResult = await uploadFile(
        'images',
        storagePath,
        req.file.buffer,
        {
          contentType: req.file.mimetype,
        }
      );

      // Migrate legacy imageUrl to imageUrls array if needed
      let imageUrls = entry.imageUrls || [];
      if (entry.imageUrl && !imageUrls.includes(entry.imageUrl)) {
        imageUrls = [entry.imageUrl, ...imageUrls];
      }

      // Add new image to gallery
      imageUrls = [...imageUrls, uploadResult.publicUrl];

      // Update entry with new gallery
      const updatedEntry = await updateGlossaryEntry(
        req.params.projectId,
        req.params.entryId,
        {
          imageUrls,
          // Keep legacy imageUrl for backward compatibility (use first image)
          imageUrl: imageUrls[0],
        },
        requireToken(req)
      );

      if (!updatedEntry) {
        // Rollback: delete uploaded file if update failed
        await deleteFile('images', storagePath).catch(console.error);
        return res.status(404).json({ error: 'Failed to update entry' });
      }

      res.json({
        imageUrl: uploadResult.publicUrl,
        imageUrls: updatedEntry.imageUrls,
        entry: updatedEntry,
      });
    } catch (error) {
      console.error('Failed to upload image:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  }
);

// Delete specific image from glossary entry gallery (requires auth)
app.delete(
  '/api/projects/:projectId/glossary/:entryId/image/:imageIndex',
  requireAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
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

      // Delete the image file from Supabase Storage
      const imageUrlToDelete = imageUrls[imageIndex];
      const storagePath = extractPathFromUrl(imageUrlToDelete, 'images');
      if (storagePath) {
        await deleteFile('images', storagePath).catch((err) => {
          console.error('Failed to delete image from storage:', err);
          // Continue even if deletion fails
        });
      }

      // Remove from array
      imageUrls = imageUrls.filter((_, idx) => idx !== imageIndex);

      // Update entry
      const updatedEntry = await updateGlossaryEntry(
        req.params.projectId,
        req.params.entryId,
        {
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          imageUrl: imageUrls.length > 0 ? imageUrls[0] : undefined, // Legacy support
        },
        requireToken(req)
      );

      res.json({ success: true, imageUrls: updatedEntry?.imageUrls || [] });
    } catch (error) {
      console.error('Failed to delete image:', error);
      res.status(500).json({ error: 'Failed to delete image' });
    }
  }
);

// Legacy endpoint: delete all images (for backward compatibility) (requires auth)
app.delete('/api/projects/:projectId/glossary/:entryId/image', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
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

      // Delete all image files from Supabase Storage
      const storagePaths = imageUrls
        .map((url) => extractPathFromUrl(url, 'images'))
        .filter((p): p is string => p !== null);
      
      if (storagePaths.length > 0) {
        await deleteFiles('images', storagePaths).catch((err) => {
          console.error('Failed to delete images from storage:', err);
          // Continue even if deletion fails
        });
      }

    // Update entry to remove all images
    await updateGlossaryEntry(
      req.params.projectId,
      req.params.entryId,
      {
        imageUrls: undefined,
        imageUrl: undefined,
      },
      requireToken(req)
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete images:', error);
    res.status(500).json({ error: 'Failed to delete images' });
  }
});

// Upload project cover image (requires auth)
app.post(
  '/api/projects/:projectId/cover',
  requireAuth,
  uploadImage.single('image'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      if (!project) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Project not found' });
      }

      // Delete old cover if exists
      if (project.metadata?.coverImageUrl) {
        const oldStoragePath = extractPathFromUrl(project.metadata.coverImageUrl, 'images');
        if (oldStoragePath) {
          await deleteFile('images', oldStoragePath).catch((err) => {
            console.error('Failed to delete old cover:', err);
            // Continue even if deletion fails
          });
        }
      }

      // Upload to Supabase Storage
      const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
      const storagePath = generateUniqueFilename('cover', ext, req.params.projectId);
      
      const uploadResult = await uploadFile(
        'images',
        storagePath,
        req.file.buffer,
        {
          contentType: req.file.mimetype,
        }
      );
      
      const coverImageUrl = uploadResult.publicUrl;

      // Update project metadata with new cover
      // Ensure metadata object exists before spreading
      const updatedMetadata = {
        ...(project.metadata || {}),
        coverImageUrl,
      };

      console.log(`📤 Загрузка обложки для проекта ${req.params.projectId}`);
      console.log(`   Текущий metadata:`, JSON.stringify(project.metadata || null));
      console.log(`   Новый metadata:`, JSON.stringify(updatedMetadata));

      const updatedProject = await updateProject(
        req.params.projectId,
        {
          metadata: updatedMetadata,
        },
        req.user.id,
        requireToken(req)
      );

      if (!updatedProject) {
        // Rollback: delete uploaded file if update failed
        await deleteFile('images', storagePath).catch(console.error);
        return res.status(404).json({ error: 'Failed to update project' });
      }

      console.log(`✅ Обложка сохранена в проект. Новый metadata:`, JSON.stringify(updatedProject.metadata || null));

      res.json({ coverImageUrl, project: updatedProject });
    } catch (error) {
      console.error('Failed to upload cover image:', error);
      res.status(500).json({ error: 'Failed to upload cover image' });
    }
  }
);

// Delete project cover image (requires auth)
app.delete('/api/projects/:projectId/cover', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete cover image file from Supabase Storage if exists
    if (project.metadata?.coverImageUrl) {
      const storagePath = extractPathFromUrl(project.metadata.coverImageUrl, 'images');
      if (storagePath) {
        await deleteFile('images', storagePath).catch((err) => {
          console.error('Failed to delete cover image:', err);
          // Continue even if deletion fails
        });
      }
    }

    // Update project metadata to remove cover
    const updatedMetadata = { ...(project.metadata || {}) };
    delete updatedMetadata.coverImageUrl;

    const updatedProject = await updateProject(
      req.params.projectId,
      { metadata: updatedMetadata },
      req.user.id,
      requireToken(req)
    );

    if (!updatedProject) {
      return res.status(404).json({ error: 'Failed to update project' });
    }

    res.json({ success: true, project: updatedProject });
  } catch (error) {
    console.error('Failed to delete cover image:', error);
    res.status(500).json({ error: 'Failed to delete cover image' });
  }
});

// Update project metadata (e.g. description) (requires auth)
app.put('/api/projects/:projectId/metadata', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { metadata: metadataUpdates } = req.body;
    if (!metadataUpdates || typeof metadataUpdates !== 'object') {
      return res.status(400).json({ error: 'metadata object is required' });
    }

    const updatedMetadata = { ...(project.metadata || {}), ...metadataUpdates };
    const updatedProject = await updateProject(
      req.params.projectId,
      { metadata: updatedMetadata },
      req.user.id,
      requireToken(req)
    );

    if (!updatedProject) {
      return res.status(404).json({ error: 'Failed to update project' });
    }

    res.json(updatedProject);
  } catch (error) {
    console.error('Failed to update project metadata:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update project metadata';
    res.status(500).json({ error: errorMessage });
  }
});

// ============ Paragraphs ============

// Get chapter with paragraph stats (requires auth)
app.get('/api/projects/:projectId/chapters/:chapterId/stats', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify project belongs to user
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const chapter = await getChapter(req.params.projectId, req.params.chapterId, requireToken(req));
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
// Update chapter title (requires auth)
app.put('/api/projects/:projectId/chapters/:chapterId/title', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify project belongs to user
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { title } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const chapter = await updateChapter(
      req.params.projectId,
      req.params.chapterId,
      {
        title: title.trim(),
      },
      requireToken(req)
    );

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

// Update chapter number (requires auth)
app.put('/api/projects/:projectId/chapters/:chapterId/number', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { number } = req.body;

    if (typeof number !== 'number' || number < 1 || !Number.isInteger(number)) {
      return res.status(400).json({ error: 'Valid chapter number is required (positive integer)' });
    }

    const chapter = await updateChapterNumber(
      req.params.projectId,
      req.params.chapterId,
      number,
      requireToken(req)
    );

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    console.log(`🔢 Номер главы обновлён: "${chapter.title}" → ${number}`);

    // Return updated project with reordered chapters
    // No delay needed - Supabase updates are synchronous within the same connection
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    res.json(project);
  } catch (error) {
    console.error('Failed to update chapter number:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update chapter number';
    res.status(500).json({ error: errorMessage });
  }
});

// Reorder chapters (accepts full ordered ids array)
app.put('/api/projects/:projectId/chapters/order', requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) {
      return res.status(400).json({ error: 'Invalid ids array' });
    }

    await updateChaptersOrder(req.params.projectId, ids, requireToken(req));

    // Return updated project
    const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
    res.json(project);
  } catch (error) {
    console.error('Failed to reorder chapters:', error);
    const message = error instanceof Error ? error.message : 'Failed to reorder chapters';
    res.status(500).json({ error: message });
  }
});

// Update paragraph (requires auth)
app.put(
  '/api/projects/:projectId/chapters/:chapterId/paragraphs/:paragraphId',
  requireAuth,
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

      const token = requireToken(req);
      const paragraph = await updateParagraph(
        req.params.projectId,
        req.params.chapterId,
        req.params.paragraphId,
        updates,
        token
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

// Bulk update paragraph statuses (e.g., approve all) (requires auth)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/paragraphs/bulk-status',
  requireAuth,
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
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
          { status },
          requireToken(req)
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

// Export project to EPUB or FB2 (requires auth)
app.post('/api/projects/:id/export', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { format, author } = req.body;
    const projectId = req.params.id;

    if (!format || (format !== 'epub' && format !== 'fb2')) {
      return res.status(400).json({ error: 'Invalid format. Use "epub" or "fb2"' });
    }

    const project = await getProject(projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate file in temporary directory
    // On Vercel, only /tmp is writable, so use it explicitly
    // On local, os.tmpdir() works fine
    const tmpDir = process.env.VERCEL ? '/tmp' : os.tmpdir();
    const filename = `${sanitizeFilename(project.name)}-${Date.now()}.${format}`;
    const tmpPath = path.join(tmpDir, filename);

    console.log(`📝 Начало экспорта: ${project.name} -> ${format.toUpperCase()}`);
    console.log(`   Временный файл: ${tmpPath}`);
    console.log(`   Временная директория: ${tmpDir} (VERCEL=${!!process.env.VERCEL})`);

    // Ensure tmp directory exists (should already exist on Vercel, but safe to check)
    if (!fs.existsSync(tmpDir)) {
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        console.log(`   ✅ Создана временная директория: ${tmpDir}`);
      } catch (mkdirError: any) {
        console.error(`   ❌ Ошибка создания директории: ${mkdirError.message}`);
        throw new Error(`Не удалось создать временную директорию: ${tmpDir}. Ошибка: ${mkdirError.message}`);
      }
    } else {
      console.log(`   ✅ Временная директория существует: ${tmpDir}`);
    }

    try {
      // ============ Auto-clean old exports ============
      // We keep storage usage under control (Supabase bucket is limited).
      // Strategy:
      // - Delete exports older than EXPORT_RETENTION_DAYS
      // - Also keep only last EXPORT_KEEP_LATEST files per project
      const EXPORT_RETENTION_DAYS = 7;
      const EXPORT_KEEP_LATEST = 5;
      try {
        const folder = projectId;
        const files = await listFiles('exports', folder, { limit: 100 });

        const now = Date.now();
        const toTimestamp = (d?: string): number => {
          if (!d) return 0;
          const t = Date.parse(d);
          return Number.isFinite(t) ? t : 0;
        };

        const withTs = files
          // ignore pseudo-folders
          .filter((f) => f.name && !f.name.endsWith('/'))
          .map((f) => {
            const ts = Math.max(toTimestamp(f.created_at), toTimestamp(f.updated_at), toTimestamp(f.last_accessed_at));
            return { ...f, __ts: ts };
          })
          .sort((a, b) => (b.__ts || 0) - (a.__ts || 0));

        const cutoff = now - EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

        const oldByAge = withTs.filter((f) => (f.__ts || 0) > 0 && (f.__ts || 0) < cutoff);
        const oldByCount = withTs.slice(EXPORT_KEEP_LATEST);

        // De-duplicate by name
        const toDeleteNames = Array.from(new Set([...oldByAge, ...oldByCount].map((f) => f.name)));

        if (toDeleteNames.length > 0) {
          const paths = toDeleteNames.map((name) => `${folder}/${name}`);
          console.log(`🧹 Auto-clean exports: deleting ${paths.length} files from exports/${folder}/`);
          await deleteFiles('exports', paths);
        }
      } catch (cleanupErr) {
        // Cleanup must never break export itself
        console.warn('⚠️ Auto-clean exports failed (continuing):', cleanupErr);
      }

      // Export project to temporary file
      console.log(`   Генерация файла...`);
      const exportedPath = await exportProject(project, {
        format,
        outputDir: tmpDir,
        filename,
        author,
      });

      console.log(`   ✅ Файл создан: ${exportedPath}`);

      // Check if file exists
      if (!fs.existsSync(exportedPath)) {
        throw new Error(`Файл не был создан: ${exportedPath}`);
      }

      // Read file as buffer
      console.log(`   Чтение файла...`);
      const fileBuffer = fs.readFileSync(exportedPath);
      console.log(`   ✅ Файл прочитан: ${fileBuffer.length} байт`);

      // Upload to Supabase Storage (recommended for Vercel)
      const contentType = format === 'epub' ? 'application/epub+zip' : 'application/xml';
      const storagePath = `${projectId}/${filename}`;

      console.log(`   ☁️ Загрузка в Supabase Storage: bucket=exports path=${storagePath}`);
      const uploaded = await uploadFile('exports', storagePath, fileBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

      // Prefer signed URL (works even if bucket is private)
      const { signedUrl } = await createSignedUrl('exports', storagePath, 60 * 30);

      // Clean up temporary file after upload
      try {
        fs.unlinkSync(exportedPath);
        console.log(`   ✅ Временный файл удален`);
      } catch (cleanupError) {
        console.warn(`   ⚠️ Не удалось удалить временный файл: ${cleanupError}`);
      }

      console.log(
        `📤 Экспорт проекта завершен: ${project.name} -> ${format.toUpperCase()} (${filename}), storagePath=${storagePath}`
      );

      // downloadUrl: same-origin proxy so browser downloads instead of opening (Content-Disposition: attachment)
      const downloadUrl = `/api/projects/${projectId}/export/download?path=${encodeURIComponent(storagePath)}`;

      return res.json({
        success: true,
        format,
        filename,
        path: uploaded.path,
        url: signedUrl,
        publicUrl: uploaded.publicUrl,
        downloadUrl,
      });
    } catch (exportError) {
      // Clean up temporary file on error
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw exportError;
    }
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export project' });
  }
});

// Download export file via proxy (Content-Disposition: attachment so browser downloads, not opens)
app.get('/api/projects/:id/export/download', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const projectId = req.params.id;
    const pathParam = req.query.path as string;

    if (!pathParam || typeof pathParam !== 'string') {
      return res.status(400).json({ error: 'Missing path query parameter' });
    }

    const storagePath = decodeURIComponent(pathParam).replace(/^\/+/, '');

    if (!storagePath.startsWith(projectId + '/') || storagePath.includes('..')) {
      return res.status(403).json({ error: 'Forbidden: invalid path' });
    }

    const project = await getProject(projectId, req.user.id, requireToken(req));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const buffer = await downloadFile('exports', storagePath);
    const filename = storagePath.split('/').pop() || 'export';

    const contentType =
      filename.endsWith('.epub') ? 'application/epub+zip' : 'application/xml';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Download failed';
    console.error('Export download error:', error);
    res.status(500).json({ error: msg });
  }
});

// Helper function to sanitize filename
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 100); // Limit length
}

// ============ Publications (public catalog) ============

// List published publications (public, no auth)
app.get('/api/publications', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
    const orderBy = (req.query.orderBy as string) === 'created_at' ? 'created_at' : 'published_at';
    const orderAsc = req.query.orderAsc === 'true';
    const list = await listPublicationsPublic({ limit, offset, orderBy, orderAsc });
    res.json(list);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to list publications';
    res.status(500).json({ error: msg });
  }
});

// Get single publication (public)
app.get('/api/publications/:id', async (req, res) => {
  try {
    const pub = await getPublicationById(req.params.id);
    if (!pub) {
      return res.status(404).json({ error: 'Publication not found' });
    }
    res.json(pub);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
  }
});

// Get publication with chapters list (public, for reading page)
app.get('/api/publications/:id/chapters', async (req, res) => {
  try {
    const result = await getPublicationWithChapters(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Publication not found' });
    }
    res.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
  }
});

// Get single chapter content for public reading (translated text only)
app.get('/api/publications/:id/chapters/:chapterId', async (req, res) => {
  try {
    const chapter = await getPublicationChapterContent(req.params.id, req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json(chapter);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to get chapter';
    res.status(500).json({ error: msg });
  }
});

// Get publication glossary (public, read-only; returns empty array if not published)
app.get('/api/publications/:id/glossary', async (req, res) => {
  try {
    const entries = await getGlossaryForPublication(req.params.id);
    res.json(entries);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to get glossary';
    res.status(500).json({ error: msg });
  }
});

// Publish project (auth required)
app.post('/api/projects/:projectId/publish', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const projectId = req.params.projectId;
    const body = req.body as {
      status?: 'draft' | 'published';
      title?: string | null;
      description?: string | null;
      coverImageUrl?: string | null;
      authorDisplay?: string | null;
      translatorDisplay?: string | null;
      sourceLanguage?: string;
      targetLanguage?: string;
    };
    const status = body.status ?? 'published';
    const publication = await createOrUpdatePublication(
      projectId,
      userId,
      token,
      {
        status,
        title: body.title,
        description: body.description,
        coverImageUrl: body.coverImageUrl,
        authorDisplay: body.authorDisplay,
        translatorDisplay: body.translatorDisplay ?? req.user!.email,
        sourceLanguage: body.sourceLanguage,
        targetLanguage: body.targetLanguage,
      }
    );
    res.json(publication);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to publish';
    res.status(400).json({ error: msg });
  }
});

// Unpublish project (auth required)
app.delete('/api/projects/:projectId/publish', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const projectId = req.params.projectId;
    const ok = await unpublishProject(projectId, userId, token);
    if (!ok) {
      return res.status(404).json({ error: 'Publication not found' });
    }
    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to unpublish';
    res.status(400).json({ error: msg });
  }
});

// Get current user's publications (auth required)
app.get('/api/user/publications', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const list = await getUserPublications(userId, token);
    res.json(list);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to get publications';
    res.status(500).json({ error: msg });
  }
});

// Get publication for a project (owner only, auth required).
// Returns 200 with publication or null when project has no publication yet (normal case).
app.get('/api/projects/:projectId/publication', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const projectId = req.params.projectId;
    const pub = await getPublicationByProjectId(projectId, userId, token);
    res.json(pub);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
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

// Export app for Vercel (when imported as module)
export default app;

// Only start server if running directly (not in Vercel)
// Vercel sets VERCEL=1 environment variable
if (!process.env.VERCEL) {
  async function startServer() {
    // Supabase database is already initialized, no need for local init

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
║   💾 База данных: Supabase PostgreSQL                      ║
║   🤖 AI: ${
        config.openai.apiKey ? 'OpenAI ✅' : 'Не настроен ⚠️'
      }                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
    });
  }

  startServer().catch(console.error);
}
