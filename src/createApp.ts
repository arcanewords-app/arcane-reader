/**
 * Express application factory — builds the API app without calling listen().
 * Used by server.ts (HTTP / Vercel) and mock-integration tests (supertest).
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
import { registerDebugRoutes } from './debug/routes.js';
import { registerPromptLabRoutes } from './prompt-lab/routes.js';
import { httpCaptureMiddleware } from './debug/httpCaptureMiddleware.js';
import { createImportJobStoreFromEnv } from './services/importJobStore.js';
import { createAnalysisJobStoreFromEnv } from './services/analysisJobStore.js';
import { createTranslateJobStoreFromEnv } from './services/translateJobStore.js';
import { decodeMultipartFilename } from './api/routeHelpers.js';
import { registerAllApiRoutes } from './api/routes/index.js';
import { registerSeoRoutes } from './api/routes/seo.js';

export type CreateAppResult = {
  app: Application;
  port: number;
  config: ReturnType<typeof loadConfig>;
};

/**
 * Create a fully wired Express application (middleware, API, SEO, static).
 * Does not start listening or background health/debug subscribers.
 */
export function createApp(): CreateAppResult {
  const config = loadConfig();
  const configValidation = validateConfig(config);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app: Application = express();

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

  const uploadImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
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

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);
  app.use(requestLogging);
  app.use(httpCaptureMiddleware);

  app.use('/api', (req, res, next) => {
    void requireHealthySupabase(req, res, next).catch(next);
  });

  const distClientPath = path.join(__dirname, '../dist/client');
  const publicPath = path.join(__dirname, '../public');
  const clientPath = fs.existsSync(distClientPath) ? distClientPath : publicPath;

  app.use(express.static(clientPath));

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

  registerDebugRoutes(app);
  registerPromptLabRoutes(app);

  registerSeoRoutes(app, { clientPath, publicPath }, (seoApp) => {
    seoApp.use(serviceUnavailableErrorHandler);
  });

  return { app, port: config.port, config };
}
