/**
 * Arcane Reader - Web server for novel translation UI
 *
 * Integrated with:
 * - Supabase PostgreSQL for persistent storage
 * - OpenAI for translation
 */

import 'dotenv/config';
import type {} from './types/express.js';
import express, { type Application } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadConfig, validateConfig } from './config.js';
import { requestContext, requestLogging } from './middleware/requestContext.js';
import {
  requireHealthySupabase,
  serviceUnavailableErrorHandler,
} from './middleware/serviceHealth.js';
import { logger } from './logger.js';
import { serviceHealthManager } from './services/serviceHealth.js';
import { registerDebugRoutes } from './debug/routes.js';
import { registerPromptLabRoutes } from './prompt-lab/routes.js';
import { importBridgedLogEntry } from './debug/buffer.js';
import { importBridgedLlmCapture } from './debug/promptCapture.js';
import { importBridgedHttpExchange } from './debug/httpCapture.js';
import { hydrateDebugBuffersFromDisk } from './debug/hydrate.js';
import { httpCaptureMiddleware } from './debug/httpCaptureMiddleware.js';
import { createImportJobStoreFromEnv } from './services/importJobStore.js';
import { createAnalysisJobStoreFromEnv } from './services/analysisJobStore.js';
import { createTranslateJobStoreFromEnv } from './services/translateJobStore.js';
import { isBullAvailable } from './services/chapterQueue.js';
import { decodeMultipartFilename } from './api/routeHelpers.js';
import { registerAllApiRoutes } from './api/routes/index.js';
import { registerSeoRoutes } from './api/routes/seo.js';

export { performTranslation } from './api/chapterTranslation.js';

console.log('[arcane] API modules loaded, registering routes…');

// Load configuration
const config = loadConfig();
const configValidation = validateConfig(config);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Application = express();
const PORT = config.port;

// Storage for uploaded chapter files
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSizeBytes },
  fileFilter: (_req, file, cb) => {
    const filename = decodeMultipartFilename(file.originalname).toLowerCase();
    const allowedExtensions = ['.txt', '.epub', '.fb2', '.csv'];
    const allowedMimes = [
      'text/plain',
      'text/csv',
      'application/csv',
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
      cb(new Error('Поддерживаемые форматы: .txt, .epub, .fb2, .csv'));
    }
  },
});

// Storage for glossary import files (.json / .csv)
const uploadGlossaryFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const filename = decodeMultipartFilename(file.originalname).toLowerCase();
    const allowedExtensions = ['.json', '.csv'];
    const allowedMimes = ['application/json', 'text/json', 'text/csv', 'application/csv'];
    const hasValidExtension = allowedExtensions.some((ext) => filename.endsWith(ext));
    const hasValidMime = allowedMimes.includes(file.mimetype);
    if (hasValidExtension || hasValidMime) {
      cb(null, true);
    } else {
      cb(new Error('Supported formats: .json, .csv'));
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

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  },
});

const importJobStore = createImportJobStoreFromEnv();
const analysisJobStore = createAnalysisJobStoreFromEnv();
const translateJobStore = createTranslateJobStoreFromEnv();

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestContext);
app.use(requestLogging);
app.use(httpCaptureMiddleware);

// Circuit breaker: return 503 when shared/in-memory Supabase health is down
app.use('/api', (req, res, next) => {
  void requireHealthySupabase(req, res, next).catch(next);
});

// Serve static files - prefer dist/client if exists (production), fallback to public (legacy)
const distClientPath = path.join(__dirname, '../dist/client');
const publicPath = path.join(__dirname, '../public');
const clientPath = fs.existsSync(distClientPath) ? distClientPath : publicPath;

app.use(express.static(clientPath));
// Images and exports are now served from Supabase Storage via public URLs
// No need for local static file serving

registerAllApiRoutes(app, {
  config,
  configValidation,
  upload,
  uploadGlossaryFile,
  uploadImage,
  uploadAvatar,
  importJobStore,
  analysisJobStore,
  translateJobStore,
});

// ============ Debug log viewer (dev only) ============

registerDebugRoutes(app);
registerPromptLabRoutes(app);

registerSeoRoutes(app, { clientPath, publicPath }, (seoApp) => {
  seoApp.use(serviceUnavailableErrorHandler);
});

// ============ Start Server ============

// Export app for Vercel (when imported as module)
export default app;

async function startServer(): Promise<void> {
  console.log(`[arcane] Starting HTTP server on port ${PORT}…`);
  const httpServer = app.listen(PORT, () => {
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
║   🤖 AI: ${config.openai.apiKey ? 'OpenAI ✅' : 'Не настроен ⚠️'}                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
    logger.info(
      {
        event: 'server.started',
        port: PORT,
        hasOpenAI: !!config.openai.apiKey,
      },
      `Server listening on http://localhost:${PORT}`
    );
    const hasJobStoreRedis =
      (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
    if (isBullAvailable() && !hasJobStoreRedis) {
      logger.warn(
        'REDIS_URL is set but KV_REST_API_URL/KV_REST_API_TOKEN are not. ' +
          'Job cancellation will not work across server/worker. Set Upstash REST credentials for job stores.'
      );
    }
    serviceHealthManager.startPeriodicChecks(30_000);
    if (process.env.NODE_ENV !== 'production') {
      hydrateDebugBuffersFromDisk();
      void import('./debug/redisBridge.js').then(({ startDebugBridgeSubscriber }) =>
        startDebugBridgeSubscriber({
          onLog: importBridgedLogEntry,
          onLlm: importBridgedLlmCapture,
          onHttp: importBridgedHttpExchange,
        })
      );
    }
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n[arcane] Port ${PORT} is already in use. Stop the other process or run: npm run kill-port\n`
      );
      process.exit(1);
    }
    throw err;
  });
}

if (!process.env.VERCEL && !process.env.RUN_AS_WORKER) {
  startServer().catch((err) => logger.error({ err }, 'Server failed to start'));
}
