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
import {
  registerBodySchema,
  loginBodySchema,
  refreshBodySchema,
  profileUpdateBodySchema,
  tokenUsageQuerySchema,
  tokenUsageHistoryQuerySchema,
  reportStatusSchema,
  publicEntityCreateSchema,
  publicEntityListQuerySchema,
  publicEntityUpdateSchema,
  projectCreateBodySchema,
  projectLanguagesBodySchema,
  projectSearchQuerySchema,
  projectSettingsBodySchema,
  metadataUpdateBodySchema,
  exportDownloadQuerySchema,
  chapterIdsBodySchema,
  translateBatchBodySchema,
  chapterTranslateBodySchema,
  type LanguagePairBody,
  chapterTitleBodySchema,
  chapterNumberBodySchema,
  chapterStatusBodySchema,
  chaptersOrderBodySchema,
  paragraphBulkUpdateBodySchema,
  paragraphUpdateBodySchema,
  exportBodySchema,
  glossaryCreateBodySchema,
  glossaryUpdateBodySchema,
  glossaryMergeBodySchema,
  glossaryBulkDeleteBodySchema,
  publicationsListQuerySchema,
  reportBodySchema,
  readingPositionBodySchema,
  publishBodySchema,
  buildExportsBodySchema,
  publicationDownloadQuerySchema,
  publicationDisplaySettingsBodySchema,
} from './api/schemas/index.js';
import { loadConfig, validateConfig, hasAIProvider } from './config.js';
// Database operations from Supabase
import {
  getAllProjectsLightweight,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  importChaptersBatch,
  updateChapter,
  getChapter,
  getChaptersSummary,
  getProjectFull,
  verifyChapterAccess,
  deleteChapter,
  updateChapterNumber,
  updateChapterStatus,
  updateChaptersOrder,
  markChaptersAsTranslatedBatch,
  addGlossaryEntry,
  updateGlossaryEntry,
  getGlossaryEntry,
  deleteGlossaryEntry,
  updateParagraph,
  searchParagraphsInProject,
  bulkUpdateParagraphs,
  updateReaderSettings,
  getReaderSettings,
  resetStuckChapters,
  resetStuckChaptersForRecovery,
  getChapterStatusRow,
  listPublicationsPublic,
  getPublicationBySlugOrId,
  getPublicationWithChapters,
  getPublicationChapterContent,
  getGlossaryForPublication,
  createOrUpdatePublication,
  unpublishProject,
  updatePublicationExportPaths,
  updatePublicationDisplaySettings,
  getUserPublications,
  getPublicationByProjectId,
  getProjectForPublicationExport,
  markChapterAsRead,
  getReadProgress,
  updateReadingPosition,
  getUserReaderSettings,
  updateUserReaderSettings,
  getUserReadingHistory,
  createTranslationReport,
  getTranslationReportsCountByProject,
  getTranslationReportsByProject,
  updateTranslationReportStatus,
  deleteTranslationReport,
  createPublicEntity,
  updatePublicEntity,
  deletePublicEntity,
  countPublicationsUsingEntity,
  listPublicEntities,
  getPublicEntityById,
  type MarkTranslatedBatchResult,
  deleteGlossaryEntriesBulk,
} from './services/supabaseDatabase.js';
// Types and utilities from database.ts (still used for compatibility)
import {
  getChapterStats,
  mergeParagraphsToText,
  type Chapter,
  type GlossaryEntry,
  type Project,
  type ProjectWithChapterList,
  type Paragraph,
  type PublicEntityKind,
} from './storage/database.js';
import { requireAuth, optionalAuth, requireRole } from './middleware/auth.js';
import { requestContext, requestLogging } from './middleware/requestContext.js';
import { respondRouteError } from './middleware/routeDebugError.js';
import {
  handleServiceError,
  requireHealthySupabase,
  serviceUnavailableErrorHandler,
} from './middleware/serviceHealth.js';
import { logger, getLoggingStatus } from './logger.js';
import { serviceHealthManager } from './services/serviceHealth.js';
import { isChunkError } from './shared/chunkErrors.js';
import { registerDebugRoutes } from './debug/routes.js';
import { startDebugLogSubscriber } from './debug/redisBridge.js';
import { addDebugLogEntry } from './debug/buffer.js';
import { createTraceId, runWithDebugContextAsync } from './debug/context.js';
import { httpCaptureMiddleware, setDebugTraceId } from './debug/httpCaptureMiddleware.js';

console.log('[arcane] API modules loaded, registering routes…');

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape string for use in HTML meta content attribute (quotes, ampersands) */
function escapeMetaContent(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Absolute site origin; respects X-Forwarded-* behind Vercel/reverse proxies. */
function getPublicBaseUrl(req: express.Request): string {
  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol || 'https';
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host') || 'localhost';
  return `${proto}://${host}`;
}

/**
 * Inject publication-specific meta tags into index.html for SEO (Open Graph, Twitter Card).
 * Used for /p/:id and /p/:id/chapters/:cid/reading routes so crawlers get correct previews.
 */
function injectPublicationMeta(
  html: string,
  opts: {
    title: string;
    description: string;
    imageUrl: string | null;
    pageUrl: string;
    isChapter?: boolean;
  }
): string {
  const t = escapeMetaContent(opts.title);
  const d = escapeMetaContent(opts.description);
  const origin = opts.pageUrl.startsWith('http') ? new URL(opts.pageUrl).origin : '';
  const img =
    opts.imageUrl && opts.imageUrl.startsWith('http') ? opts.imageUrl : `${origin}/arcane_icon.png`;
  const url = escapeMetaContent(opts.pageUrl);
  const titleSuffix = opts.isChapter ? ' — Arcane' : ' — читать онлайн | Arcane';

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}${titleSuffix}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" *\/?>/,
      `<meta name="description" content="${d}" />`
    )
    .replace(
      /<meta property="og:title" content="[^"]*" *\/?>/,
      `<meta property="og:title" content="${t}" />`
    )
    .replace(
      /<meta property="og:description" content="[^"]*" *\/?>/,
      `<meta property="og:description" content="${d}" />`
    )
    .replace(
      /<meta property="og:image" content="[^"]*" *\/?>/,
      `<meta property="og:image" content="${img}" />`
    );
  if (!out.includes('og:url')) {
    out = out.replace(
      /<meta property="og:type" content="[^"]*" *\/?>/,
      `<meta property="og:url" content="${url}" />\n    <meta property="og:type" content="website" />`
    );
  } else {
    out = out.replace(
      /<meta property="og:url" content="[^"]*" *\/?>/,
      `<meta property="og:url" content="${url}" />`
    );
  }
  out = out
    .replace(
      /<meta name="twitter:title" content="[^"]*" *\/?>/,
      `<meta name="twitter:title" content="${t}" />`
    )
    .replace(
      /<meta name="twitter:description" content="[^"]*" *\/?>/,
      `<meta name="twitter:description" content="${d}" />`
    );

  const canonicalTag = `<link rel="canonical" href="${url}" />`;
  if (out.includes('rel="canonical"')) {
    out = out.replace(/<link rel="canonical" href="[^"]*" *\/?>/i, canonicalTag);
  } else {
    out = out.replace('</head>', `    ${canonicalTag}\n  </head>`);
  }
  return out;
}

/** Static page SEO meta (title, description). Russian default to match index.html. */
const STATIC_PAGE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Arcane — Переводчик новелл',
    description:
      'Arcane — библиотека переводов новелл на русский и беларусский. Читайте и скачивайте переводы онлайн. Переводчик с AI и глоссарием. Импорт EPUB, FB2, TXT.',
  },
  '/catalog': {
    title: 'Каталог переводов — Arcane',
    description:
      'Каталог переводов новелл. Опубликованные переводы от авторов. Читайте онлайн или скачивайте EPUB, FB2.',
  },
  '/about': {
    title: 'О проекте Arcane',
    description:
      'Arcane — веб-интерфейс для перевода новелл с AI и глоссария. Источники: en, ko, zh, ru (→ be). Цели: русский и беларусский. Импорт EPUB, FB2, TXT, CSV.',
  },
  '/contact': {
    title: 'Контакты',
    description:
      'По вопросам, предложениям и сотрудничеству с Arcane — библиотекой переводов новелл.',
  },
  '/privacy': {
    title: 'Политика конфиденциальности',
    description:
      'Политика конфиденциальности Arcane. Какие данные собираем, цели обработки, права пользователей (GDPR).',
  },
  '/terms': {
    title: 'Условия использования',
    description:
      'Условия использования Arcane. Правила для читателей и авторов-переводчиков, ответственность за контент.',
  },
  '/account-tiers': {
    title: 'Уровни аккаунта — Arcane',
    description:
      'Сравнение уровней аккаунта Arcane: читатель и автор. Лимиты AI-токенов, проекты перевода, глоссарий, публикация.',
  },
};

/**
 * Inject static page meta (title, description, og:*, canonical) into index.html.
 * For / and /catalog: canonical points to / (avoid duplicate content).
 */
function injectStaticPageMeta(
  html: string,
  opts: {
    title: string;
    description: string;
    pageUrl: string;
    canonicalUrl?: string;
  }
): string {
  const t = escapeMetaContent(opts.title);
  const d = escapeMetaContent(opts.description);
  const origin = opts.pageUrl.startsWith('http') ? new URL(opts.pageUrl).origin : '';
  const img = `${origin}/arcane_icon.png`;
  const url = escapeMetaContent(opts.pageUrl);
  const canonicalUrl = opts.canonicalUrl ? escapeMetaContent(opts.canonicalUrl) : url;
  const titleSuffix = ' | Arcane';

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}${titleSuffix}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" *\/?>/,
      `<meta name="description" content="${d}" />`
    )
    .replace(
      /<meta property="og:title" content="[^"]*" *\/?>/,
      `<meta property="og:title" content="${t}" />`
    )
    .replace(
      /<meta property="og:description" content="[^"]*" *\/?>/,
      `<meta property="og:description" content="${d}" />`
    )
    .replace(
      /<meta property="og:image" content="[^"]*" *\/?>/,
      `<meta property="og:image" content="${img}" />`
    );
  if (!out.includes('og:url')) {
    out = out.replace(
      /<meta property="og:type" content="[^"]*" *\/?>/,
      `<meta property="og:url" content="${url}" />\n    <meta property="og:type" content="website" />`
    );
  } else {
    out = out.replace(
      /<meta property="og:url" content="[^"]*" *\/?>/,
      `<meta property="og:url" content="${url}" />`
    );
  }
  out = out
    .replace(
      /<meta name="twitter:title" content="[^"]*" *\/?>/,
      `<meta name="twitter:title" content="${t}" />`
    )
    .replace(
      /<meta name="twitter:description" content="[^"]*" *\/?>/,
      `<meta name="twitter:description" content="${d}" />`
    );

  const canonicalTag = `<link rel="canonical" href="${canonicalUrl}" />`;
  if (out.includes('rel="canonical"')) {
    out = out.replace(/<link rel="canonical" href="[^"]*" *\/?>/i, canonicalTag);
  } else {
    out = out.replace('</head>', `    ${canonicalTag}\n  </head>`);
  }
  return out;
}

/** Inject Organization + WebSite JSON-LD for homepage. */
function injectOrganizationJsonLd(html: string, baseUrl: string): string {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Arcane',
    url: baseUrl,
    description: 'Arcane — библиотека переводов новелл. Переводчик с AI и глоссарием. EPUB, FB2.',
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Arcane',
    url: baseUrl,
    description:
      'Библиотека переводов новелл. Читайте и скачивайте переводы онлайн. Переводчик с AI.',
  };
  const jsonLd =
    `<script type="application/ld+json">${JSON.stringify(org)}</script>\n    ` +
    `<script type="application/ld+json">${JSON.stringify(website)}</script>`;
  return html.replace('</head>', `    ${jsonLd}\n  </head>`);
}

/**
 * Serve index.html with page-specific meta for static routes.
 */
function serveStaticPageHtml(req: express.Request, res: express.Response, pathname: string): void {
  const base = getPublicBaseUrl(req);
  const pageUrl = base + pathname;
  const meta = STATIC_PAGE_META[pathname];
  if (!meta) {
    const indexPath = fs.existsSync(path.join(clientPath, 'index.html'))
      ? path.join(clientPath, 'index.html')
      : path.join(publicPath, 'index.html');
    res.sendFile(indexPath);
    return;
  }
  const canonicalUrl = pathname === '/catalog' ? base + '/' : pageUrl;
  const indexPath = fs.existsSync(path.join(clientPath, 'index.html'))
    ? path.join(clientPath, 'index.html')
    : path.join(publicPath, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf-8');
  html = html.replace(/__PUBLIC_URL__/g, base);
  html = injectStaticPageMeta(html, {
    title: meta.title,
    description: meta.description,
    pageUrl,
    canonicalUrl,
  });
  if (pathname === '/' || pathname === '/catalog') {
    html = injectOrganizationJsonLd(html, base + '/');
  }
  res.type('html').send(html);
}

/**
 * Inject visible content into #app for crawlers (SPA renders empty HTML otherwise).
 * H1, description, author, links "Читать онлайн" and "Скачать" so bots see intent.
 */
function injectPublicationContent(
  html: string,
  opts: {
    title: string;
    description: string;
    authorDisplay: string | null;
    translatorDisplay: string | null;
    pageUrl: string;
    publicationUrl: string;
    hasExport: boolean;
  }
): string {
  const title = escapeHtml(opts.title);
  const desc = escapeHtml(
    opts.description.length > 400 ? opts.description.slice(0, 397) + '...' : opts.description
  );
  const author = opts.authorDisplay ? escapeHtml(opts.authorDisplay) : '';
  const translator = opts.translatorDisplay ? escapeHtml(opts.translatorDisplay) : '';
  const metaParts: string[] = [];
  if (author) metaParts.push(`Автор: ${author}`);
  if (translator) metaParts.push(`Переводчик: ${translator}`);
  const metaLine =
    metaParts.length > 0 ? `<p class="publication-page-seo-meta">${metaParts.join(' · ')}</p>` : '';

  const readLink = `<a href="${escapeHtml(opts.publicationUrl)}">Читать онлайн</a>`;
  const downloadLink = opts.hasExport
    ? `<a href="${escapeHtml(opts.publicationUrl)}#download">Скачать EPUB, FB2</a>`
    : '';
  const actionLinks = opts.hasExport ? `${readLink} · ${downloadLink}` : readLink;

  const content = `<main class="publication-page-seo" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
    <h1>${title}</h1>
    <p class="publication-page-seo-desc">${desc}</p>
    ${metaLine}
    <p class="publication-page-seo-actions">${actionLinks}</p>
  </main>`;

  return html.replace(/<div id="app">\s*<\/div>/, `<div id="app">${content}</div>`);
}

/**
 * Inject JSON-LD Book schema for publication pages (schema.org).
 */
function injectPublicationJsonLd(
  html: string,
  opts: {
    title: string;
    description: string;
    url: string;
    imageUrl: string | null;
    authorDisplay: string | null;
    translatorDisplay: string | null;
    targetLanguage: string;
    numberOfPages?: number;
  }
): string {
  const base = opts.url.startsWith('http') ? new URL(opts.url).origin : '';
  const img =
    opts.imageUrl && opts.imageUrl.startsWith('http')
      ? opts.imageUrl
      : opts.imageUrl
        ? `${base}${opts.imageUrl.startsWith('/') ? '' : '/'}${opts.imageUrl}`
        : base
          ? `${base}/arcane_icon.png`
          : '/arcane_icon.png';

  const book: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: opts.title,
    description: opts.description,
    url: opts.url,
    image: img,
    inLanguage: opts.targetLanguage,
  };
  if (opts.authorDisplay) {
    (book as Record<string, unknown>).author = { '@type': 'Person', name: opts.authorDisplay };
  }
  if (opts.translatorDisplay) {
    (book as Record<string, unknown>).translator = {
      '@type': 'Person',
      name: opts.translatorDisplay,
    };
  }
  if (opts.numberOfPages != null && opts.numberOfPages > 0) {
    (book as Record<string, unknown>).numberOfPages = opts.numberOfPages;
  }

  const jsonLd = `<script type="application/ld+json">${JSON.stringify(book)}</script>`;
  return html.replace('</head>', `    ${jsonLd}\n  </head>`);
}

/**
 * Inject BreadcrumbList JSON-LD for publication pages.
 */
function injectBreadcrumbJsonLd(
  html: string,
  opts: {
    baseUrl: string;
    catalogUrl: string;
    publicationName: string;
    publicationUrl: string;
    chapterName?: string;
    chapterUrl?: string;
  }
): string {
  const items: Array<{
    '@type': string;
    position: number;
    name: string;
    item: string;
  }> = [
    { '@type': 'ListItem', position: 1, name: 'Каталог', item: opts.catalogUrl },
    {
      '@type': 'ListItem',
      position: 2,
      name: opts.publicationName,
      item: opts.publicationUrl,
    },
  ];
  if (opts.chapterName && opts.chapterUrl) {
    items.push({
      '@type': 'ListItem',
      position: 3,
      name: opts.chapterName,
      item: opts.chapterUrl,
    });
  }
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;
  return html.replace('</head>', `    ${jsonLd}\n  </head>`);
}

import { requireToken } from './utils/requestHelpers.js';
import {
  getUserTokenUsage,
  checkTokenLimit,
  incrementTokenUsage,
  reserveTokens,
  releaseTokens,
  getTokenUsageHistory,
} from './middleware/tokenLimits.js';
import {
  estimateTokensForStages,
  estimateTokensForChapterTitles,
  type TranslationStages,
} from './config/tokenLimits.js';
import {
  translateChapterWithPipeline,
  analyzeChaptersBatch,
  getNameDeclensions,
  clearAgentCache,
  resolveEffectiveLanguagePair,
  type LanguagePairOverride,
} from './services/engine-integration.js';
import {
  applyChapterTitleTranslations,
  collectTitleTranslationCandidates,
} from './services/chapterTitleTranslate.js';
import { invalidateAnalysisForProject } from './services/analysisCache.js';
import { isProjectLanguagePairLocked } from './services/projectLanguagePair.js';
import {
  suggestGlossaryMerges,
  type MergeSuggestion,
} from './services/glossaryMergeSuggestions.js';
import { exportProject } from './services/export/index.js';
import { authService } from './services/authService.js';
import {
  parseFile,
  parseEpubLazy,
  isSupportedFormat,
  getProjectTypeFromFormat,
} from './services/import/index.js';
import type { ParseResult } from './services/import/index.js';
import { createImportJobStoreFromEnv, type ImportJobState } from './services/importJobStore.js';
import {
  createAnalysisJobStoreFromEnv,
  type AnalysisJobState,
  type AnalysisJobChapter,
} from './services/analysisJobStore.js';
import {
  createTranslateJobStoreFromEnv,
  type TranslateJobState,
  type TranslateJobChapter,
} from './services/translateJobStore.js';
import {
  addAnalysisJob,
  addTranslateJob,
  getChapterTranslateQueue,
  isBullAvailable,
} from './services/chapterQueue.js';
import {
  uploadFile,
  deleteFile,
  deleteFiles,
  extractPathFromUrl,
  generateUniqueFilename,
  downloadFile,
  createSignedUrl,
  listFiles,
} from './services/storage.js';
import {
  CACHE_PREFIX,
  CACHE_SCHEMA_VERSION,
  CACHE_TTL,
  cacheVersionedKey,
} from './shared/cacheContract.js';
import {
  buildRedisKey,
  redisDelMany,
  redisDelByPattern,
  redisGetJson,
  redisSetJson,
} from './services/redisCache.js';

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

// In-memory store for translation chunk progress (chunksDone/totalChunks) during translation
const translationProgressStore = new Map<
  string,
  { chunksDone: number; totalChunks: number; stage?: string }
>();
function translationProgressKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}
function setTranslationProgress(
  projectId: string,
  chapterId: string,
  progress: { chunksDone: number; totalChunks: number; stage?: string }
): void {
  translationProgressStore.set(translationProgressKey(projectId, chapterId), progress);
}
function getTranslationProgress(
  projectId: string,
  chapterId: string
): { chunksDone: number; totalChunks: number; stage?: string } | undefined {
  return translationProgressStore.get(translationProgressKey(projectId, chapterId));
}
function clearTranslationProgress(projectId: string, chapterId: string): void {
  translationProgressStore.delete(translationProgressKey(projectId, chapterId));
}

const SERVER_START_TIME_MS = Date.now();

const IMPORT_JOB_FORMATS = new Set(['epub', 'fb2', 'csv']);
const IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT = 200;
const IMPORT_JOB_TTL_SECONDS = parseInt(process.env.IMPORT_JOB_TTL_SECONDS ?? '1800', 10);
const IMPORT_JOB_PROGRESS_UPDATE_EVERY = 5;
const IMPORT_JOB_PROGRESS_UPDATE_MAX_STALENESS_MS = 1500;
const IMPORT_CHAPTER_BATCH_SIZE = Math.max(
  1,
  Math.min(100, parseInt(process.env.IMPORT_CHAPTER_BATCH_SIZE ?? '20', 10) || 20)
);
const MARK_TRANSLATED_BATCH_CHUNK_SIZE = Math.max(
  1,
  Math.min(200, parseInt(process.env.MARK_TRANSLATED_BATCH_CHUNK_SIZE ?? '200', 10) || 200)
);
const importJobStore = createImportJobStoreFromEnv();
const analysisJobStore = createAnalysisJobStoreFromEnv();
const translateJobStore = createTranslateJobStoreFromEnv();
const ANALYSIS_JOB_TTL_SECONDS = parseInt(process.env.ANALYSIS_JOB_TTL_SECONDS ?? '3600', 10);
const TRANSLATE_JOB_TTL_SECONDS = parseInt(process.env.TRANSLATE_JOB_TTL_SECONDS ?? '7200', 10);
let healthSnapshot: {
  ts: number;
  data: ReturnType<typeof serviceHealthManager.getHealthResult>;
} | null = null;
let healthCheckInProgress: Promise<void> | null = null;

async function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await redisGetJson<T>(key);
  if (cached != null) return cached;
  const value = await loader();
  await redisSetJson(key, value, ttlSeconds);
  return value;
}

function userProjectsCacheKey(userId: string): string {
  return buildRedisKey(CACHE_PREFIX.userProjects, userId);
}

function userProjectCacheKey(userId: string, projectId: string): string {
  return buildRedisKey(CACHE_PREFIX.userProject, userId, projectId);
}

function publicationsListCacheKey(options: {
  limit: number;
  offset: number;
  orderBy: string;
  orderAsc: boolean;
  authorEntityId?: string;
  translatorEntityId?: string;
  tagEntityId?: string;
}): string {
  return buildRedisKey(
    CACHE_PREFIX.publicationsList,
    options.limit,
    options.offset,
    options.orderBy,
    options.orderAsc,
    options.authorEntityId ?? '',
    options.translatorEntityId ?? '',
    options.tagEntityId ?? ''
  );
}

function publicationCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publication, id);
}

function publicationChaptersCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publicationChapters, id);
}

function publicationChapterCacheKey(publicationId: string, chapterId: string): string {
  return buildRedisKey(CACHE_PREFIX.publicationChapter, publicationId, chapterId);
}

function publicationGlossaryCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publicationGlossary, id);
}

function publicEntitiesCacheKey(kind?: PublicEntityKind): string {
  return buildRedisKey(CACHE_PREFIX.publicEntities, kind ?? 'all');
}

function publicEntityCacheKey(id: string): string {
  return buildRedisKey(CACHE_PREFIX.publicEntity, id);
}

function tokenUsageCacheKey(userId: string, date: string): string {
  return buildRedisKey(CACHE_PREFIX.userTokenUsage, userId, date);
}

function tokenUsageHistoryCacheKey(userId: string, days: number): string {
  return buildRedisKey(CACHE_PREFIX.userTokenHistory, userId, days);
}

function readingHistoryCacheKey(userId: string): string {
  return buildRedisKey(CACHE_PREFIX.userReadingHistory, userId);
}

function projectReportsCountCacheKey(projectId: string): string {
  return buildRedisKey(CACHE_PREFIX.projectReportsCount, projectId);
}

function invalidateUserProjectCaches(userId: string, projectId?: string): Promise<void> {
  const keys = [userProjectsCacheKey(userId)];
  if (projectId) {
    keys.push(userProjectCacheKey(userId, projectId));
  }
  return redisDelMany(keys);
}

async function invalidatePublicationCaches(
  identifier: string,
  pubIdForChapters?: string
): Promise<void> {
  const keys = [
    publicationCacheKey(identifier),
    publicationChaptersCacheKey(identifier),
    publicationGlossaryCacheKey(identifier),
  ];
  await redisDelMany(keys);
  if (pubIdForChapters) {
    const pattern = cacheVersionedKey([CACHE_PREFIX.publicationChapter, pubIdForChapters, '*']);
    await redisDelByPattern(pattern);
  }
}

async function invalidatePublicationListCaches(): Promise<void> {
  const pattern = `${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.publicationsList}:*`;
  await redisDelByPattern(pattern);
}

function invalidatePublicEntitiesCaches(entityId?: string): Promise<void> {
  const keys = [
    publicEntitiesCacheKey(),
    publicEntitiesCacheKey('tag'),
    publicEntitiesCacheKey('author'),
    publicEntitiesCacheKey('translator'),
  ];
  if (entityId) {
    keys.push(publicEntityCacheKey(entityId));
  }
  return redisDelMany(keys);
}

async function invalidateProjectAndRelatedCaches(
  userId: string,
  projectId: string,
  token: string,
  options?: { invalidatePublicationList?: boolean; useServiceRole?: boolean }
): Promise<void> {
  await invalidateUserProjectCaches(userId, projectId);
  try {
    const publication = await getPublicationByProjectId(projectId, userId, token, {
      useServiceRole: options?.useServiceRole,
    });
    if (!publication) return;
    await invalidatePublicationCaches(publication.id, publication.id);
    if (publication.slug) {
      await invalidatePublicationCaches(publication.slug);
    }
    if (options?.invalidatePublicationList) {
      await invalidatePublicationListCaches();
    }
  } catch (error) {
    logger.warn(
      { err: error, userId, projectId },
      'Failed to invalidate publication-related cache'
    );
  }
}

function generateImportJobId(): string {
  return `imp_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

function toPublicImportJob(
  job: ImportJobState,
  options?: { compact?: boolean }
): Omit<ImportJobState, 'projectId' | 'userId' | 'cancelRequested'> & {
  progress: number;
} {
  const compact = options?.compact === true;
  return {
    jobId: job.jobId,
    status: job.status,
    phase: job.phase,
    format: job.format,
    filename: job.filename,
    current: job.current,
    total: job.total,
    progress: job.total > 0 ? Number(((job.current / job.total) * 100).toFixed(1)) : 0,
    currentChapterTitle: job.currentChapterTitle,
    warnings: job.warnings,
    errors: job.errors,
    chapters: compact ? [] : job.chapters,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

function generateAnalysisJobId(): string {
  return `ana_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

function generateTranslateJobId(): string {
  return `trl_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

function isLanguagePairOverride(
  project: Project | ProjectWithChapterList,
  override?: LanguagePairBody
): override is LanguagePairBody {
  if (!override) return false;
  return (
    (project.sourceLanguage || 'en') !== override.sourceLanguage ||
    (project.targetLanguage || 'ru') !== override.targetLanguage
  );
}

function effectiveJobLanguageFields(
  project: Project | ProjectWithChapterList,
  override?: LanguagePairBody
): { sourceLanguage: string; targetLanguage: string } {
  const { sourceLanguage, targetLanguage } = resolveEffectiveLanguagePair(project, override);
  return { sourceLanguage, targetLanguage };
}

function warnLanguageOverrideWithGlossary(
  req: express.Request,
  project: Project | ProjectWithChapterList,
  override?: LanguagePairBody
): void {
  if (!isLanguagePairOverride(project, override)) return;
  if (project.glossary.length === 0) return;
  req.log?.warn(
    {
      event: 'translation.language_override_with_glossary',
      projectId: project.id,
      override,
      projectSource: project.sourceLanguage,
      projectTarget: project.targetLanguage,
    },
    'Language pair override with existing glossary'
  );
}

function toPublicTranslateJob(
  job: TranslateJobState,
  options?: { compact?: boolean }
): Omit<TranslateJobState, 'projectId' | 'userId' | 'cancelRequested'> & {
  progress: number;
} {
  const compact = options?.compact === true;
  return {
    jobId: job.jobId,
    status: job.status,
    current: job.current,
    total: job.total,
    progress: job.total > 0 ? Number(((job.current / job.total) * 100).toFixed(1)) : 0,
    currentChapterTitle: job.currentChapterTitle,
    currentChapterChunksDone: job.currentChapterChunksDone,
    currentChapterTotalChunks: job.currentChapterTotalChunks,
    chapters: compact ? [] : job.chapters,
    totalTokensUsed: job.totalTokensUsed,
    errors: job.errors,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    sourceLanguage: job.sourceLanguage,
    targetLanguage: job.targetLanguage,
  };
}

function toPublicAnalysisJob(
  job: AnalysisJobState,
  options?: { compact?: boolean }
): Omit<AnalysisJobState, 'projectId' | 'userId' | 'cancelRequested'> & {
  progress: number;
} {
  const compact = options?.compact === true;
  return {
    jobId: job.jobId,
    status: job.status,
    current: job.current,
    total: job.total,
    progress: job.total > 0 ? Number(((job.current / job.total) * 100).toFixed(1)) : 0,
    currentChapterTitle: job.currentChapterTitle,
    chapters: compact ? [] : job.chapters,
    totalTokensUsed: job.totalTokensUsed,
    errors: job.errors,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    sourceLanguage: job.sourceLanguage,
    targetLanguage: job.targetLanguage,
  };
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestContext);
app.use(requestLogging);
app.use(httpCaptureMiddleware);

// Circuit breaker: return 503 immediately when Supabase is down (avoids hanging DB calls)
app.use('/api', requireHealthySupabase);

// Serve static files - prefer dist/client if exists (production), fallback to public (legacy)
const distClientPath = path.join(__dirname, '../dist/client');
const publicPath = path.join(__dirname, '../public');
const clientPath = fs.existsSync(distClientPath) ? distClientPath : publicPath;

app.use(express.static(clientPath));
// Images and exports are now served from Supabase Storage via public URLs
// No need for local static file serving

// ============ API Routes ============

// ============ Auth Routes ============

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const parsed = registerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { email, password } = parsed.data;
    const user = await authService.register(email, password);
    res.json({ user });
  } catch (error) {
    respondRouteError(req, res, error, {
      event: 'auth.register.failed',
      fallbackMessage: 'Registration failed',
      statusCode: 400,
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { email, password } = parsed.data;
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
    respondRouteError(req, res, error, {
      event: 'auth.login.failed',
      fallbackMessage: 'Login failed',
      statusCode: 401,
    });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    await authService.logout();
    res.json({ success: true });
  } catch (error) {
    respondRouteError(req, res, error, {
      event: 'auth.logout.failed',
      fallbackMessage: 'Logout failed',
      statusCode: 500,
    });
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
    respondRouteError(req, res, error, {
      event: 'auth.me.failed',
      fallbackMessage: 'Failed to get user',
      statusCode: 500,
    });
  }
});

// Refresh session (exchange refresh_token for new access_token)
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const parsed = refreshBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { refresh_token: refreshToken } = parsed.data;
    const session = await authService.refreshSession(refreshToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    res.json({ session });
  } catch (error) {
    respondRouteError(req, res, error, {
      event: 'auth.refresh.failed',
      fallbackMessage: 'Refresh failed',
      statusCode: 500,
    });
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
    maxFileSizeBytes: config.upload.maxFileSizeBytes,
    logging: getLoggingStatus(),
  });
});

// Service health (public, no auth) - runtime connectivity to external services.
// Uses a simple projects select(id) query; actual API handlers (e.g. GET /api/projects)
// do many more queries (chapters, glossary, etc.) and may fail independently.
// Returns cached result immediately; refreshes in background when stale (non-blocking).
app.get('/api/health', async (_req, res) => {
  try {
    const now = Date.now();
    const isStale = !healthSnapshot || now - healthSnapshot.ts > CACHE_TTL.healthSnapshotMs;

    if (isStale) {
      const lastStatus = healthSnapshot?.data?.status ?? serviceHealthManager.getOverallStatus();
      const skipBackgroundCheck = lastStatus === 'down';

      if (!skipBackgroundCheck && !healthCheckInProgress) {
        healthCheckInProgress = serviceHealthManager
          .checkAll()
          .then(() => {
            healthSnapshot = {
              ts: Date.now(),
              data: serviceHealthManager.getHealthResult(),
            };
          })
          .catch((err) => {
            logger.error({ err }, 'Health check background refresh failed');
            healthSnapshot = {
              ts: Date.now(),
              data: serviceHealthManager.getHealthResult(),
            };
          })
          .finally(() => {
            healthCheckInProgress = null;
          });
      }
    }

    const result = healthSnapshot ? healthSnapshot.data : serviceHealthManager.getHealthResult();
    const statusCode = result.status === 'down' ? 503 : 200;
    res.status(statusCode).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Health check failed';
    logger.error({ err: error }, 'Health check error');
    res.status(503).json({
      status: 'down',
      services: {},
      timestamp: new Date().toISOString(),
      error: errorMessage,
    });
  }
});

// ============ Token Usage ============

// Get current token usage (requires auth)
app.get('/api/user/token-usage', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = req.user;

    const queryResult = tokenUsageQuerySchema.safeParse(req.query);
    const date =
      queryResult.success && queryResult.data.date
        ? queryResult.data.date
        : new Date().toISOString().split('T')[0];
    const usage = await withRedisCache(
      tokenUsageCacheKey(user.id, date),
      CACHE_TTL.redisTokenUsageSec,
      () => getUserTokenUsage(user.id, requireToken(req), date, user.role)
    );
    res.json(usage);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const errorMessage = error instanceof Error ? error.message : 'Failed to get token usage';
    req.log?.error({ err: error }, 'Error getting token usage');
    res.status(500).json({ error: errorMessage });
  }
});

// Get token usage history (requires auth)
app.get('/api/user/token-usage/history', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = req.user;

    const queryResult = tokenUsageHistoryQuerySchema.safeParse(req.query);
    const days = queryResult.success && queryResult.data.days ? queryResult.data.days : 7;
    const history = await withRedisCache(
      tokenUsageHistoryCacheKey(user.id, days),
      CACHE_TTL.redisTokenHistorySec,
      () => getTokenUsageHistory(user.id, requireToken(req), days, user.role)
    );
    res.json({ history });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to get token usage history';
    req.log?.error({ err: error }, 'Error getting token usage history');
    res.status(500).json({ error: errorMessage });
  }
});

// Get reading history (publications user has read, with progress)
app.get('/api/user/reading-history', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = req.user;

    const items = await withRedisCache(
      readingHistoryCacheKey(user.id),
      CACHE_TTL.redisTokenHistorySec,
      () => getUserReadingHistory(user.id, requireToken(req))
    );
    res.json({ items });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const errorMessage = error instanceof Error ? error.message : 'Failed to get reading history';
    req.log?.error({ err: error }, 'Error getting reading history');
    res.status(500).json({ error: errorMessage });
  }
});

// Get user profile (id, email, role, avatar_url)
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      avatarUrl: req.user.avatarUrl ?? null,
    });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const errorMessage = error instanceof Error ? error.message : 'Failed to get profile';
    req.log?.error({ err: error }, 'Error getting profile');
    res.status(500).json({ error: errorMessage });
  }
});

// Update user profile (avatar_url only)
app.put('/api/user/profile', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const parsed = profileUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { avatarUrl } = parsed.data;
    const { createClientWithToken } = await import('./services/supabaseClient.js');
    const client = createClientWithToken(requireToken(req));
    const { data, error } = await client
      .from('profiles')
      .update({ avatar_url: avatarUrl === '' ? null : avatarUrl })
      .eq('id', req.user.id)
      .select('avatar_url')
      .single();
    if (error) {
      req.log?.error({ err: error }, 'Failed to update profile');
      return res.status(500).json({ error: 'Failed to update profile' });
    }
    await redisDelMany([buildRedisKey(CACHE_PREFIX.authProfile, req.user.id)]);
    res.json({ avatarUrl: data?.avatar_url ?? null });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
    req.log?.error({ err: error }, 'Error updating profile');
    res.status(500).json({ error: errorMessage });
  }
});

// Upload avatar (multipart, updates profile avatar_url)
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  },
});

app.post(
  '/api/user/profile/avatar',
  requireAuth,
  uploadAvatar.single('avatar'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const ext =
        req.file.mimetype === 'image/png'
          ? 'png'
          : req.file.mimetype === 'image/gif'
            ? 'gif'
            : req.file.mimetype === 'image/webp'
              ? 'webp'
              : 'jpg';
      const storagePath = `${req.user.id}/avatar.${ext}`;
      const { publicUrl } = await uploadFile('avatars', storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      const { createClientWithToken } = await import('./services/supabaseClient.js');
      const client = createClientWithToken(requireToken(req));
      const { data, error } = await client
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', req.user.id)
        .select('avatar_url')
        .single();
      if (error) {
        req.log?.error({ err: error }, 'Failed to update profile');
        return res.status(500).json({ error: 'Failed to update profile' });
      }
      await redisDelMany([buildRedisKey(CACHE_PREFIX.authProfile, req.user.id)]);
      res.json({ avatarUrl: data?.avatar_url ?? null });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload avatar';
      req.log?.error({ err: error }, 'Error uploading avatar');
      res.status(500).json({ error: errorMessage });
    }
  }
);

// ============ Projects ============

// Get all projects (requires auth)
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
      projectList = await withRedisCache(
        userProjectsCacheKey(user.id),
        CACHE_TTL.redisProjectListSec,
        () => getAllProjectsLightweight(user.id, token)
      );
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

// Create new project (requires auth)
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
    const { name, sourceLanguage, targetLanguage } = parsed.data;
    const token = requireToken(req);
    const project = await createProject(
      { name, sourceLanguage, targetLanguage },
      req.user.id,
      token
    );
    await invalidateUserProjectCaches(req.user.id);
    res.json(project);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get project by ID (requires auth)
app.get('/api/projects/:id', requireAuth, requireRole('author'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = req.user;

    const token = requireToken(req);
    const project = await withRedisCache(
      userProjectCacheKey(user.id, req.params.id),
      CACHE_TTL.redisProjectSec,
      () => getProject(req.params.id, user.id, token)
    );
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

// Get chapters summary (for ProcessChapters - lightweight)
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
      const summary = await getChaptersSummary(req.params.id, user.id, token);
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
    const projectId = req.params.id;
    const queryResult = projectSearchQuerySchema.safeParse(req.query);
    const { q, field } = queryResult.success
      ? queryResult.data
      : { q: '', field: 'translated' as const };

    const token = requireToken(req);
    const project = await getProject(projectId, req.user.id, token);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const matches = await searchParagraphsInProject(projectId, q, field, token);
    res.json({ matches });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to search project' });
  }
});

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
      const projectId = req.params.id;
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

// Delete project (requires auth)
app.delete('/api/projects/:id', requireAuth, requireRole('author'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const success = await deleteProject(req.params.id, req.user.id, requireToken(req));
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    await invalidateUserProjectCaches(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Update project settings (requires auth)
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
      includeGlossaryInAnalysis,
      includeGlossaryInTranslation,
      includeGlossaryInEditing,
      textBlockTypes,
      customInstructions,
      editingStylePreset,
      editingFocus,
      allowReasoningModelsForAnalysis,
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

    if (textBlockTypes !== undefined) {
      updatedSettings.textBlockTypes = textBlockTypes as typeof project.settings.textBlockTypes;
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

    await updateProject(req.params.id, { settings: updatedSettings }, req.user.id, token);
    await invalidateUserProjectCaches(req.user.id, req.params.id);

    // Get updated project to return fresh settings
    const updatedProject = await getProject(req.params.id, req.user.id, token);
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

// Update project translation language pair (requires auth)
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
    const project = await getProject(req.params.id, req.user.id, token);
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
      req.params.id,
      { sourceLanguage, targetLanguage },
      req.user.id,
      token
    );
    if (!updatedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    clearAgentCache(req.params.id);
    await invalidateAnalysisForProject(req.params.id);
    await invalidateUserProjectCaches(req.user.id, req.params.id);

    req.log?.info(
      {
        event: 'project.languages.updated',
        projectId: req.params.id,
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

// Get reader settings (requires auth)
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
      const project = await getProject(req.params.id, req.user.id, token);
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

// Update reader settings (requires auth)
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
      const reader = await updateReaderSettings(req.params.id, req.body, req.user.id, token);
      if (!reader) {
        return res.status(404).json({ error: 'Project not found' });
      }

      req.log?.info(
        {
          event: 'reader.settings.updated',
          projectId: req.params.id,
          fontFamily: reader.fontFamily,
          fontSize: reader.fontSize,
          colorScheme: reader.colorScheme,
        },
        'Reader settings updated'
      );

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.id, token);
      res.json(reader);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to update reader settings' });
    }
  }
);

// Get current user's reader settings (requires auth)
app.get('/api/user/reader-settings', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = requireToken(req);
    const reader = await getUserReaderSettings(req.user.id, token);
    if (!reader) {
      return res.json(null);
    }
    res.json(reader);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to get reader settings' });
  }
});

// Update current user's reader settings (requires auth)
app.put('/api/user/reader-settings', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = requireToken(req);
    const reader = await updateUserReaderSettings(req.user.id, req.body, token);
    res.json(reader);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to update reader settings' });
  }
});

// ============ Chapters ============

// Start async import job for large multi-chapter formats (EPUB/FB2/CSV)
app.post(
  '/api/projects/:id/chapters/import',
  requireAuth,
  requireRole('author'),
  upload.single('file'),
  async (req, res) => {
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

      const filename =
        typeof req.body?.filename === 'string' && req.body.filename.trim()
          ? req.body.filename.trim()
          : decodeMultipartFilename(req.file.originalname);
      const extension = (filename.toLowerCase().split('.').pop() || '') as
        | 'epub'
        | 'fb2'
        | 'csv'
        | 'txt';

      if (!isSupportedFormat(filename)) {
        return res.status(400).json({
          error: 'Неподдерживаемый формат файла',
          details: 'Поддерживаемые форматы: .txt, .epub, .fb2, .csv',
        });
      }

      if (!IMPORT_JOB_FORMATS.has(extension)) {
        return res.status(400).json({
          error: 'Формат должен загружаться через обычный endpoint',
          details: 'Job-based импорт поддерживается только для .epub, .fb2, .csv',
        });
      }

      const jobId = generateImportJobId();
      const job: ImportJobState = {
        jobId,
        projectId: req.params.id,
        userId: req.user.id,
        status: 'queued',
        phase: null,
        format: extension as 'epub' | 'fb2' | 'csv',
        filename,
        current: 0,
        total: 0,
        warnings: [],
        errors: [],
        chapters: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        cancelRequested: false,
      };
      await importJobStore.createJob(job);
      await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);

      // Reply immediately; processing continues in background.
      res.status(202).json({ jobId, status: 'queued' as const });

      const projectId = req.params.id;
      const userId = req.user.id;
      const buffer = req.file.buffer;

      setImmediate(async () => {
        const jobStartedAtMs = Date.now();
        const currentJob = await importJobStore.getJob(jobId);
        if (!currentJob) return;
        req.log?.info(
          {
            event: 'import.job.started',
            jobId,
            projectId,
            userId,
            format: extension,
            filename,
            fileSizeBytes: buffer.length,
          },
          'Import job started'
        );
        await importJobStore.updateJob(jobId, {
          status: 'processing',
          phase: 'parsing',
        });

        try {
          const isFirstChapter = project.chapters.length === 0;

          if (extension === 'epub') {
            const epubParseStartedAtMs = Date.now();
            req.log?.info(
              { event: 'import.job.epub.parsing.started', jobId },
              'EPUB parsing started'
            );
            const lazyResult = await parseEpubLazy(buffer);
            req.log?.info(
              {
                event: 'import.job.epub.parsing.finished',
                jobId,
                durationMs: Date.now() - epubParseStartedAtMs,
                chapterCount: lazyResult.chapterCount,
                warningsCount: lazyResult.warnings.length,
                initialErrorsCount: lazyResult.errors.length,
              },
              'EPUB parsing finished'
            );
            if (lazyResult.errors.length > 0) {
              await importJobStore.updateJob(jobId, {
                status: 'error',
                errors: [...lazyResult.errors],
                finishedAt: new Date().toISOString(),
              });
              await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
              return;
            }
            if (lazyResult.chapterCount === 0) {
              await importJobStore.updateJob(jobId, {
                status: 'error',
                errors: ['Файл не содержит глав'],
                finishedAt: new Date().toISOString(),
              });
              await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
              return;
            }

            const epubWarnings = [...lazyResult.warnings];
            if (lazyResult.chapterCount > 500) {
              epubWarnings.push(
                `Файл содержит ${lazyResult.chapterCount} глав. Рекомендуется разбить на части для лучшей производительности.`
              );
            }

            await importJobStore.updateJob(jobId, {
              total: lazyResult.chapterCount,
              warnings: epubWarnings,
            });

            const detectedType = getProjectTypeFromFormat('epub');
            const needsTypeUpdate =
              !project.type || (project.type === 'text' && detectedType !== 'text');
            if (isFirstChapter && needsTypeUpdate) {
              await updateProject(projectId, { type: detectedType }, userId, token, {
                useServiceRole: true,
              });
            }

            if (isFirstChapter && Object.keys(lazyResult.metadata || {}).length > 0) {
              const updatedMetadata = {
                ...project.metadata,
                ...lazyResult.metadata,
              };
              if (lazyResult.metadata.coverImage) {
                try {
                  const ext = lazyResult.metadata.coverImage.mimeType.split('/')[1] || 'jpg';
                  const storagePath = generateUniqueFilename('cover', ext, projectId);
                  const uploadResult = await uploadFile(
                    'images',
                    storagePath,
                    lazyResult.metadata.coverImage.data,
                    { contentType: lazyResult.metadata.coverImage.mimeType }
                  );
                  updatedMetadata.coverImageUrl = uploadResult.publicUrl;
                } catch (coverError) {
                  req.log?.error({ err: coverError, jobId }, 'Failed to save cover image');
                }
                delete (updatedMetadata as Record<string, unknown>).coverImage;
              }
              if (JSON.stringify(updatedMetadata) !== JSON.stringify(project.metadata || {})) {
                await updateProject(projectId, { metadata: updatedMetadata }, userId, token, {
                  useServiceRole: true,
                });
              }
            }

            await importJobStore.updateJob(jobId, { phase: 'saving' });
            req.log?.info(
              {
                event: 'import.job.epub.saving.started',
                jobId,
                totalChapters: lazyResult.chapterCount,
              },
              'EPUB saving started'
            );
            let chapterNumber = 0;
            let lastProgressUpdateAtMs = 0;
            let recentChapters: Array<{ number: number; title: string }> = [];
            let pendingBatch: Array<{ title: string; originalText: string }> = [];
            let pendingBatchTitles: string[] = [];
            for await (const parsedChapter of lazyResult.chapterIterator) {
              if (await importJobStore.isCancelRequested(jobId)) {
                await importJobStore.updateJob(jobId, {
                  status: 'canceled',
                  finishedAt: new Date().toISOString(),
                });
                await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
                return;
              }

              chapterNumber++;
              pendingBatch.push({
                title: parsedChapter.title,
                originalText: parsedChapter.content,
              });
              pendingBatchTitles.push(parsedChapter.title);
              const shouldFlushBatch = pendingBatch.length >= IMPORT_CHAPTER_BATCH_SIZE;

              if (shouldFlushBatch) {
                await importChaptersBatch(projectId, pendingBatch, token, {
                  useServiceRole: true,
                });
                const firstBatchChapterNumber = chapterNumber - pendingBatchTitles.length + 1;
                for (let i = 0; i < pendingBatchTitles.length; i++) {
                  const chapterTitle = pendingBatchTitles[i];
                  const chapterNo = firstBatchChapterNumber + i;
                  recentChapters =
                    recentChapters.length >= IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT
                      ? [...recentChapters.slice(1), { number: chapterNo, title: chapterTitle }]
                      : [...recentChapters, { number: chapterNo, title: chapterTitle }];
                }
                pendingBatch = [];
                pendingBatchTitles = [];
              }

              const nowMs = Date.now();
              const shouldFlushProgress =
                chapterNumber === 1 ||
                chapterNumber === lazyResult.chapterCount ||
                chapterNumber % IMPORT_JOB_PROGRESS_UPDATE_EVERY === 0 ||
                nowMs - lastProgressUpdateAtMs >= IMPORT_JOB_PROGRESS_UPDATE_MAX_STALENESS_MS;

              if (shouldFlushProgress) {
                await importJobStore.updateJob(jobId, {
                  currentChapterTitle: parsedChapter.title,
                  current: chapterNumber,
                  chapters: recentChapters,
                });
                lastProgressUpdateAtMs = nowMs;
              }

              if (
                chapterNumber === 1 ||
                chapterNumber % 25 === 0 ||
                chapterNumber === lazyResult.chapterCount
              ) {
                req.log?.info(
                  {
                    event: 'import.job.epub.saving.progress',
                    jobId,
                    current: chapterNumber,
                    total: lazyResult.chapterCount,
                    currentChapterTitle: parsedChapter.title,
                  },
                  'EPUB saving progress'
                );
              }
            }
            if (pendingBatch.length > 0) {
              await importChaptersBatch(projectId, pendingBatch, token, {
                useServiceRole: true,
              });
              const firstBatchChapterNumber = chapterNumber - pendingBatchTitles.length + 1;
              for (let i = 0; i < pendingBatchTitles.length; i++) {
                const chapterTitle = pendingBatchTitles[i];
                const chapterNo = firstBatchChapterNumber + i;
                recentChapters =
                  recentChapters.length >= IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT
                    ? [...recentChapters.slice(1), { number: chapterNo, title: chapterTitle }]
                    : [...recentChapters, { number: chapterNo, title: chapterTitle }];
              }
              pendingBatch = [];
              pendingBatchTitles = [];
            }

            if (chapterNumber === 0) {
              await importJobStore.updateJob(jobId, {
                status: 'error',
                errors:
                  lazyResult.errors.length > 0
                    ? [...lazyResult.errors]
                    : ['Не удалось извлечь ни одной главы из EPUB файла'],
                finishedAt: new Date().toISOString(),
              });
              await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
              req.log?.warn(
                {
                  event: 'import.job.epub.saving.empty',
                  jobId,
                  parserErrors: lazyResult.errors.length,
                },
                'EPUB finished with zero saved chapters'
              );
              return;
            }

            if (lazyResult.errors.length > 0) {
              const mergedWarnings = [
                ...epubWarnings,
                `Некоторые главы EPUB были пропущены из-за ошибок парсинга: ${lazyResult.errors.length}`,
              ];
              await importJobStore.updateJob(jobId, {
                warnings: mergedWarnings,
                errors: [...lazyResult.errors],
              });
              req.log?.warn(
                {
                  event: 'import.job.epub.saving.partial-errors',
                  jobId,
                  parserErrors: lazyResult.errors.length,
                  savedChapters: chapterNumber,
                },
                'EPUB imported with chapter parse errors'
              );
            }
          } else {
            const parseResult = await parseFile(buffer, filename);
            if (parseResult.errors && parseResult.errors.length > 0) {
              await importJobStore.updateJob(jobId, {
                status: 'error',
                errors: [...parseResult.errors],
                finishedAt: new Date().toISOString(),
              });
              await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
              return;
            }
            if (parseResult.chapters.length === 0) {
              await importJobStore.updateJob(jobId, {
                status: 'error',
                errors: ['Файл не содержит глав'],
                finishedAt: new Date().toISOString(),
              });
              await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
              return;
            }

            const parseWarnings = [...(parseResult.warnings || [])];
            if (parseResult.chapters.length > 500) {
              parseWarnings.push(
                `Файл содержит ${parseResult.chapters.length} глав. Рекомендуется разбить на части для лучшей производительности.`
              );
            }

            await importJobStore.updateJob(jobId, {
              total: parseResult.chapters.length,
              warnings: parseWarnings,
            });

            const detectedType = getProjectTypeFromFormat(parseResult.format);
            const needsTypeUpdate =
              !project.type || (project.type === 'text' && detectedType !== 'text');
            if (isFirstChapter && needsTypeUpdate) {
              await updateProject(projectId, { type: detectedType }, userId, token, {
                useServiceRole: true,
              });
            }

            if (
              isFirstChapter &&
              parseResult.metadata &&
              Object.keys(parseResult.metadata).length > 0
            ) {
              const updatedMetadata = {
                ...project.metadata,
                ...parseResult.metadata,
              };
              if (parseResult.metadata.coverImage) {
                try {
                  const ext = parseResult.metadata.coverImage.mimeType.split('/')[1] || 'jpg';
                  const storagePath = generateUniqueFilename('cover', ext, projectId);
                  const uploadResult = await uploadFile(
                    'images',
                    storagePath,
                    parseResult.metadata.coverImage.data,
                    { contentType: parseResult.metadata.coverImage.mimeType }
                  );
                  updatedMetadata.coverImageUrl = uploadResult.publicUrl;
                } catch (coverError) {
                  req.log?.error({ err: coverError, jobId }, 'Failed to save cover image');
                }
                delete (updatedMetadata as Record<string, unknown>).coverImage;
              }
              if (JSON.stringify(updatedMetadata) !== JSON.stringify(project.metadata || {})) {
                await updateProject(projectId, { metadata: updatedMetadata }, userId, token, {
                  useServiceRole: true,
                });
              }
            }

            await importJobStore.updateJob(jobId, { phase: 'saving' });
            let lastProgressUpdateAtMs = 0;
            let recentChapters: Array<{ number: number; title: string }> = [];
            let pendingBatch: Array<{ title: string; originalText: string }> = [];
            let pendingBatchTitles: string[] = [];
            for (const [idx, parsedChapter] of parseResult.chapters.entries()) {
              if (await importJobStore.isCancelRequested(jobId)) {
                await importJobStore.updateJob(jobId, {
                  status: 'canceled',
                  finishedAt: new Date().toISOString(),
                });
                await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
                return;
              }

              const chapterNumber = idx + 1;
              pendingBatch.push({
                title: parsedChapter.title,
                originalText: parsedChapter.content,
              });
              pendingBatchTitles.push(parsedChapter.title);
              const shouldFlushBatch =
                pendingBatch.length >= IMPORT_CHAPTER_BATCH_SIZE ||
                chapterNumber === parseResult.chapters.length;

              if (shouldFlushBatch) {
                await importChaptersBatch(projectId, pendingBatch, token, {
                  useServiceRole: true,
                });
                const firstBatchChapterNumber = chapterNumber - pendingBatchTitles.length + 1;
                for (let i = 0; i < pendingBatchTitles.length; i++) {
                  const chapterTitle = pendingBatchTitles[i];
                  const chapterNo = firstBatchChapterNumber + i;
                  recentChapters =
                    recentChapters.length >= IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT
                      ? [...recentChapters.slice(1), { number: chapterNo, title: chapterTitle }]
                      : [...recentChapters, { number: chapterNo, title: chapterTitle }];
                }
                pendingBatch = [];
                pendingBatchTitles = [];
              }

              const nowMs = Date.now();
              const shouldFlushProgress =
                chapterNumber === 1 ||
                chapterNumber === parseResult.chapters.length ||
                chapterNumber % IMPORT_JOB_PROGRESS_UPDATE_EVERY === 0 ||
                nowMs - lastProgressUpdateAtMs >= IMPORT_JOB_PROGRESS_UPDATE_MAX_STALENESS_MS;

              if (shouldFlushProgress) {
                await importJobStore.updateJob(jobId, {
                  currentChapterTitle: parsedChapter.title,
                  current: chapterNumber,
                  chapters: recentChapters,
                });
                lastProgressUpdateAtMs = nowMs;
              }
            }
          }

          try {
            await invalidateProjectAndRelatedCaches(userId, projectId, token, {
              useServiceRole: true,
            });
          } catch (cacheError) {
            req.log?.warn(
              { err: cacheError, jobId, projectId },
              'Import completed but cache invalidation failed'
            );
          }

          await importJobStore.updateJob(jobId, {
            phase: 'finalizing',
            status: 'completed',
            finishedAt: new Date().toISOString(),
          });
          await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
          req.log?.info(
            {
              event: 'import.job.completed',
              jobId,
              format: extension,
              durationMs: Date.now() - jobStartedAtMs,
            },
            'Import job completed'
          );
        } catch (err) {
          await importJobStore.updateJob(jobId, {
            status: 'error',
            errors: [err instanceof Error ? err.message : 'Import failed'],
            finishedAt: new Date().toISOString(),
          });
          await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
          req.log?.error(
            {
              err,
              jobId,
              format: extension,
              durationMs: Date.now() - jobStartedAtMs,
            },
            'Import job failed'
          );
        }
      });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const message = error instanceof Error ? error.message : 'Failed to start import job';
      if (message.includes('Token is required') || message.includes('Invalid token')) {
        return res.status(401).json({ error: message });
      }
      req.log?.error({ err: error, projectId: req.params.id }, 'Failed to start import job');
      res.status(500).json({
        error: 'Failed to start import job',
        details: message,
      });
    }
  }
);

// Import job status (polling endpoint)
app.get(
  '/api/projects/:id/import-jobs/:jobId',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const job = await importJobStore.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Import job not found' });
    if (job.userId !== req.user.id || job.projectId !== req.params.id) {
      return res.status(404).json({ error: 'Import job not found' });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    const compact = req.query.compact === '1' || req.query.compact === 'true';
    res.json(toPublicImportJob(job, { compact }));
  }
);

// Cancel import job
app.post(
  '/api/projects/:id/import-jobs/:jobId/cancel',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const job = await importJobStore.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Import job not found' });
    if (job.userId !== req.user.id || job.projectId !== req.params.id) {
      return res.status(404).json({ error: 'Import job not found' });
    }
    if (job.status === 'completed' || job.status === 'error' || job.status === 'canceled') {
      return res.json({ success: true });
    }
    await importJobStore.requestCancel(req.params.jobId);
    res.json({ success: true });
  }
);

// Upload chapter to project (requires auth)
app.post(
  '/api/projects/:id/chapters',
  requireAuth,
  requireRole('author'),
  upload.single('file'),
  async (req, res) => {
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
          details: 'Поддерживаемые форматы: .txt, .epub, .fb2, .csv',
        });
      }

      const isEpub = filename.toLowerCase().endsWith('.epub');

      // EPUB: use lazy parsing to avoid loading all chapters into memory
      if (isEpub) {
        let lazyResult;
        try {
          lazyResult = await parseEpubLazy(req.file.buffer);
        } catch (parseError) {
          const errorMessage =
            parseError instanceof Error ? parseError.message : 'File parse error';
          req.log?.error({ err: parseError }, 'Parse error');
          return res.status(400).json({
            error: 'Ошибка при парсинге файла',
            details: errorMessage,
            parseErrors: [errorMessage],
          });
        }

        if (lazyResult.errors.length > 0) {
          req.log?.error({ parseErrors: lazyResult.errors }, 'Parse errors');
          return res.status(400).json({
            error: 'Ошибки при парсинге файла',
            details: lazyResult.errors.join('; '),
            parseErrors: lazyResult.errors,
            warnings: lazyResult.warnings,
          });
        }

        if (lazyResult.chapterCount === 0) {
          return res.status(400).json({
            error: 'Файл не содержит глав',
            details: 'Не удалось извлечь ни одной главы из файла',
          });
        }

        const detectedType = getProjectTypeFromFormat('epub');
        const isFirstChapter = project.chapters.length === 0;
        const needsTypeUpdate =
          !project.type || (project.type === 'text' && detectedType !== 'text');

        if (isFirstChapter && needsTypeUpdate) {
          await updateProject(req.params.id, { type: detectedType }, req.user.id, token);
        }

        if (isFirstChapter && lazyResult.metadata && Object.keys(lazyResult.metadata).length > 0) {
          const updatedMetadata = {
            ...project.metadata,
            ...lazyResult.metadata,
          };
          if (lazyResult.metadata.coverImage) {
            try {
              const ext = lazyResult.metadata.coverImage.mimeType.split('/')[1] || 'jpg';
              const storagePath = generateUniqueFilename('cover', ext, req.params.id);
              const uploadResult = await uploadFile(
                'images',
                storagePath,
                lazyResult.metadata.coverImage!.data,
                { contentType: lazyResult.metadata.coverImage!.mimeType }
              );
              updatedMetadata.coverImageUrl = uploadResult.publicUrl;
            } catch (coverError) {
              req.log?.error({ err: coverError }, 'Failed to save cover image');
            }
            delete (updatedMetadata as Record<string, unknown>).coverImage;
          }
          if (JSON.stringify(updatedMetadata) !== JSON.stringify(project.metadata || {})) {
            await updateProject(req.params.id, { metadata: updatedMetadata }, req.user.id, token);
          }
        }

        const CHAPTER_COUNT_WARN_THRESHOLD = 500;
        const chapterCountWarnings = [...lazyResult.warnings];
        if (lazyResult.chapterCount > CHAPTER_COUNT_WARN_THRESHOLD) {
          chapterCountWarnings.push(
            `Файл содержит ${lazyResult.chapterCount} глав. Рекомендуется разбить на части для лучшей производительности.`
          );
        }

        const importedRows: Array<{
          sourceIndex: number;
          chapterId: string;
          number: number;
          title: string;
          paragraphsCount: number;
        }> = [];
        let pendingBatch: Array<{ title: string; originalText: string }> = [];
        for await (const parsedChapter of lazyResult.chapterIterator) {
          pendingBatch.push({ title: parsedChapter.title, originalText: parsedChapter.content });
          if (pendingBatch.length >= IMPORT_CHAPTER_BATCH_SIZE) {
            const rows = await importChaptersBatch(req.params.id, pendingBatch, token);
            importedRows.push(...rows);
            pendingBatch = [];
          }
        }
        if (pendingBatch.length > 0) {
          const rows = await importChaptersBatch(req.params.id, pendingBatch, token);
          importedRows.push(...rows);
        }
        await invalidateUserProjectCaches(req.user.id, req.params.id);

        if (importedRows.length === 0) {
          return res.status(400).json({
            error: 'Файл не содержит глав',
            details: 'Не удалось извлечь ни одной главы из файла',
          });
        }
        if (lazyResult.errors.length > 0) {
          chapterCountWarnings.push(
            `Некоторые главы EPUB были пропущены из-за ошибок парсинга: ${lazyResult.errors.length}`
          );
        }

        if (importedRows.length === 1) {
          const fullChapter = await getChapter(req.params.id, importedRows[0].chapterId, token);
          if (!fullChapter) {
            return res.status(500).json({ error: 'Failed to load imported chapter' });
          }
          res.json(fullChapter);
        } else {
          res.json({
            chapters: importedRows.map((row) => ({
              id: row.chapterId,
              number: row.number,
              title: row.title,
              originalText: '',
              status: 'pending' as const,
              paragraphs: [],
            })),
            count: importedRows.length,
            warnings: chapterCountWarnings.length > 0 ? chapterCountWarnings : undefined,
          });
        }
        return;
      }

      // Non-EPUB: use standard parseFile (loads all into memory)
      let parseResult: ParseResult;
      try {
        parseResult = await parseFile(req.file.buffer, filename);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'File parse error';
        req.log?.error({ err: parseError }, 'Parse error');
        return res.status(400).json({
          error: 'Ошибка при парсинге файла',
          details: errorMessage,
          parseErrors: [errorMessage],
        });
      }

      if (parseResult.errors && parseResult.errors.length > 0) {
        req.log?.error({ parseErrors: parseResult.errors }, 'Parse errors');
        return res.status(400).json({
          error: 'Ошибки при парсинге файла',
          details: parseResult.errors.join('; '),
          parseErrors: parseResult.errors,
          warnings: parseResult.warnings,
        });
      }

      const detectedType = getProjectTypeFromFormat(parseResult.format);
      const isFirstChapter = project.chapters.length === 0;
      const needsTypeUpdate = !project.type || (project.type === 'text' && detectedType !== 'text');

      if (isFirstChapter && needsTypeUpdate) {
        await updateProject(req.params.id, { type: detectedType }, req.user.id, token);
        req.log?.info(
          { event: 'project.type.detected', projectId: req.params.id, type: detectedType },
          `Project type set to ${detectedType}`
        );
      }

      if (isFirstChapter && parseResult.metadata && Object.keys(parseResult.metadata).length > 0) {
        const updatedMetadata = {
          ...project.metadata,
          ...parseResult.metadata,
        };

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
            req.log?.info({ event: 'cover.saved', storagePath }, 'Cover saved to Supabase Storage');
          } catch (coverError) {
            req.log?.error({ err: coverError }, 'Failed to save cover image');
          }
          delete (updatedMetadata as Record<string, unknown>).coverImage;
        }

        if (JSON.stringify(updatedMetadata) !== JSON.stringify(project.metadata || {})) {
          await updateProject(req.params.id, { metadata: updatedMetadata }, req.user.id, token);
          req.log?.info(
            {
              event: 'project.metadata.updated',
              projectId: req.params.id,
              title: parseResult.metadata.title,
            },
            'Project metadata updated'
          );
        }
      } else if (
        !isFirstChapter &&
        parseResult.metadata &&
        Object.keys(parseResult.metadata).length > 0
      ) {
        req.log?.debug(
          { projectId: req.params.id },
          'Skipped metadata update: project already has chapters'
        );
      }

      if (parseResult.chapters.length === 0) {
        return res.status(400).json({
          error: 'Файл не содержит глав',
          details: 'Не удалось извлечь ни одной главы из файла',
        });
      }

      const CHAPTER_COUNT_WARN_THRESHOLD = 500;
      const chapterCountWarnings = [...(parseResult.warnings || [])];
      if (parseResult.chapters.length > CHAPTER_COUNT_WARN_THRESHOLD) {
        chapterCountWarnings.push(
          `Файл содержит ${parseResult.chapters.length} глав. Рекомендуется разбить на части для лучшей производительности.`
        );
      }

      const importedRows: Array<{
        sourceIndex: number;
        chapterId: string;
        number: number;
        title: string;
        paragraphsCount: number;
      }> = [];
      for (let i = 0; i < parseResult.chapters.length; i += IMPORT_CHAPTER_BATCH_SIZE) {
        const chunk = parseResult.chapters
          .slice(i, i + IMPORT_CHAPTER_BATCH_SIZE)
          .map((parsedChapter) => ({
            title: parsedChapter.title,
            originalText: parsedChapter.content,
          }));
        const rows = await importChaptersBatch(req.params.id, chunk, token);
        importedRows.push(...rows);
      }
      await invalidateUserProjectCaches(req.user.id, req.params.id);

      if (importedRows.length === 1) {
        const fullChapter = await getChapter(req.params.id, importedRows[0].chapterId, token);
        if (!fullChapter) {
          return res.status(500).json({ error: 'Failed to load imported chapter' });
        }
        res.json(fullChapter);
      } else {
        res.json({
          chapters: importedRows.map((row) => ({
            id: row.chapterId,
            number: row.number,
            title: row.title,
            originalText: '',
            status: 'pending' as const,
            paragraphs: [],
          })),
          count: importedRows.length,
          warnings: chapterCountWarnings.length > 0 ? chapterCountWarnings : parseResult.warnings,
        });
      }
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const message = error instanceof Error ? error.message : 'Failed to add chapter';
      // Check if error is related to token validation
      if (message.includes('Token is required') || message.includes('Invalid token')) {
        return res.status(401).json({ error: message });
      }
      req.log?.error({ err: error, projectId: req.params.id }, 'Failed to add chapter');
      res.status(500).json({
        error: 'Failed to add chapter',
        details: message,
      });
    }
  }
);

// Get chapter status only (lightweight, for polling during translation)
app.get(
  '/api/projects/:projectId/chapters/:chapterId/status',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      const token = requireToken(req);
      const statusRow = await getChapterStatusRow(
        req.params.projectId,
        req.params.chapterId,
        token
      );
      if (!statusRow) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      const { status, updated_at: updatedAt } = statusRow;

      // Orphan detection: chapter was translating before server restart (no progress in memory, updated_at before start)
      if (
        status === 'translating' &&
        !getTranslationProgress(req.params.projectId, req.params.chapterId) &&
        new Date(updatedAt).getTime() < SERVER_START_TIME_MS
      ) {
        await updateChapter(
          req.params.projectId,
          req.params.chapterId,
          { status: 'pending' },
          token,
          { useServiceRole: true }
        );
        await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
        return res.json({ status: 'pending' });
      }

      const payload: { status: string; chunksDone?: number; totalChunks?: number } = {
        status,
      };
      if (status === 'translating') {
        const progress = getTranslationProgress(req.params.projectId, req.params.chapterId);
        if (progress) {
          payload.chunksDone = progress.chunksDone;
          payload.totalChunks = progress.totalChunks;
        }
      }
      res.json(payload);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to get chapter status' });
    }
  }
);

// Get chapter (requires auth)
app.get(
  '/api/projects/:projectId/chapters/:chapterId',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const hasAccess = await verifyChapterAccess(
        req.params.projectId,
        req.params.chapterId,
        req.user.id,
        token
      );
      if (!hasAccess) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      const chapter = await getChapter(req.params.projectId, req.params.chapterId, token);
      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      res.json(chapter);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to get chapter' });
    }
  }
);

// Delete chapter (requires auth)
app.delete(
  '/api/projects/:projectId/chapters/:chapterId',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const hasAccess = await verifyChapterAccess(
        req.params.projectId,
        req.params.chapterId,
        req.user.id,
        token
      );
      if (!hasAccess) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      const success = await deleteChapter(req.params.projectId, req.params.chapterId, token);
      if (!success) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      await invalidateUserProjectCaches(req.user.id, req.params.projectId);
      res.json({ success: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to delete chapter' });
    }
  }
);

// ============ Translation ============

// Cancel translation (reset stuck status) (requires auth)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/translate/cancel',
  requireAuth,
  requireRole('author'),
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

      // Set cancel flag and immediately set chapter status to pending so UI updates without waiting for pipeline to exit
      if (chapter.status === 'translating') {
        translationCancelRegistry.set(
          translationCancelKey(req.params.projectId, req.params.chapterId),
          true
        );
        await updateChapter(
          req.params.projectId,
          req.params.chapterId,
          { status: 'pending' },
          requireToken(req)
        );
        req.log?.info(
          {
            event: 'translation.cancelled',
            chapterId: req.params.chapterId,
            chapterTitle: chapter.title,
          },
          'Translation cancelled (flag set, status updated to pending)'
        );
        await invalidateProjectAndRelatedCaches(
          req.user.id,
          req.params.projectId,
          requireToken(req)
        );
        res.json({ success: true, message: 'Translation cancelled' });
      } else {
        res.json({ success: false, message: 'Chapter is not being translated' });
      }
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to cancel translation');
      res.status(500).json({ error: 'Failed to cancel translation' });
    }
  }
);

// Manual sync translated chunks to paragraphs (recovery endpoint) (requires auth)
// NOTE: Sync is now automatic after translation. This endpoint is for recovery only.
app.post(
  '/api/projects/:projectId/chapters/:chapterId/translate/sync',
  requireAuth,
  requireRole('author'),
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

      req.log?.info(
        {
          event: 'translation.sync.manual',
          projectId: req.params.projectId,
          chapterId: req.params.chapterId,
          chapterTitle: chapter.title,
          chunksCount: chapter.translatedChunks.length,
          paragraphsCount: chapter.paragraphs.length,
        },
        'Manual sync: translating chunks to paragraphs (recovery)'
      );

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

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, requireToken(req));
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
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      req.log?.error({ err: error }, 'Failed to sync translation');
      res.status(500).json({ error: `Failed to sync translation: ${errorMessage}` });
    }
  }
);

// Upload ready-made translation (requires auth)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/upload-translation',
  requireAuth,
  requireRole('author'),
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

      const chapter = await getChapter(req.params.projectId, req.params.chapterId, token);
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

      const syncedParagraphs = syncTranslationToParagraphs(chapter.paragraphs, translatedText, {
        replaceAll: true,
        editedBy: 'user',
      });

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
        req.log?.info(
          {
            event: 'translation.uploaded',
            chapterId: req.params.chapterId,
            chapterTitle: chapter.title,
          },
          'Ready-made translation uploaded'
        );
        await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
        res.json(updatedChapter);
      } else {
        res.status(500).json({ error: 'Failed to update chapter' });
      }
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      req.log?.error({ err: error }, 'Failed to upload translation');
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
  requireRole('author'),
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

      const chapter = await getChapter(req.params.projectId, req.params.chapterId, token);
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
      const withOriginal = chapter.paragraphs.filter(
        (p) => (p.originalText || '').trim().length > 0
      ).length;
      const totalOriginalChars = chapter.paragraphs.reduce(
        (s, p) => s + (p.originalText || '').length,
        0
      );
      req.log?.debug(
        {
          chapterTitle: chapter.title,
          paragraphsCount: chapter.paragraphs.length,
          withOriginal,
          totalOriginalChars,
        },
        'mark-as-translated: input state'
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

      req.log?.debug(
        {
          chapterTitle: chapter.title,
          paragraphsCount: chapter.paragraphs.length,
          chunksCount: chunks.length,
          mergedLen: mergedText.length,
        },
        'mark-as-translated: counts'
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
        req.log?.info(
          {
            event: 'chapter.marked_translated',
            chapterId: req.params.chapterId,
            chapterTitle: chapter.title,
          },
          'Chapter marked as translated'
        );
        await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
        res.json(updatedChapter);
      } else {
        res.status(500).json({ error: 'Failed to update chapter' });
      }
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      req.log?.error({ err: error }, 'Failed to mark chapter as translated');
      res.status(500).json({
        error: 'Failed to mark chapter as translated',
        details: errorMessage,
      });
    }
  }
);

// Batch mark chapters as translated (single request, structured continue-and-report result)
app.post(
  '/api/projects/:projectId/chapters/mark-as-translated-batch',
  requireAuth,
  requireRole('author'),
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

      const parsed = chapterIdsBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const chapterIds = Array.from(new Set(parsed.data.chapterIds));
      const continueOnError = parsed.data.options?.continueOnError ?? true;
      const aggregate: MarkTranslatedBatchResult = {
        summary: {
          total: chapterIds.length,
          processed: 0,
          success: 0,
          failed: 0,
          skipped: 0,
        },
        results: [],
      };
      for (let i = 0; i < chapterIds.length; i += MARK_TRANSLATED_BATCH_CHUNK_SIZE) {
        const chunk = chapterIds.slice(i, i + MARK_TRANSLATED_BATCH_CHUNK_SIZE);
        const chunkResult: MarkTranslatedBatchResult = await markChaptersAsTranslatedBatch(
          req.params.projectId,
          chunk,
          token,
          { continueOnError }
        );
        aggregate.results.push(...chunkResult.results);
        aggregate.summary.processed += chunkResult.summary.processed;
        aggregate.summary.success += chunkResult.summary.success;
        aggregate.summary.failed += chunkResult.summary.failed;
        aggregate.summary.skipped += chunkResult.summary.skipped;
        // For strict mode, stop after first chunk with failed items to mimic fail-fast behavior.
        if (!continueOnError && chunkResult.summary.failed > 0) {
          break;
        }
      }

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
      req.log?.info(
        {
          event: 'chapters.mark_translated.batch_completed',
          projectId: req.params.projectId,
          total: aggregate.summary.total,
          processed: aggregate.summary.processed,
          success: aggregate.summary.success,
          failed: aggregate.summary.failed,
          skipped: aggregate.summary.skipped,
        },
        'Batch mark-as-translated completed'
      );

      res.json(aggregate);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      req.log?.error({ err: error }, 'Failed to mark chapters as translated in batch');
      res.status(500).json({
        error: 'Failed to mark chapters as translated in batch',
        details: errorMessage,
      });
    }
  }
);

// Batch analysis endpoint (requires auth)
app.post(
  '/api/projects/:projectId/chapters/analyze-batch',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const projectId = req.params.projectId;
      const project = await getProject(projectId, req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const parsed = chapterIdsBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { chapterIds, languagePair: languagePairOverride } = parsed.data;
      warnLanguageOverrideWithGlossary(req, project, languagePairOverride);
      const jobLanguageFields = effectiveJobLanguageFields(project, languagePairOverride);

      const chaptersWithText: Array<Chapter & { originalText: string }> = [];

      for (const chapterId of chapterIds) {
        const chapter = await getChapter(projectId, chapterId, token);
        if (!chapter) continue;
        const effectiveOriginalText =
          chapter.originalText && chapter.originalText.trim().length > 0
            ? chapter.originalText.trim()
            : chapter.paragraphs && chapter.paragraphs.length > 0
              ? mergeParagraphsToText(chapter.paragraphs, 'originalText').trim()
              : '';
        if (!effectiveOriginalText) continue;
        chaptersWithText.push({ ...chapter, originalText: effectiveOriginalText });
      }

      if (chaptersWithText.length === 0) {
        return res.status(400).json({
          error: 'No chapters with text',
          message: 'None of the specified chapters have original text to analyze.',
        });
      }

      const totalTextLength = chaptersWithText.reduce(
        (sum, ch) => sum + (ch.originalText?.length ?? 0),
        0
      );
      const estimatedTokens = estimateTokensForStages(totalTextLength, ['analysis']);
      const limitCheck = await checkTokenLimit(
        req.user!.id,
        token,
        estimatedTokens,
        req.user!.role
      );
      if (!limitCheck.allowed) {
        const now = new Date();
        const resetTime = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
        );
        return res.status(429).json({
          error: 'Token limit exceeded',
          message: limitCheck.message || 'Дневной лимит токенов исчерпан. Попробуйте завтра.',
          currentUsage: limitCheck.currentUsage,
          limit: limitCheck.limit,
          estimatedTokens,
          resetAt: resetTime.toISOString(),
        });
      }

      const preferAsync =
        req.get('Prefer')?.toLowerCase().includes('respond-async') ||
        req.query?.async === '1' ||
        req.query?.async === 'true';

      if (preferAsync) {
        const userId = req.user!.id;

        if (!isBullAvailable()) {
          return res.status(503).json({
            error: 'Job queue unavailable',
            message: 'REDIS_URL required for async jobs. Configure Redis and restart.',
          });
        }

        const hasActive = await analysisJobStore.hasActiveJobForUser(userId);
        if (hasActive) {
          return res.status(409).json({
            error: 'Active job exists',
            message: 'У вас уже есть активная задача. Дождитесь её завершения.',
          });
        }

        await reserveTokens(userId, token, estimatedTokens);

        const jobId = generateAnalysisJobId();
        const jobChapters: AnalysisJobChapter[] = chaptersWithText.map((ch) => ({
          chapterId: ch.id,
          title: ch.title,
          status: 'pending' as const,
        }));
        const job: AnalysisJobState = {
          jobId,
          projectId,
          userId,
          status: 'queued',
          current: 0,
          total: chaptersWithText.length,
          chapters: jobChapters,
          totalTokensUsed: 0,
          errors: [],
          startedAt: new Date().toISOString(),
          finishedAt: null,
          cancelRequested: false,
          estimatedTokens,
          ...jobLanguageFields,
        };
        await analysisJobStore.createJob(job);
        await analysisJobStore.addToProjectIndex(projectId, jobId);
        await analysisJobStore.setTtl(jobId, ANALYSIS_JOB_TTL_SECONDS);
        await analysisJobStore.setUserActiveJob(userId, jobId);

        await addAnalysisJob({
          jobId,
          projectId,
          userId,
          estimatedTokens,
          chapterIds: chaptersWithText.map((c) => c.id),
          ...jobLanguageFields,
        });

        res.status(202).json({ jobId, status: 'queued' as const });
        return;
      }

      const analysisConcurrency = Math.max(1, config.translation?.analysisConcurrency ?? 4);
      const traceId = createTraceId();
      const requestId = (req as express.Request & { id: string }).id;
      setDebugTraceId(res, traceId);
      const result = await runWithDebugContextAsync({ traceId, requestId, projectId }, async () =>
        analyzeChaptersBatch(config, project, chaptersWithText, {
          useCache: true,
          analysisConcurrency,
          languagePair: languagePairOverride,
        })
      );

      if (result.glossaryUpdates.length > 0) {
        for (const entry of result.glossaryUpdates) {
          await addGlossaryEntry(projectId, entry, token, { useServiceRole: true });
        }
      }
      if (result.glossaryUpdatesExisting.length > 0) {
        for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
          await updateGlossaryEntry(projectId, entryId, updates, token, {
            useServiceRole: true,
          });
        }
      }

      for (const chResult of result.chapterResults) {
        if (!chResult.success) continue;
        const chapterNum =
          chaptersWithText.find((c) => c.id === chResult.chapterId)?.number ??
          chResult.chapterNumber;
        if (chResult.glossaryAppearanceEntryIds.length > 0) {
          await mergeGlossaryAppearanceForChapter(
            projectId,
            chResult.glossaryAppearanceEntryIds,
            chapterNum,
            token,
            { chapterId: chResult.chapterId }
          );
        }
        const nowIso = new Date().toISOString();
        const analysisModel =
          project.settings?.stageModels?.analysis ?? project.settings?.model ?? config.openai.model;
        const existingChapter = await getChapter(projectId, chResult.chapterId, token, {
          useServiceRole: true,
        });
        const preserveStatus =
          existingChapter?.status === 'completed' || existingChapter?.status === 'draft';
        const preservedSource = existingChapter?.translationMeta?.source;
        await updateChapter(
          projectId,
          chResult.chapterId,
          {
            status: preserveStatus ? existingChapter!.status : 'analyzed',
            translationMeta: {
              ...(existingChapter?.translationMeta || {}),
              tokensUsed: chResult.tokensUsed,
              tokensByStage: {
                ...(existingChapter?.translationMeta?.tokensByStage || {}),
                analysis: chResult.tokensUsed,
                translation: existingChapter?.translationMeta?.tokensByStage?.translation ?? 0,
                editing: existingChapter?.translationMeta?.tokensByStage?.editing ?? 0,
              },
              duration: result.totalDuration,
              model: analysisModel,
              translatedAt: existingChapter?.translationMeta?.translatedAt ?? nowIso,
              lastAnalysisAt: nowIso,
              ...(preservedSource ? { source: preservedSource } : {}),
            },
          },
          token,
          { useServiceRole: true }
        );
      }

      try {
        await incrementTokenUsage(
          req.user.id,
          token,
          result.totalTokensUsed,
          {
            analysis: result.totalTokensUsed,
            translation: 0,
            editing: 0,
          },
          { useServiceRole: true }
        );
      } catch (tokenError) {
        req.log?.warn({ err: tokenError }, 'Failed to update token usage (non-critical)');
      }

      await invalidateProjectAndRelatedCaches(req.user.id, projectId, token, {
        useServiceRole: true,
      });

      res.json({
        success: true,
        totalChapters: result.chapterResults.length,
        successful: result.chapterResults.filter((c) => c.success).length,
        failed: result.chapterResults.filter((c) => !c.success).length,
        totalTokensUsed: result.totalTokensUsed,
        totalDuration: result.totalDuration,
        glossaryEntriesAdded: result.glossaryUpdates.length,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      req.log?.error({ err }, `Analyze batch failed: ${errorMessage}`);
      res.status(500).json({
        error: 'Analysis batch failed',
        details: errorMessage,
      });
    }
  }
);

// List all jobs for a project (analysis + translate)
app.get('/api/projects/:projectId/jobs', requireAuth, requireRole('author'), async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const projectId = req.params.projectId;
  const project = await getProject(projectId, req.user.id, requireToken(req));
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const [analysisJobs, translateJobs] = await Promise.all([
    analysisJobStore.listByProject(projectId),
    translateJobStore.listByProject(projectId),
  ]);

  const jobs = [
    ...analysisJobs
      .filter((j) => j.userId === req.user!.id)
      .map((j) => ({ type: 'analysis' as const, ...toPublicAnalysisJob(j, { compact: true }) })),
    ...translateJobs
      .filter((j) => j.userId === req.user!.id)
      .map((j) => ({ type: 'translate' as const, ...toPublicTranslateJob(j, { compact: true }) })),
  ].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({ jobs });
});

// Analysis job status (polling endpoint)
app.get(
  '/api/projects/:projectId/analysis-jobs/:jobId',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const job = await analysisJobStore.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Analysis job not found' });
    if (job.userId !== req.user.id || job.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'Analysis job not found' });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    const compact = req.query.compact === '1' || req.query.compact === 'true';
    res.json(toPublicAnalysisJob(job, { compact }));
  }
);

// Cancel analysis job
app.post(
  '/api/projects/:projectId/analysis-jobs/:jobId/cancel',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
      const job = await analysisJobStore.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Analysis job not found' });
      if (job.userId !== req.user.id || job.projectId !== req.params.projectId) {
        return res.status(404).json({ error: 'Analysis job not found' });
      }
      if (job.status === 'completed' || job.status === 'error' || job.status === 'canceled') {
        return res.json({ success: true });
      }

      // Always perform store-side cleanup so user is unblocked immediately
      await analysisJobStore.requestCancel(req.params.jobId);
      await analysisJobStore.updateJob(req.params.jobId, {
        status: 'canceled',
        finishedAt: new Date().toISOString(),
      });
      await analysisJobStore.setTtl(req.params.jobId, ANALYSIS_JOB_TTL_SECONDS);
      try {
        await releaseTokens(job.userId, job.estimatedTokens ?? 0, { useServiceRole: true });
      } catch (tokenErr) {
        req.log?.warn({ err: tokenErr }, 'Failed to release tokens on cancel');
      }
      await analysisJobStore.removeFromProjectIndex(job.projectId, req.params.jobId);
      await analysisJobStore.clearUserActiveJob(job.userId, req.params.jobId);
      return res.json({ success: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Analysis job cancel failed');
      res.status(500).json({ error: 'Failed to cancel analysis job' });
    }
  }
);

// Batch translate endpoint (async job, like analyze-batch)
app.post(
  '/api/projects/:projectId/chapters/translate-batch',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const projectId = req.params.projectId;
      const project = await getProject(projectId, req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const parsed = translateBatchBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const {
        chapterIds,
        translateOnlyEmpty,
        translateChapterTitles,
        stages: stagesRaw,
        languagePair: languagePairOverride,
      } = parsed.data;
      warnLanguageOverrideWithGlossary(req, project, languagePairOverride);
      const jobLanguageFields = effectiveJobLanguageFields(project, languagePairOverride);
      const validStage = (s: string): s is 'analysis' | 'translation' | 'editing' =>
        s === 'analysis' || s === 'translation' || s === 'editing';
      let stages: TranslationStages = 'all';
      if (Array.isArray(stagesRaw) && stagesRaw.length > 0) {
        const arr = stagesRaw.filter(validStage);
        if (arr.length > 0) stages = [...new Set(arr)];
      } else if (stagesRaw === 'all') {
        stages = 'all';
      }

      const chaptersToTranslate: Chapter[] = [];
      for (const chapterId of chapterIds) {
        const chapter = await getChapter(projectId, chapterId, token);
        if (!chapter) continue;
        const effectiveOriginalText =
          chapter.originalText && chapter.originalText.trim().length > 0
            ? chapter.originalText.trim()
            : chapter.paragraphs && chapter.paragraphs.length > 0
              ? mergeParagraphsToText(chapter.paragraphs, 'originalText').trim()
              : '';
        if (!effectiveOriginalText) continue;
        if (chapter.status === 'translating') continue;
        chaptersToTranslate.push({ ...chapter, originalText: effectiveOriginalText });
      }

      if (chaptersToTranslate.length === 0) {
        return res.status(400).json({
          error: 'No chapters to translate',
          message: 'None of the specified chapters have text or are already translating.',
        });
      }

      const totalTextLength = chaptersToTranslate.reduce(
        (sum, ch) => sum + (ch.originalText?.length ?? 0),
        0
      );
      const translateTitles = translateChapterTitles !== false;
      const stagesIncludeTranslation =
        stages === 'all' || (Array.isArray(stages) && stages.includes('translation'));
      let estimatedTokens = estimateTokensForStages(totalTextLength, stages);
      if (translateTitles && stagesIncludeTranslation) {
        estimatedTokens += estimateTokensForChapterTitles(chaptersToTranslate.length);
      }
      const limitCheck = await checkTokenLimit(req.user.id, token, estimatedTokens, req.user.role);
      if (!limitCheck.allowed) {
        const now = new Date();
        const resetTime = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
        );
        return res.status(429).json({
          error: 'Token limit exceeded',
          message: limitCheck.message || 'Дневной лимит токенов исчерпан. Попробуйте завтра.',
          currentUsage: limitCheck.currentUsage,
          limit: limitCheck.limit,
          estimatedTokens,
          resetAt: resetTime.toISOString(),
        });
      }

      const preferAsync =
        req.get('Prefer')?.toLowerCase().includes('respond-async') ||
        req.query?.async === '1' ||
        req.query?.async === 'true';

      if (preferAsync) {
        const userId = req.user.id;

        if (!isBullAvailable()) {
          return res.status(503).json({
            error: 'Job queue unavailable',
            message: 'REDIS_URL required for async jobs. Configure Redis and restart.',
          });
        }

        const hasActive = await translateJobStore.hasActiveJobForUser(userId);
        if (hasActive) {
          return res.status(409).json({
            error: 'Active job exists',
            message: 'У вас уже есть активная задача. Дождитесь её завершения.',
          });
        }

        await reserveTokens(userId, token, estimatedTokens);

        const jobId = generateTranslateJobId();
        const jobChapters: TranslateJobChapter[] = chaptersToTranslate.map((ch) => ({
          chapterId: ch.id,
          title: ch.title,
          status: 'pending' as const,
        }));
        const job: TranslateJobState = {
          jobId,
          projectId,
          userId,
          status: 'queued',
          current: 0,
          total: chaptersToTranslate.length,
          chapters: jobChapters,
          totalTokensUsed: 0,
          errors: [],
          startedAt: new Date().toISOString(),
          finishedAt: null,
          cancelRequested: false,
          estimatedTokens,
          ...jobLanguageFields,
        };
        await translateJobStore.createJob(job);
        await translateJobStore.addToProjectIndex(projectId, jobId);
        await translateJobStore.setTtl(jobId, TRANSLATE_JOB_TTL_SECONDS);
        await translateJobStore.setUserActiveJob(userId, jobId);

        await addTranslateJob({
          jobId,
          projectId,
          userId,
          estimatedTokens,
          chapterIds: chaptersToTranslate.map((c) => c.id),
          stages,
          translateOnlyEmpty: translateOnlyEmpty ?? false,
          translateChapterTitles: translateTitles,
          ...jobLanguageFields,
        });

        res.status(202).json({ jobId, status: 'queued' as const });
        return;
      }

      res.status(400).json({
        error: 'Async required',
        message: 'Use ?async=1 or Prefer: respond-async for batch translate.',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      req.log?.error({ err }, `Translate batch failed: ${errorMessage}`);
      res.status(500).json({
        error: 'Translate batch failed',
        details: errorMessage,
      });
    }
  }
);

// Translate job status (polling endpoint)
app.get(
  '/api/projects/:projectId/translate-jobs/:jobId',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const job = await translateJobStore.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Translate job not found' });
    if (job.userId !== req.user.id || job.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'Translate job not found' });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    const compact = req.query.compact === '1' || req.query.compact === 'true';
    res.json(toPublicTranslateJob(job, { compact }));
  }
);

// Cancel translate job
app.post(
  '/api/projects/:projectId/translate-jobs/:jobId/cancel',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
      const job = await translateJobStore.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Translate job not found' });
      if (job.userId !== req.user.id || job.projectId !== req.params.projectId) {
        return res.status(404).json({ error: 'Translate job not found' });
      }
      if (job.status === 'completed' || job.status === 'error' || job.status === 'canceled') {
        return res.json({ success: true });
      }

      // Always perform store-side cleanup so user is unblocked immediately.
      // If BullMQ job is orphan (no worker), also reset stuck chapters.
      let isOrphan = false;
      if (isBullAvailable()) {
        try {
          const queue = getChapterTranslateQueue();
          const bullJob = await queue.getJob(req.params.jobId);
          isOrphan = !bullJob || !(await bullJob.isActive());
          if (isOrphan) {
            const chapterIds = job.chapters.map((c) => c.chapterId);
            await resetStuckChaptersForRecovery(job.projectId, chapterIds);
          }
        } catch (orphanErr) {
          req.log?.warn(
            { err: orphanErr, jobId: req.params.jobId },
            'Orphan check failed, proceeding with cancel without chapter reset'
          );
        }
      }

      await translateJobStore.requestCancel(req.params.jobId);
      await translateJobStore.updateJob(req.params.jobId, {
        status: 'canceled',
        finishedAt: new Date().toISOString(),
      });
      await translateJobStore.setTtl(req.params.jobId, TRANSLATE_JOB_TTL_SECONDS);
      try {
        await releaseTokens(job.userId, job.estimatedTokens ?? 0, { useServiceRole: true });
      } catch (tokenErr) {
        req.log?.warn({ err: tokenErr }, 'Failed to release tokens on cancel');
      }
      await translateJobStore.removeFromProjectIndex(job.projectId, req.params.jobId);
      await translateJobStore.clearUserActiveJob(job.userId, req.params.jobId);
      return res.json({ success: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Translate job cancel failed');
      res.status(500).json({ error: 'Failed to cancel translate job' });
    }
  }
);

// Translation endpoint with logging (requires auth)
app.post(
  '/api/projects/:projectId/chapters/:chapterId/translate',
  requireAuth,
  requireRole('author'),
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

      const chapter = await getChapter(req.params.projectId, req.params.chapterId, token);
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
        chapter.originalText && chapter.originalText.trim().length > 0
          ? chapter.originalText.trim()
          : chapter.paragraphs && chapter.paragraphs.length > 0
            ? mergeParagraphsToText(chapter.paragraphs, 'originalText').trim()
            : '';
      if (!effectiveOriginalText) {
        return res.status(400).json({
          error: 'No source text',
          message:
            'Глава не содержит исходного текста. Добавьте текст или импортируйте главу заново.',
        });
      }
      const chapterForTranslation = { ...chapter, originalText: effectiveOriginalText };

      const parsedBody = chapterTranslateBodySchema.safeParse(req.body || {});
      if (!parsedBody.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsedBody.error.flatten().fieldErrors,
        });
      }
      const {
        translateOnlyEmpty = false,
        translateChapterTitles,
        paragraphIds,
        stages: stagesRaw,
        languagePair: languagePairOverride,
      } = parsedBody.data;
      warnLanguageOverrideWithGlossary(req, project, languagePairOverride);
      const validStage = (s: string): s is 'analysis' | 'translation' | 'editing' =>
        s === 'analysis' || s === 'translation' || s === 'editing';
      let stages: TranslationStages = 'all';
      if (Array.isArray(stagesRaw) && stagesRaw.length > 0) {
        const arr = stagesRaw.filter(validStage);
        if (arr.length > 0) stages = [...new Set(arr)];
      } else if (stagesRaw === 'all') {
        stages = 'all';
      }

      const hasValidTranslation = (p: { translatedText?: string | null }) => {
        const t = p.translatedText?.trim() || '';
        if (!t.length) return false;
        if (t.startsWith('❌') || isChunkError(t)) return false;
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

      const hasTranslatedText =
        !!chapterForTranslation.translatedText &&
        chapterForTranslation.translatedText.trim().length > 0;
      const hasTranslatedParagraphs = chapterForTranslation.paragraphs?.some(
        (p) => p.translatedText && p.translatedText.trim().length > 0
      );
      req.log?.debug(
        {
          chapterId: chapterForTranslation.id,
          chapterTitle: chapterForTranslation.title,
          status: chapterForTranslation.status,
          hasTranslatedText,
          hasTranslatedParagraphs,
          paragraphsCount: chapterForTranslation.paragraphs?.length ?? 0,
          mode: paragraphIds?.length
            ? `selected (${paragraphIds.length})`
            : translateOnlyEmpty
              ? 'empty only'
              : 'full',
        },
        'Chapter state before translation'
      );

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
      const translateTitles = translateChapterTitles !== false;
      const stagesIncludeTranslation =
        stages === 'all' || (Array.isArray(stages) && stages.includes('translation'));
      let estimatedTokens = estimateTokensForStages(textLength, stages);
      if (translateTitles && stagesIncludeTranslation) {
        estimatedTokens += estimateTokensForChapterTitles(1);
      }

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
        await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);

        // Calculate reset time (next midnight UTC)
        const now = new Date();
        const resetTime = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
        );

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
      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);

      const traceId = createTraceId();
      const requestId = (req as express.Request & { id: string }).id;
      setDebugTraceId(res, traceId);
      req.log?.info(
        {
          event: 'translation.started',
          traceId,
          requestId,
          projectId: req.params.projectId,
          chapterId: req.params.chapterId,
          chapterTitle: chapterForTranslation.title,
          textLength,
          wordCount,
          hasApiKey: !!config.openai.apiKey,
          analysisModel,
          translationModel,
          editingModel,
          temperature: project.settings?.temperature ?? config.translation.temperature,
        },
        `Translation started: ${chapterForTranslation.title} (~${wordCount} words)`
      );

      performTranslation(
        req.params.projectId,
        req.params.chapterId,
        chapterForTranslation,
        project,
        startTime,
        translateOnlyEmpty,
        token,
        req.user!.id,
        paragraphIds,
        stages,
        {
          traceId,
          requestId,
          languagePair: languagePairOverride,
          translateChapterTitles: translateTitles,
        }
      );

      res.json({ status: 'started', chapterId: chapter.id, traceId });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to start translation' });
    }
  }
);

/** Merge chapter number into glossary entries' mentionedInChapters (analysis/translation). */
async function mergeGlossaryAppearanceForChapter(
  projectId: string,
  entryIds: string[],
  chapterNum: number,
  token: string,
  context: { chapterId?: string }
): Promise<void> {
  for (const entryId of entryIds) {
    const entry = await getGlossaryEntry(projectId, entryId, token, {
      useServiceRole: true,
    });
    if (!entry) {
      logger.warn(
        { projectId, entryId, chapterNum, chapterId: context.chapterId },
        'Glossary entry not found for chapter appearance merge'
      );
      continue;
    }
    const merged = [...new Set([...(entry.mentionedInChapters ?? []), chapterNum])].sort(
      (a, b) => a - b
    );
    await updateGlossaryEntry(projectId, entryId, { mentionedInChapters: merged }, token, {
      useServiceRole: true,
    });
  }
}

/**
 * Translation logic - uses arcane-engine.
 * Glossary accumulates per project: new entries from the analysis stage are saved
 * to the project and available for subsequent chapters. Stages (analysis |
 * translation | editing | all) are passed from the API request body.
 * Exported for use by BullMQ worker (runTranslateJob).
 */
export async function performTranslation(
  projectId: string,
  chapterId: string,
  chapter: Chapter,
  project: Project | ProjectWithChapterList,
  startTime: number,
  translateOnlyEmpty: boolean = false,
  token: string,
  userId: string,
  paragraphIds?: string[],
  stages: TranslationStages = 'all',
  options?: {
    externalIsCancelled?: () => boolean;
    /** Called on chunk progress (e.g. for batch job updates) */
    onProgress?: (chunksDone: number, totalChunks: number, stage?: string) => void;
    traceId?: string;
    jobId?: string;
    requestId?: string;
    /** Ephemeral language pair override for this run. */
    languagePair?: LanguagePairOverride;
    /** When false, skip chapter title translation (default: true). */
    translateChapterTitles?: boolean;
    /** When true, skip per-chapter title translation (bulk job runs batch phase 2). */
    deferChapterTitleTranslation?: boolean;
  }
): Promise<void> {
  const traceId = options?.traceId ?? createTraceId();
  return runWithDebugContextAsync(
    {
      traceId,
      requestId: options?.requestId,
      projectId,
      chapterId,
      jobId: options?.jobId,
    },
    async () =>
      performTranslationInner(
        projectId,
        chapterId,
        chapter,
        project,
        startTime,
        translateOnlyEmpty,
        token,
        userId,
        paragraphIds,
        stages,
        options,
        traceId
      )
  );
}

async function performTranslationInner(
  projectId: string,
  chapterId: string,
  chapter: Chapter,
  project: Project | ProjectWithChapterList,
  startTime: number,
  translateOnlyEmpty: boolean,
  token: string,
  userId: string,
  paragraphIds: string[] | undefined,
  stages: TranslationStages,
  options:
    | {
        externalIsCancelled?: () => boolean;
        onProgress?: (chunksDone: number, totalChunks: number, stage?: string) => void;
        jobId?: string;
        languagePair?: LanguagePairOverride;
        translateChapterTitles?: boolean;
        deferChapterTitleTranslation?: boolean;
      }
    | undefined,
  traceId: string
): Promise<void> {
  const cancelKey = translationCancelKey(projectId, chapterId);
  const isCancelled = () =>
    translationCancelRegistry.get(cancelKey) === true || options?.externalIsCancelled?.() === true;
  let savedDraftThisRun = false;

  logger.info(
    {
      event: 'translation.perform_start',
      traceId,
      jobId: options?.jobId,
      projectId,
      chapterId,
      chapterTitle: chapter.title,
      chapterNumber: chapter.number,
      stages,
    },
    `Translation started: "${chapter.title}" (ch. ${chapter.number}), stages: ${Array.isArray(stages) ? stages.join(',') : stages}`
  );

  try {
    if (!chapter) {
      throw new Error('Глава не указана');
    }

    // Use chapter.originalText if set; otherwise derive from paragraphs (e.g. after "mark as translated")
    const effectiveOriginalText =
      chapter.originalText && chapter.originalText.trim().length > 0
        ? chapter.originalText.trim()
        : chapter.paragraphs && chapter.paragraphs.length > 0
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
      logger.warn(
        { projectId, chapterId, chapterTitle: chapter.title },
        'Demo mode: API key not configured'
      );

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

      logger.info(
        {
          event: 'translation.demo_completed',
          projectId,
          chapterId,
          durationMs: Date.now() - startTime,
          paragraphsCount: demoParagraphs.length,
        },
        `Demo translation completed in ${Date.now() - startTime}ms (${demoParagraphs.length} paragraphs)`
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

    logger.info(
      {
        event: 'pipeline.start',
        traceId,
        jobId: options?.jobId,
        projectId,
        chapterId,
        analysisModel,
        translationModel,
        editingModel,
        temperature: projectTemperature,
      },
      'Starting arcane-engine TranslationPipeline'
    );

    // Helper function to check if paragraph has valid translation
    const hasValidTranslation = (p: Paragraph): boolean => {
      const text = p.translatedText?.trim() || '';
      if (text.length === 0) return false;
      // Ignore error messages
      if (text.startsWith('❌') || isChunkError(text)) return false;
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
        logger.info({ projectId, chapterId }, 'No selected paragraphs to translate');
        await updateChapter(projectId, chapterId, { status: 'completed' }, token, {
          useServiceRole: true,
        });
        return;
      }
      const textToTranslate = mergeParagraphsToText(paragraphsToTranslate, 'originalText');
      const markedText = addParagraphMarkers(textToTranslate, paragraphsToTranslate);
      chapterToTranslate = { ...chapterWithOriginal, originalText: markedText };
      translateSubsetOnly = true;
      logger.info(
        {
          projectId,
          chapterId,
          selectedCount: paragraphsToTranslate.length,
          totalParagraphs: (chapterWithOriginal.paragraphs || []).length,
        },
        `Selected paragraphs mode: ${paragraphsToTranslate.length} of ${(chapterWithOriginal.paragraphs || []).length}`
      );
    } else if (translateOnlyEmpty) {
      const paragraphs = chapterWithOriginal.paragraphs || [];
      const emptyParagraphs = paragraphs.filter((p) => !hasValidTranslation(p));

      if (emptyParagraphs.length === 0) {
        logger.info({ projectId, chapterId }, 'No empty paragraphs to translate; skipping');
        await updateChapter(projectId, chapterId, { status: 'completed' }, token, {
          useServiceRole: true,
        });
        return;
      }

      const textToTranslate = mergeParagraphsToText(emptyParagraphs, 'originalText');
      const textLength = textToTranslate.length;
      const wordCount = textToTranslate.split(/\s+/).length;

      logger.info(
        {
          projectId,
          chapterId,
          emptyCount: emptyParagraphs.length,
          totalParagraphs: paragraphs.length,
          textLength,
          wordCount,
          skipCount: paragraphs.length - emptyParagraphs.length,
        },
        `Partial translation: ${emptyParagraphs.length} of ${paragraphs.length} paragraphs (~${wordCount} words)`
      );

      const markedText = addParagraphMarkers(textToTranslate, emptyParagraphs);
      paragraphsToTranslate = emptyParagraphs;

      chapterToTranslate = {
        ...chapterWithOriginal,
        originalText: markedText,
      };
    } else {
      const markedText = addParagraphMarkers(
        chapterWithOriginal.originalText,
        chapterWithOriginal.paragraphs || []
      );
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
      logger.info(
        { projectId, chapterId, chapterTitle: chapter.title },
        'Translation cancelled by user before pipeline start'
      );
      await updateChapter(projectId, chapterId, { status: 'pending' }, token, {
        useServiceRole: true,
      });
      return;
    }

    // Two-phase when both translation and editing: save draft after stage 2, then run stage 3 (refactor 2.1)
    const runEditing =
      (stages === 'all' || (Array.isArray(stages) && stages.includes('editing'))) &&
      (stages === 'all' || (Array.isArray(stages) && stages.includes('translation')));
    const phase1Stages: TranslationStages = runEditing
      ? stages === 'all'
        ? ['analysis', 'translation']
        : Array.isArray(stages)
          ? (stages.filter((s) => s !== 'editing') as ('analysis' | 'translation')[])
          : ['analysis', 'translation']
      : stages;

    let result;
    try {
      const needsExistingText =
        Array.isArray(stages) && stages.includes('editing') && !stages.includes('translation');
      // When runEditing (two-phase): phase 1 gets stages ['analysis','translation']; pipeline cannot
      // infer willRunEditing from runStages. Pass includeGlossaryInTranslation explicitly: when
      // editing will run, default false (omit glossary, 3500 chunks); else default true.
      const phase1IncludeGlossaryInTranslation =
        project.settings?.includeGlossaryInTranslation ?? (runEditing ? false : true);
      result = await translateChapterWithPipeline(projectConfig, project, chapterToTranslate, {
        stages: phase1Stages,
        existingTranslatedText: needsExistingText
          ? chapterWithOriginal.paragraphs?.length
            ? buildMarkedTextFromParagraphs(chapterWithOriginal.paragraphs)
            : chapterWithOriginal.translatedText?.trim() || undefined
          : undefined,
        isCancelled,
        includeGlossaryInAnalysis: project.settings?.includeGlossaryInAnalysis ?? true,
        includeGlossaryInTranslation: phase1IncludeGlossaryInTranslation,
        includeGlossaryInEditing: project.settings?.includeGlossaryInEditing ?? true,
        languagePair: options?.languagePair,
        onProgress: (chunksDone: number, totalChunks: number, stage?: string) => {
          setTranslationProgress(projectId, chapterId, { chunksDone, totalChunks, stage });
          options?.onProgress?.(chunksDone, totalChunks, stage);
        },
      });
    } catch (pipelineError) {
      const errorMessage =
        pipelineError instanceof Error ? pipelineError.message : 'Unknown pipeline error';
      logger.error(
        { err: pipelineError, projectId, chapterId },
        `Pipeline error in translateChapterWithPipeline: ${errorMessage}`
      );
      throw pipelineError;
    }

    // Cancelled after stage 1: save glossary and set status to pending (refactor 2.2)
    if (result.cancelled) {
      logger.info(
        { projectId, chapterId },
        'Translation cancelled after analysis; saving glossary and setting status to pending'
      );
      if (result.glossaryUpdates?.length) {
        for (const entry of result.glossaryUpdates) {
          await addGlossaryEntry(projectId, entry, token, { useServiceRole: true });
        }
      }
      if (result.glossaryUpdatesExisting?.length) {
        for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
          await updateGlossaryEntry(projectId, entryId, updates, token, {
            useServiceRole: true,
          });
        }
      }
      if (result.glossaryAppearanceEntryIds?.length) {
        await mergeGlossaryAppearanceForChapter(
          projectId,
          result.glossaryAppearanceEntryIds,
          chapter.number,
          token,
          { chapterId }
        );
      }
      await updateChapter(projectId, chapterId, { status: 'pending' }, token, {
        useServiceRole: true,
      });
      try {
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage (non-critical)'
        );
      }
      return;
    }

    logger.info(
      {
        event: 'translation.completed',
        traceId,
        jobId: options?.jobId,
        projectId,
        chapterId,
        durationMs: result.duration,
        durationSec: (result.duration / 1000).toFixed(1),
        tokensUsed: result.tokensUsed,
        tokensByStage: result.tokensByStage,
      },
      `Translation completed in ${(result.duration / 1000).toFixed(1)}s (${result.tokensUsed.toLocaleString()} tokens)`
    );

    if (result.glossaryUpdates?.length) {
      logger.info(
        { projectId, chapterId, glossaryUpdatesCount: result.glossaryUpdates.length },
        `Glossary: ${result.glossaryUpdates.length} new entries`
      );
    }

    // stages = ['analysis'] only: save glossary, don't update chapter translation
    if (Array.isArray(stages) && stages.length === 1 && stages[0] === 'analysis') {
      if (result.glossaryUpdates?.length) {
        for (const entry of result.glossaryUpdates) {
          await addGlossaryEntry(projectId, entry, token, { useServiceRole: true });
        }
      }
      if (result.glossaryUpdatesExisting?.length) {
        for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
          await updateGlossaryEntry(projectId, entryId, updates, token, {
            useServiceRole: true,
          });
        }
      }
      if (result.glossaryAppearanceEntryIds?.length) {
        await mergeGlossaryAppearanceForChapter(
          projectId,
          result.glossaryAppearanceEntryIds,
          chapter.number,
          token,
          { chapterId }
        );
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
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage (non-critical)'
        );
      }
      return;
    }

    // Validate translation result
    const isValidTranslationResult =
      result.translatedText &&
      result.translatedText.trim().length > 0 &&
      !isChunkError(result.translatedText);

    const hasValidTokens = result.tokensUsed > 0 || result.duration > 0;

    if (!isValidTranslationResult || (!hasValidTokens && result.duration === 0)) {
      const errorMessage = !isValidTranslationResult
        ? 'Translation empty or contains error'
        : 'Translation finished with no tokens used (possible error)';

      logger.warn(
        {
          projectId,
          chapterId,
          tokensUsed: result.tokensUsed,
          durationMs: result.duration,
          translatedPreview: result.translatedText ? result.translatedText.substring(0, 100) : null,
        },
        `Validation failed: ${errorMessage}`
      );

      const modelInfoOnError =
        stages === 'all'
          ? `${analysisModel}/${translationModel}/${editingModel}`
          : Array.isArray(stages)
            ? stages
                .map((s) =>
                  s === 'analysis'
                    ? analysisModel
                    : s === 'translation'
                      ? translationModel
                      : editingModel
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
            ...(result.chunksCount !== undefined && { chunksCount: result.chunksCount }),
            ...(result.failedChunkIndex !== undefined && {
              failedChunkIndex: result.failedChunkIndex,
            }),
          },
        },
        token,
        { useServiceRole: true }
      );

      // Count tokens toward usage even when translation failed (stages were run)
      if (result.tokensUsed > 0) {
        try {
          await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
            useServiceRole: true,
          });
        } catch (tokenError) {
          logger.warn(
            { err: tokenError, projectId, chapterId },
            'Failed to update token usage (non-critical)'
          );
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
            logger.debug(
              { projectId, chapterId, paragraphsCount: parsedJSON.paragraphs.length },
              `Translation in JSON format with ${parsedJSON.paragraphs.length} paragraphs`
            );
          }
        }
      }
    } catch (jsonError) {
      logger.debug(
        {
          projectId,
          chapterId,
          jsonError: jsonError instanceof Error ? jsonError.message : 'Unknown error',
        },
        'JSON parse failed, using text format'
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

      logger.debug(
        { projectId, chapterId, chunksCount: translatedChunks.length },
        `Translation split into ${translatedChunks.length} chunks for sync (text format)`
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
      logger.debug({ projectId, chapterId }, 'Auto-sync: translation to paragraphs (JSON format)');
      syncedParagraphs = syncTranslationJSONToParagraphs(
        originalParagraphsForSync,
        parsedJSON,
        partialSync
      );
    } else {
      const parsedByMarkers = parseEditedTextByMarkers(result.translatedText);
      if (parsedByMarkers.length > 0) {
        logger.debug(
          { projectId, chapterId, parsedCount: parsedByMarkers.length },
          'Auto-sync: translation to paragraphs (marker format)'
        );
        syncedParagraphs = syncEditedMarkersToParagraphs(
          originalParagraphsForSync,
          parsedByMarkers
        );
        if (!parsedJSON) {
          translatedChunks = syncedParagraphs
            .map((p) => (p.translatedText ?? '').trim())
            .filter(Boolean);
        }
      } else {
        logger.debug(
          { projectId, chapterId },
          'Auto-sync: translation to paragraphs (text format)'
        );
        syncedParagraphs = syncTranslationChunksToParagraphs(
          originalParagraphsForSync,
          translatedChunks,
          partialSync
        );
      }
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
          ? stages
              .map((s) =>
                s === 'analysis'
                  ? analysisModel
                  : s === 'translation'
                    ? translationModel
                    : editingModel
              )
              .join('/')
          : editingModel;

    // Prepare translatedChunks for saving (use from parsedJSON or text-based chunks)
    const chunksToSave =
      parsedJSON && parsedJSON.paragraphs
        ? parsedJSON.paragraphs.map((p) => p.translated)
        : translatedChunks;

    const nowIso = new Date().toISOString();
    const ranAnalysis =
      (typeof phase1Stages === 'string' && phase1Stages === 'all') ||
      (Array.isArray(phase1Stages) && phase1Stages.includes('analysis'));

    if (runEditing) {
      // Refactor 2.1: save draft after stage 2, then run stage 3 (editing)
      await updateChapter(
        projectId,
        chapterId,
        {
          translatedText: result.translatedText,
          translatedChunks: chunksToSave,
          paragraphs: syncedParagraphs,
          status: 'draft',
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed,
            tokensByStage: result.tokensByStage,
            duration: result.duration,
            model: `${analysisModel}/${translationModel}`,
            translatedAt: nowIso,
            lastAnalysisAt: ranAnalysis
              ? nowIso
              : (chapter.translationMeta?.lastAnalysisAt ?? undefined),
            ...(result.chunksCount !== undefined && { chunksCount: result.chunksCount }),
            ...(result.failedChunkIndex !== undefined && {
              failedChunkIndex: result.failedChunkIndex,
            }),
          },
        },
        token,
        { useServiceRole: true }
      );
      savedDraftThisRun = true;
      try {
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage after draft (non-critical)'
        );
      }
      logger.info(
        { projectId, chapterId, chapterTitle: chapter.title },
        'Draft saved; running editing stage'
      );

      // Phase 2: editing only
      let result2;
      try {
        result2 = await translateChapterWithPipeline(projectConfig, project, chapterToTranslate, {
          stages: ['editing'],
          existingTranslatedText: buildMarkedTextFromParagraphs(syncedParagraphs),
          isCancelled,
          languagePair: options?.languagePair,
          onProgress: (chunksDone: number, totalChunks: number, stage?: string) => {
            setTranslationProgress(projectId, chapterId, { chunksDone, totalChunks, stage });
            options?.onProgress?.(chunksDone, totalChunks, stage);
          },
        });
      } catch (phase2Error) {
        logger.error(
          { err: phase2Error, projectId, chapterId },
          'Editing stage failed; draft preserved'
        );
        throw phase2Error;
      }

      const isValidPhase2 =
        result2.translatedText &&
        result2.translatedText.trim().length > 0 &&
        !isChunkError(result2.translatedText);
      if (!isValidPhase2) {
        logger.warn(
          { projectId, chapterId, preview: result2.translatedText?.slice(0, 80) },
          'Editing returned invalid text; keeping draft'
        );
        return;
      }

      // Sync edited text to paragraphs (prefer marker-based 1:1, fallback to chunk sync)
      const currentChapter2 = await getChapter(projectId, chapterId, token, {
        useServiceRole: true,
      });
      const paragraphsForSync2 = translateSubsetOnly
        ? paragraphsToTranslate
        : (currentChapter2?.paragraphs ?? syncedParagraphs);
      const parsedByMarkers = parseEditedTextByMarkers(result2.translatedText);
      let syncedParagraphs2: Paragraph[];
      let editedChunks: string[];
      if (parsedByMarkers.length > 0) {
        syncedParagraphs2 = syncEditedMarkersToParagraphs(paragraphsForSync2, parsedByMarkers);
        editedChunks = syncedParagraphs2
          .map((p) => (p.translatedText ?? '').trim())
          .filter(Boolean);
        logger.debug(
          { parsedCount: parsedByMarkers.length, paragraphCount: paragraphsForSync2.length },
          'Editing sync: used paragraph markers'
        );
      } else {
        editedChunks = result2.translatedText
          .split(/\n\s*\n/)
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        syncedParagraphs2 = syncTranslationChunksToParagraphs(
          paragraphsForSync2,
          editedChunks,
          false
        );
        logger.debug(
          { chunksCount: editedChunks.length },
          'Editing sync: fallback to chunk sync (no markers in response)'
        );
      }
      const finalParagraphs =
        translateSubsetOnly && currentChapter2?.paragraphs
          ? currentChapter2.paragraphs.map((p) => syncedParagraphs2.find((s) => s.id === p.id) ?? p)
          : syncedParagraphs2;
      const translatedTextToStore = mergeParagraphsToText(finalParagraphs, 'translatedText');

      const nowIso2 = new Date().toISOString();
      await updateChapter(
        projectId,
        chapterId,
        {
          translatedText: translatedTextToStore,
          translatedChunks: editedChunks,
          paragraphs: finalParagraphs,
          status: 'completed',
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed + result2.tokensUsed,
            tokensByStage: {
              analysis: result.tokensByStage?.analysis,
              translation: result.tokensByStage?.translation ?? 0,
              editing: result2.tokensByStage?.editing ?? result2.tokensUsed ?? 0,
            },
            duration: result.duration + result2.duration,
            model: `${analysisModel}/${translationModel}/${editingModel}`,
            translatedAt: nowIso2,
            lastAnalysisAt: ranAnalysis ? nowIso2 : chapter.translationMeta?.lastAnalysisAt,
            ...(result.chunksCount !== undefined && { chunksCount: result.chunksCount }),
            ...(result.failedChunkIndex !== undefined && {
              failedChunkIndex: result.failedChunkIndex,
            }),
          },
        },
        token,
        { useServiceRole: true }
      );
      try {
        await incrementTokenUsage(userId, token, result2.tokensUsed, result2.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage after editing (non-critical)'
        );
      }
      logger.info(
        {
          event: 'translation.synced',
          projectId,
          chapterId,
          chapterTitle: chapter.title,
          chunksCount: editedChunks.length,
        },
        `Chapter translated and edited: ${chapter.title}`
      );
      // Fall through to glossary save (phase 1 result has glossary; result2 has none)
    } else {
      // Single phase: save as completed (translation-only or editing-only)
      let translatedTextToSave = result.translatedText;
      let chunksToSaveFinal = chunksToSave;
      let paragraphsToSave = syncedParagraphs;
      const editingOnly =
        Array.isArray(stages) && stages.includes('editing') && !stages.includes('translation');
      if (editingOnly && currentChapter?.paragraphs?.length) {
        const parsedByMarkers = parseEditedTextByMarkers(result.translatedText);
        if (parsedByMarkers.length > 0) {
          paragraphsToSave = syncEditedMarkersToParagraphs(
            currentChapter.paragraphs,
            parsedByMarkers
          );
          translatedTextToSave = mergeParagraphsToText(paragraphsToSave, 'translatedText');
          chunksToSaveFinal = paragraphsToSave
            .map((p) => (p.translatedText ?? '').trim())
            .filter(Boolean);
          logger.debug(
            { parsedCount: parsedByMarkers.length },
            'Editing-only sync: used paragraph markers'
          );
        }
      }
      await updateChapter(
        projectId,
        chapterId,
        {
          translatedText: translatedTextToSave,
          translatedChunks: chunksToSaveFinal,
          paragraphs: paragraphsToSave,
          status: 'completed',
          translationMeta: {
            ...(chapter.translationMeta || {}),
            tokensUsed: result.tokensUsed,
            tokensByStage: result.tokensByStage,
            duration: result.duration,
            model: modelInfo,
            translatedAt: nowIso,
            lastAnalysisAt: ranAnalysis
              ? nowIso
              : (chapter.translationMeta?.lastAnalysisAt ?? undefined),
            ...(result.chunksCount !== undefined && { chunksCount: result.chunksCount }),
            ...(result.failedChunkIndex !== undefined && {
              failedChunkIndex: result.failedChunkIndex,
            }),
          },
        },
        token,
        { useServiceRole: true }
      );
      try {
        await incrementTokenUsage(userId, token, result.tokensUsed, result.tokensByStage, {
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn(
          { err: tokenError, projectId, chapterId },
          'Failed to update token usage (non-critical)'
        );
      }
      logger.info(
        {
          event: 'translation.synced',
          projectId,
          chapterId,
          chapterTitle: chapter.title,
          chunksCount: chunksToSaveFinal.length,
        },
        `Chapter translated and synced: ${chapter.title} (${chunksToSaveFinal.length} chunks)`
      );
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

      logger.debug(
        {
          projectId,
          chapterId,
          savedHasText,
          savedHasChunks,
          savedHasParagraphs,
          syncedCount,
          status: savedChapter.status,
        },
        'Post-save verification'
      );

      if (!savedHasText && !savedHasChunks) {
        logger.warn(
          { projectId, chapterId },
          'Chapter saved but translation and chunks are missing'
        );
      }

      if (savedHasChunks && !savedHasParagraphs) {
        logger.warn(
          { projectId, chapterId },
          'Translation saved in chunks but not synced to paragraphs'
        );
      }
    } else {
      logger.error({ projectId, chapterId }, 'Failed to load saved chapter for verification');
    }

    // Auto-add detected glossary entries (new + updates for existing)
    if (result.glossaryUpdates?.length) {
      for (const entry of result.glossaryUpdates) {
        await addGlossaryEntry(projectId, entry, token, { useServiceRole: true });
      }
    }
    if (result.glossaryUpdatesExisting?.length) {
      for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
        await updateGlossaryEntry(projectId, entryId, updates, token, {
          useServiceRole: true,
        });
      }
    }
    if (result.glossaryAppearanceEntryIds?.length) {
      await mergeGlossaryAppearanceForChapter(
        projectId,
        result.glossaryAppearanceEntryIds,
        chapter.number,
        token,
        { chapterId }
      );
    }

    const translateTitles =
      options?.translateChapterTitles !== false &&
      !options?.deferChapterTitleTranslation &&
      (stages === 'all' || (Array.isArray(stages) && stages.includes('translation')));
    if (translateTitles) {
      const chapterAfter = await getChapter(projectId, chapterId, token, { useServiceRole: true });
      const bodyOk =
        chapterAfter &&
        (chapterAfter.status === 'completed' || chapterAfter.status === 'draft') &&
        (!!chapterAfter.translatedText?.trim() ||
          chapterAfter.paragraphs?.some((p) => p.translatedText?.trim()));
      if (bodyOk && chapterAfter) {
        const candidates = collectTitleTranslationCandidates([chapterAfter], {
          translateChapterTitles: true,
          translateOnlyEmpty,
          stages,
          succeededChapterIds: new Set([chapterId]),
        });
        if (candidates.length > 0) {
          await applyChapterTitleTranslations(config, projectId, project, candidates, {
            userId,
            token,
            languagePair: options?.languagePair,
            isCancelled,
          });
          logger.info(
            { event: 'chapter.title.translated', projectId, chapterId },
            'Chapter title translated'
          );
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    if (errorMessage === 'Cancelled') {
      logger.info(
        { projectId, chapterId, chapterTitle: chapter.title },
        'Translation cancelled by user'
      );
      await updateChapter(projectId, chapterId, { status: 'pending' }, token, {
        useServiceRole: true,
      });
      return;
    }
    // Refactor 2.1: if we saved draft before stage 3 failed, keep draft status so user sees translation
    if (savedDraftThisRun) {
      logger.warn(
        { projectId, chapterId, chapterTitle: chapter.title, errorMessage },
        'Editing stage failed; draft preserved'
      );
      await updateChapter(projectId, chapterId, { status: 'draft' }, token, {
        useServiceRole: true,
      });
      return;
    }
    logger.error(
      {
        err: error,
        projectId,
        chapterId,
        chapterTitle: chapter.title,
        errorMessage,
        stack: errorStack?.substring(0, 500),
      },
      `Translation error: ${errorMessage}`
    );

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

    logger.warn(
      {
        projectId,
        chapterId,
        chapterTitle: chapter.title,
        existingTranslation: !!existingTranslation,
      },
      'Chapter marked as error; existing translation preserved'
    );
  } finally {
    try {
      await invalidateProjectAndRelatedCaches(userId, projectId, token, {
        useServiceRole: true,
      });
    } catch (error) {
      logger.warn({ err: error, userId, projectId }, 'Cache invalidation after translation failed');
    }
    translationCancelRegistry.delete(cancelKey);
    clearTranslationProgress(projectId, chapterId);
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
    logger.warn('syncTranslationToParagraphs: no original paragraphs');
    return [];
  }

  if (!translatedText || translatedText.trim().length === 0) {
    logger.warn('syncTranslationToParagraphs: translated text is empty');
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
    if (text.startsWith('❌') || isChunkError(text)) return false;
    return true;
  };

  logger.debug(
    { originalCount: originalParagraphs.length, translatedPartsCount: translatedParts.length },
    `Sync: ${originalParagraphs.length} original paragraphs, ${translatedParts.length} translated parts`
  );

  // Count empty paragraphs that need translation (excluding separators)
  const emptyParagraphsCount = originalParagraphs.filter(
    (p) => !isSeparatorParagraph(p) && !hasValidTranslation(p)
  ).length;

  if (translatedParts.length !== originalParagraphs.length) {
    logger.debug(
      {
        original: originalParagraphs.length,
        translatedParts: translatedParts.length,
        emptyCount: emptyParagraphsCount,
      },
      'Count mismatch: original vs translated parts'
    );
    if (translatedParts.length !== emptyParagraphsCount) {
      logger.warn(
        { translatedParts: translatedParts.length, emptyParagraphsCount },
        'Translated parts count does not match empty paragraphs count'
      );
    }
  }

  // Map translations to original paragraphs
  // Preserve existing valid translations, only update empty or error paragraphs
  // Use relative index for empty paragraphs instead of direct mapping
  let translationIndex = 0; // Relative index in translatedParts array

  const result = originalParagraphs.map((original) => {
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

  if (translationIndex < translatedParts.length) {
    const unusedCount = translatedParts.length - translationIndex;
    logger.warn(
      { unusedCount, translatedPartsCount: translatedParts.length },
      'Not all translations used; possible format mismatch'
    );
  }

  if (newTranslations < emptyCount && translationIndex >= translatedParts.length) {
    const missingCount = emptyCount - newTranslations;
    logger.warn(
      { newTranslations, emptyCount, missingCount },
      'Not all empty paragraphs received translation'
    );
  }

  logger.debug(
    { translatedCount, total: originalParagraphs.length, preservedCount, newTranslations },
    `Synced: ${translatedCount}/${originalParagraphs.length} paragraphs have translation`
  );

  if (translatedCount === 0 && translatedText.trim().length > 0) {
    logger.error(
      {
        translatedTextLength: translatedText.length,
        translatedPartsLength: translatedParts.length,
        emptyCount,
      },
      'Critical: entire translation lost during sync'
    );
  }

  if (emptyCount > 0 && newTranslations === 0 && translatedText.trim().length > 0) {
    logger.error(
      { emptyCount, translatedPartsLength: translatedParts.length },
      'Translation received but not applied to any paragraph'
    );
  }

  return result;
}

/** Paragraph marker format used for editing stage: --para:{id}-- */
const PARA_MARKER_PREFIX = '--para:';
const PARA_MARKER_SUFFIX = '--';

/**
 * Build a single text with paragraph markers for the editing stage.
 * Each paragraph becomes "--para:{id}--{text}". After editing, parse with parseEditedTextByMarkers.
 */
function buildMarkedTextFromParagraphs(paragraphs: Paragraph[]): string {
  if (!paragraphs?.length) return '';
  const sorted = [...paragraphs].sort((a, b) => a.index - b.index);
  return sorted
    .map((p) => {
      const text = (p.translatedText ?? p.originalText ?? '').trim();
      return `${PARA_MARKER_PREFIX}${p.id}${PARA_MARKER_SUFFIX}${text}`;
    })
    .join('\n\n');
}

/**
 * Parse edited text that contains --para:{id}-- markers into a list of { id, text }.
 * Used after the editing stage to restore 1:1 mapping to paragraphs.
 */
function parseEditedTextByMarkers(text: string): Array<{ id: string; text: string }> {
  const results: Array<{ id: string; text: string }> = [];
  const re = /--para:([^\n]*?)--/g;
  let match: RegExpExecArray | null;
  let lastEnd = 0;
  while ((match = re.exec(text)) !== null) {
    if (results.length > 0) {
      results[results.length - 1].text = text.slice(lastEnd, match.index).trim();
    }
    results.push({ id: match[1].trim(), text: '' });
    lastEnd = match.index + match[0].length;
  }
  if (results.length > 0) {
    results[results.length - 1].text = text.slice(lastEnd).trim();
  }
  return results;
}

/**
 * Map parsed marker-based edits to paragraphs by id. Keeps separators and missing ids unchanged.
 */
function syncEditedMarkersToParagraphs(
  originalParagraphs: Paragraph[],
  parsed: Array<{ id: string; text: string }>
): Paragraph[] {
  const isSeparatorParagraph = (p: Paragraph): boolean => {
    const t = p.originalText.trim();
    if (!t.length) return false;
    return /^[\s*\-_=~#]+$/.test(t);
  };
  const byId = new Map(parsed.map((x) => [x.id, x.text]));
  const now = new Date().toISOString();
  return originalParagraphs.map((p) => {
    if (isSeparatorParagraph(p)) return p;
    const text = byId.get(p.id);
    if (text === undefined) return p;
    return {
      ...p,
      translatedText: text,
      status: 'edited' as const,
      editedAt: now,
      editedBy: 'ai' as const,
    };
  });
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
    logger.warn('syncTranslationChunksToParagraphs: no original paragraphs');
    return [];
  }

  if (!translatedChunks || translatedChunks.length === 0) {
    logger.warn('syncTranslationChunksToParagraphs: no translated chunks');
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
    // Ignore error messages
    if (text.startsWith('❌') || isChunkError(text)) return false;
    return true;
  };

  logger.debug(
    { originalCount: originalParagraphs.length, chunksCount: translatedChunks.length },
    `Chunk sync: ${originalParagraphs.length} original paragraphs, ${translatedChunks.length} chunks`
  );

  // Normalize chunk count to avoid shift/loss: editing often returns more \n\n-separated blocks
  // than paragraphs. Merge excess into the last content chunk so we don't lose the tail.
  const contentParagraphCount = originalParagraphs.filter((p) => !isSeparatorParagraph(p)).length;
  let chunksToUse = translatedChunks;
  if (translatedChunks.length > contentParagraphCount && contentParagraphCount > 0) {
    const head = translatedChunks.slice(0, contentParagraphCount - 1);
    const tail = translatedChunks.slice(contentParagraphCount - 1).join('\n\n');
    chunksToUse = [...head, tail];
    logger.info(
      {
        hadChunks: translatedChunks.length,
        contentParagraphs: contentParagraphCount,
        event: 'chunk_sync.normalized_excess',
      },
      'Chunk sync: merged excess chunks into last paragraph to avoid content loss'
    );
  }

  const emptyParagraphsCount = originalParagraphs.filter(
    (p) => !isSeparatorParagraph(p) && !hasValidTranslation(p)
  ).length;

  if (chunksToUse.length !== originalParagraphs.length) {
    logger.debug(
      {
        original: originalParagraphs.length,
        chunks: chunksToUse.length,
        emptyCount: emptyParagraphsCount,
      },
      'Chunk count mismatch'
    );
    if (chunksToUse.length !== emptyParagraphsCount) {
      logger.warn(
        { translatedChunks: chunksToUse.length, emptyParagraphsCount },
        'Chunk count does not match empty paragraphs count'
      );
    }
  }

  // Map translations to original paragraphs
  // For partial translation: preserve existing valid translations, only update empty or error paragraphs
  // For full translation: update all paragraphs regardless of existing translations
  let translationIndex = 0; // Relative index in chunksToUse array

  const result = originalParagraphs.map((original) => {
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
    if (translationIndex < chunksToUse.length) {
      const translatedChunk = chunksToUse[translationIndex];
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

  if (translationIndex < chunksToUse.length) {
    const unusedCount = chunksToUse.length - translationIndex;
    logger.warn(
      { unusedCount, translatedChunksCount: chunksToUse.length },
      'Not all chunks used; possible format mismatch'
    );
  }

  if (
    !partialTranslation &&
    newTranslations < emptyCount &&
    translationIndex >= chunksToUse.length
  ) {
    const missingCount = emptyCount - newTranslations;
    logger.warn(
      { newTranslations, emptyCount, missingCount },
      'Not all empty paragraphs received translation'
    );
  } else if (partialTranslation && newTranslations < emptyCount) {
    logger.debug(
      { newTranslations, emptyCount, preservedCount },
      `Partial translation: ${newTranslations} of ${emptyCount} empty paragraphs filled`
    );
  }

  logger.debug(
    { translatedCount, total: originalParagraphs.length, preservedCount, newTranslations },
    `Chunk sync done: ${translatedCount}/${originalParagraphs.length} paragraphs have translation`
  );

  if (translatedCount === 0 && chunksToUse.length > 0 && !partialTranslation) {
    logger.error(
      { translatedChunksLength: chunksToUse.length, emptyCount },
      'Critical: entire translation lost during chunk sync'
    );
  }

  if (!partialTranslation && emptyCount > 0 && newTranslations === 0 && chunksToUse.length > 0) {
    logger.error(
      { emptyCount, translatedChunksLength: chunksToUse.length },
      'Translation received but not applied to any paragraph'
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
    logger.warn('syncTranslationJSONToParagraphs: no original paragraphs');
    return [];
  }

  if (!translationJSON || !translationJSON.paragraphs || translationJSON.paragraphs.length === 0) {
    logger.warn('syncTranslationJSONToParagraphs: no translated paragraphs in JSON');
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
    if (text.startsWith('❌') || isChunkError(text)) return false;
    return true;
  };

  logger.debug(
    {
      originalCount: originalParagraphs.length,
      jsonParagraphsCount: translationJSON.paragraphs.length,
    },
    `JSON sync: ${originalParagraphs.length} original, ${translationJSON.paragraphs.length} translated paragraphs`
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

  logger.debug(
    { translationMapSize: translationMap.size },
    `Translation map created: ${translationMap.size} paragraphs`
  );

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

  logger.debug(
    { translatedCount, total: originalParagraphs.length, preservedCount, newTranslations },
    `JSON sync done: ${translatedCount}/${originalParagraphs.length} paragraphs have translation`
  );

  if (newTranslations < emptyCount && !partialTranslation) {
    const missingCount = emptyCount - newTranslations;
    logger.warn(
      { newTranslations, emptyCount, missingCount },
      'Not all paragraphs received translation in JSON sync'
    );
  }

  if (translatedCount === 0 && translationJSON.paragraphs.length > 0 && !partialTranslation) {
    logger.error(
      {
        jsonParagraphsCount: translationJSON.paragraphs.length,
        translationMapSize: translationMap.size,
      },
      'Critical: entire translation lost during JSON sync'
    );
  }

  return result;
}

// OpenAI translation function
/** Legacy OpenAI translation helper; kept for potential direct use. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future use
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

  logger.debug(
    { charCount: chapter.originalText.length },
    `Sending ${chapter.originalText.length} characters for translation`
  );

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

  logger.debug(
    { receivedLength: translatedText.length },
    `Received ${translatedText.length} characters`
  );

  return { text: translatedText, tokensUsed };
}

// ============ Translation Reports ============

app.get('/api/projects/:id/reports-count', requireAuth, requireRole('author'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = requireToken(req);
    const projectId = req.params.id;

    const count = await withRedisCache(
      projectReportsCountCacheKey(projectId),
      CACHE_TTL.redisProjectReportsCountSec,
      () => getTranslationReportsCountByProject(projectId, userId, token)
    );
    res.json({ count });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to get reports count' });
  }
});

app.get('/api/projects/:id/reports', requireAuth, requireRole('author'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = requireToken(req);
    const projectId = req.params.id;

    const reports = await getTranslationReportsByProject(projectId, userId, token);
    res.json(reports);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

app.patch(
  '/api/projects/:id/reports/:reportId',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const token = requireToken(req);
      const projectId = req.params.id;
      const reportId = req.params.reportId;

      const parsed = reportStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      await updateTranslationReportStatus(projectId, reportId, userId, token, parsed.data.status);
      await redisDelMany([projectReportsCountCacheKey(projectId)]);
      res.json({ success: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const msg = error instanceof Error ? error.message : 'Failed to update report';
      res.status(400).json({ error: msg });
    }
  }
);

app.delete(
  '/api/projects/:id/reports/:reportId',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const token = requireToken(req);
      const projectId = req.params.id;
      const reportId = req.params.reportId;

      await deleteTranslationReport(projectId, reportId, userId, token);
      await redisDelMany([projectReportsCountCacheKey(projectId)]);
      res.json({ success: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const msg = error instanceof Error ? error.message : 'Failed to delete report';
      res.status(400).json({ error: msg });
    }
  }
);

// ============ Glossary ============

app.get('/api/projects/:id/glossary', requireAuth, requireRole('author'), async (req, res) => {
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
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to get glossary' });
  }
});

app.post('/api/projects/:id/glossary', requireAuth, requireRole('author'), async (req, res) => {
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

    const parsed = glossaryCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { declensions: declensionsIn, translated: translatedIn, ...rest } = parsed.data;
    let declensions = declensionsIn;
    let translated = translatedIn;

    // Auto-generate declensions for characters using arcane-engine
    if (rest.type === 'character' && rest.original && !declensions) {
      const result = getNameDeclensions(rest.original, rest.gender || 'unknown');

      // Use auto-generated translation if not provided
      if (!translated) {
        translated = result.translatedName;
      }

      // Generate declensions for the translated name
      declensions = result.declensions;

      req.log?.debug({ original: rest.original, declensions }, 'Auto-declension result');
    }

    const entry = await addGlossaryEntry(
      req.params.id,
      {
        ...rest,
        translated: translated ?? rest.original,
        declensions,
      },
      requireToken(req)
    );

    // Clear agent cache to reload glossary
    clearAgentCache(req.params.id);

    if (!entry) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await invalidateProjectAndRelatedCaches(req.user.id, req.params.id, token);
    res.json(entry);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to add glossary entry' });
  }
});

// Update glossary entry (requires auth)
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
      const project = await getProject(req.params.projectId, req.user.id, token);
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
        req.params.projectId,
        req.params.entryId,
        updates,
        token
      );

      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      // Clear agent cache to reload glossary
      clearAgentCache(req.params.projectId);

      req.log?.info(
        {
          event: 'glossary.updated',
          entryId: entry.id,
          original: entry.original,
          translated: entry.translated,
        },
        `Glossary updated: ${entry.original} → ${entry.translated}`
      );

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
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
      const project = await getProject(req.params.projectId, req.user.id, token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const success = await deleteGlossaryEntry(req.params.projectId, req.params.entryId, token);
      if (!success) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      // Clear agent cache
      clearAgentCache(req.params.projectId);

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
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
      const project = await getProject(req.params.projectId, req.user.id, token);
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

      const deletedCount = await deleteGlossaryEntriesBulk(req.params.projectId, entryIds, token);

      clearAgentCache(req.params.projectId);
      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
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
      const model =
        project.settings?.stageModels?.analysis ?? project.settings?.model ?? config.openai.model;
      const suggestions: MergeSuggestion[] = await suggestGlossaryMerges(project.glossary, {
        apiKey: config.openai.apiKey,
        model,
        timeout: config.openai.timeout,
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
      const project = await getProject(req.params.projectId, req.user.id, token);
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

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
      const kept = await getGlossaryEntry(req.params.projectId, primary.id, token);
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

// Upload image to glossary entry gallery (requires auth)
app.post(
  '/api/projects/:projectId/glossary/:entryId/image',
  requireAuth,
  requireRole('author'),
  uploadImage.single('image'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const token = requireToken(req);
      const project = await getProject(req.params.projectId, req.user.id, token);
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
        req.params.projectId,
        req.params.entryId,
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
      clearAgentCache(req.params.projectId);

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
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

// Delete specific image from glossary entry gallery (requires auth)
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
      const project = await getProject(req.params.projectId, req.user.id, token);
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
          req.log?.error({ err }, 'Failed to delete image from storage');
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
        token
      );

      clearAgentCache(req.params.projectId);

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
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
      const project = await getProject(req.params.projectId, req.user.id, token);
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
          req.log?.error({ err }, 'Failed to delete images from storage');
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
        token
      );

      clearAgentCache(req.params.projectId);

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
      res.json({ success: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to delete images');
      res.status(500).json({ error: 'Failed to delete images' });
    }
  }
);

// Upload project cover image (requires auth)
app.post(
  '/api/projects/:projectId/cover',
  requireAuth,
  requireRole('author'),
  uploadImage.single('image'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const token = requireToken(req);
      const project = await getProject(req.params.projectId, req.user.id, token);
      if (!project) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Project not found' });
      }

      // Delete old cover if exists
      if (project.metadata?.coverImageUrl) {
        const oldStoragePath = extractPathFromUrl(project.metadata.coverImageUrl, 'images');
        if (oldStoragePath) {
          await deleteFile('images', oldStoragePath).catch((err) => {
            req.log?.error({ err }, 'Failed to delete old cover');
            // Continue even if deletion fails
          });
        }
      }

      // Upload to Supabase Storage
      const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
      const storagePath = generateUniqueFilename('cover', ext, req.params.projectId);

      const uploadResult = await uploadFile('images', storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
      });

      const coverImageUrl = uploadResult.publicUrl;

      // Update project metadata with new cover
      // Ensure metadata object exists before spreading
      const updatedMetadata = {
        ...(project.metadata || {}),
        coverImageUrl,
      };

      req.log?.info(
        { event: 'cover.upload.start', projectId: req.params.projectId },
        'Uploading cover for project'
      );

      const updatedProject = await updateProject(
        req.params.projectId,
        {
          metadata: updatedMetadata,
        },
        req.user.id,
        token
      );

      if (!updatedProject) {
        // Rollback: delete uploaded file if update failed
        await deleteFile('images', storagePath).catch((err) =>
          logger.error({ err, storagePath }, 'Failed to delete file from storage')
        );
        return res.status(404).json({ error: 'Failed to update project' });
      }

      req.log?.info(
        { event: 'cover.upload.done', projectId: req.params.projectId },
        'Cover saved to project'
      );

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
      res.json({ coverImageUrl, project: updatedProject });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to upload cover image');
      res.status(500).json({ error: 'Failed to upload cover image' });
    }
  }
);

// Delete project cover image (requires auth)
app.delete(
  '/api/projects/:projectId/cover',
  requireAuth,
  requireRole('author'),
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

      // Delete cover image file from Supabase Storage if exists
      if (project.metadata?.coverImageUrl) {
        const storagePath = extractPathFromUrl(project.metadata.coverImageUrl, 'images');
        if (storagePath) {
          await deleteFile('images', storagePath).catch((err) => {
            req.log?.error({ err }, 'Failed to delete cover image');
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
        token
      );

      if (!updatedProject) {
        return res.status(404).json({ error: 'Failed to update project' });
      }

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, token);
      res.json({ success: true, project: updatedProject });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to delete cover image');
      res.status(500).json({ error: 'Failed to delete cover image' });
    }
  }
);

// Update project metadata (e.g. description) (requires auth)
app.put(
  '/api/projects/:projectId/metadata',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const parsed = metadataUpdateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { metadata: metadataUpdates } = parsed.data;

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

      await invalidateProjectAndRelatedCaches(req.user.id, req.params.projectId, requireToken(req));
      res.json(updatedProject);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to update project metadata');
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update project metadata';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// ============ Paragraphs ============

// Get chapter with paragraph stats (requires auth)
app.get(
  '/api/projects/:projectId/chapters/:chapterId/stats',
  requireAuth,
  requireRole('author'),
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

      const stats = getChapterStats(chapter);
      res.json(stats);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to get chapter stats' });
    }
  }
);

// Update single paragraph
// Update chapter title (requires auth)
app.put(
  '/api/projects/:projectId/chapters/:chapterId/title',
  requireAuth,
  requireRole('author'),
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

      const parsed = chapterTitleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { title } = parsed.data;

      const existingChapter = await getChapter(
        req.params.projectId,
        req.params.chapterId,
        requireToken(req)
      );
      if (!existingChapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      const trimmed = title.trim();
      const hasTranslation =
        existingChapter.status === 'completed' ||
        existingChapter.status === 'draft' ||
        !!existingChapter.translatedText?.trim() ||
        existingChapter.paragraphs?.some((p) => p.translatedText?.trim());

      const chapter = await updateChapter(
        req.params.projectId,
        req.params.chapterId,
        hasTranslation ? { translatedTitle: trimmed } : { title: trimmed },
        requireToken(req)
      );

      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      req.log?.info(
        { event: 'chapter.title.updated', chapterId: req.params.chapterId, title: chapter.title },
        `Chapter title updated: "${chapter.title}"`
      );
      await invalidateUserProjectCaches(req.user.id, req.params.projectId);
      res.json(chapter);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to update chapter title');
      res.status(500).json({ error: 'Failed to update chapter title' });
    }
  }
);

// Update chapter number (requires auth)
app.put(
  '/api/projects/:projectId/chapters/:chapterId/number',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parsed = chapterNumberBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { number } = parsed.data;

      const chapter = await updateChapterNumber(
        req.params.projectId,
        req.params.chapterId,
        number,
        requireToken(req)
      );

      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      req.log?.info(
        {
          event: 'chapter.number.updated',
          chapterId: req.params.chapterId,
          chapterTitle: chapter.title,
          number,
        },
        `Chapter number updated: "${chapter.title}" → ${number}`
      );
      await invalidateUserProjectCaches(req.user.id, req.params.projectId);

      // Return updated project with reordered chapters
      // No delay needed - Supabase updates are synchronous within the same connection
      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      res.json(project);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to update chapter number');
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update chapter number';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Update chapter status (requires auth)
app.put(
  '/api/projects/:projectId/chapters/:chapterId/status',
  requireAuth,
  requireRole('author'),
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

      const parsed = chapterStatusBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { status } = parsed.data;

      const chapter = await updateChapterStatus(
        req.params.projectId,
        req.params.chapterId,
        status,
        requireToken(req)
      );

      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      req.log?.info(
        {
          event: 'chapter.status.updated',
          chapterId: req.params.chapterId,
          chapterTitle: chapter.title,
          status,
        },
        `Chapter status updated: "${chapter.title}" → ${status}`
      );
      await invalidateUserProjectCaches(req.user.id, req.params.projectId);

      res.json(chapter);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to update chapter status');
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update chapter status';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Reorder chapters (accepts full ordered ids array)
app.put(
  '/api/projects/:projectId/chapters/order',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

      const parsed = chaptersOrderBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { ids } = parsed.data;

      await updateChaptersOrder(req.params.projectId, ids, requireToken(req));
      await invalidateUserProjectCaches(req.user.id, req.params.projectId);

      // Return updated project
      const project = await getProject(req.params.projectId, req.user.id, requireToken(req));
      res.json(project);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to reorder chapters');
      const message = error instanceof Error ? error.message : 'Failed to reorder chapters';
      res.status(500).json({ error: message });
    }
  }
);

// Update paragraph (requires auth)
app.put(
  '/api/projects/:projectId/chapters/:chapterId/paragraphs/:paragraphId',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      const parsed = paragraphUpdateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { translatedText, status } = parsed.data;

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

      req.log?.debug(
        { paragraphId: paragraph.id.slice(0, 8), status: paragraph.status },
        'Paragraph updated'
      );
      await invalidateUserProjectCaches(req.user!.id, req.params.projectId);
      res.json(paragraph);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to update paragraph' });
    }
  }
);

// ============ Export ============

// Export project to EPUB or FB2 (deprecated – use publication build-exports for published works)
app.post('/api/projects/:id/export', requireAuth, requireRole('author'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = exportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { format, author } = parsed.data;
    const projectId = req.params.id;

    const token = requireToken(req);
    const project = await getProjectFull(projectId, req.user.id, token);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate file in temporary directory
    // On Vercel, only /tmp is writable, so use it explicitly
    // On local, os.tmpdir() works fine
    const tmpDir = process.env.VERCEL ? '/tmp' : os.tmpdir();
    const filename = `${sanitizeFilename(project.name)}-${Date.now()}.${format}`;
    const tmpPath = path.join(tmpDir, filename);

    req.log?.info(
      {
        event: 'export.start',
        projectId: req.params.id,
        projectName: project.name,
        format,
        tmpPath,
        tmpDir,
        vercel: !!process.env.VERCEL,
      },
      `Export started: ${project.name} -> ${format.toUpperCase()}`
    );

    // Ensure tmp directory exists (should already exist on Vercel, but safe to check)
    if (!fs.existsSync(tmpDir)) {
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        req.log?.debug({ tmpDir }, 'Created temp directory');
      } catch (mkdirError: unknown) {
        const msg = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
        req.log?.error({ err: mkdirError, tmpDir }, 'Failed to create temp directory');
        throw new Error(`Не удалось создать временную директорию: ${tmpDir}. Ошибка: ${msg}`);
      }
    } else {
      req.log?.debug({ tmpDir }, 'Temp directory exists');
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
            const ts = Math.max(
              toTimestamp(f.created_at),
              toTimestamp(f.updated_at),
              toTimestamp(f.last_accessed_at)
            );
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
          req.log?.debug(
            { pathsCount: paths.length, folder },
            'Auto-clean exports: deleting old files'
          );
          await deleteFiles('exports', paths);
        }
      } catch (cleanupErr) {
        // Cleanup must never break export itself
        req.log?.warn({ err: cleanupErr }, 'Auto-clean exports failed (continuing)');
      }

      // Export project to temporary file
      req.log?.debug('Generating file...');
      const exportedPath = await exportProject(project, {
        format,
        outputDir: tmpDir,
        filename,
        author,
      });

      req.log?.debug({ exportedPath }, 'File created');

      // Check if file exists
      if (!fs.existsSync(exportedPath)) {
        throw new Error(`Файл не был создан: ${exportedPath}`);
      }

      // Read file as buffer
      req.log?.debug('Reading file...');
      const fileBuffer = fs.readFileSync(exportedPath);
      req.log?.debug({ size: fileBuffer.length }, 'File read');

      // Upload to Supabase Storage (recommended for Vercel)
      const contentType = format === 'epub' ? 'application/epub+zip' : 'application/xml';
      const storagePath = `${projectId}/${filename}`;

      req.log?.debug({ bucket: 'exports', storagePath }, 'Uploading to Supabase Storage');
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
        req.log?.debug('Temp file removed');
      } catch (cleanupError) {
        req.log?.warn({ err: cleanupError }, 'Failed to remove temp file');
      }

      req.log?.info(
        {
          event: 'export.completed',
          projectId,
          projectName: project.name,
          format,
          filename,
          storagePath,
        },
        `Export completed: ${project.name} -> ${format.toUpperCase()} (${filename})`
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
  } catch (error: unknown) {
    req.log?.error({ err: error }, 'Export error');
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Failed to export project' });
  }
});

// Download export file via proxy (Content-Disposition: attachment so browser downloads, not opens)
app.get(
  '/api/projects/:id/export/download',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const projectId = req.params.id;
      const queryResult = exportDownloadQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: queryResult.error.flatten().fieldErrors,
        });
      }
      const pathParam = queryResult.data.path;

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

      const contentType = filename.endsWith('.epub') ? 'application/epub+zip' : 'application/xml';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.send(buffer);
    } catch (error: unknown) {
      if (handleServiceError(error, req, res)) return;
      const msg = error instanceof Error ? error.message : 'Download failed';
      req.log?.error({ err: error }, 'Export download error');
      res.status(500).json({ error: msg });
    }
  }
);

// ============ Publication Build Exports (author: build EPUB/FB2 once, save to publication) ============

app.post(
  '/api/publications/:id/build-exports',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parsed = buildExportsBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const formats = parsed.data.formats ?? ['epub', 'fb2'];

      const pub = await getPublicationBySlugOrId(req.params.id);
      if (!pub) {
        return res.status(404).json({ error: 'Publication not found' });
      }
      if (pub.status !== 'published') {
        return res.status(400).json({ error: 'Publication must be published' });
      }

      const token = requireToken(req);
      const project = await getProject(pub.projectId, req.user.id, token);
      if (!project) {
        return res.status(403).json({ error: 'Forbidden: not the publication owner' });
      }

      const fullProject = await getProjectForPublicationExport(pub.projectId);
      if (!fullProject) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const translatedCount = fullProject.chapters.filter(
        (ch) =>
          (ch.status === 'completed' || ch.status === 'draft') &&
          (ch.translatedText || (ch.paragraphs && ch.paragraphs.some((p) => p.translatedText)))
      ).length;
      if (translatedCount === 0) {
        return res.status(400).json({ error: 'Нет переведенных глав для экспорта' });
      }

      const publicationId = pub.id;
      const tmpDir = process.env.VERCEL ? '/tmp' : os.tmpdir();
      const title = pub.title || fullProject.name;
      const author =
        pub.translatorDisplay || pub.authorDisplay || fullProject.metadata?.authors?.[0];
      const exportBaseName =
        sanitizeFilename(pub.slug || pub.title || fullProject.name || 'book') || 'book';

      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      let epubStoragePath: string | null = null;
      let fb2StoragePath: string | null = null;
      const folder = `publication-${publicationId}`;

      for (const format of formats) {
        if (format !== 'epub' && format !== 'fb2') continue;
        const ext = format;
        const filename = `${exportBaseName}.${ext}`;

        {
          const exportedPath = await exportProject(fullProject, {
            format,
            outputDir: tmpDir,
            filename,
            author: author ?? undefined,
          });

          if (!fs.existsSync(exportedPath)) {
            throw new Error(`Файл не был создан: ${exportedPath}`);
          }

          const fileBuffer = fs.readFileSync(exportedPath);
          const contentType = format === 'epub' ? 'application/epub+zip' : 'application/xml';
          const storagePath = `${folder}/${filename}`;

          await uploadFile('exports', storagePath, fileBuffer, {
            contentType,
            cacheControl: '3600',
            upsert: true,
          });

          if (format === 'epub') epubStoragePath = storagePath;
          else fb2StoragePath = storagePath;

          try {
            fs.unlinkSync(exportedPath);
          } catch {
            /* ignore */
          }
        }
      }

      await updatePublicationExportPaths(publicationId, req.user.id, token, {
        epubStoragePath: formats.includes('epub') ? epubStoragePath : undefined,
        fb2StoragePath: formats.includes('fb2') ? fb2StoragePath : undefined,
      });

      await invalidatePublicationCaches(pub.id, pub.id);
      if (pub.slug) {
        await invalidatePublicationCaches(pub.slug);
      }

      req.log?.info(
        { event: 'build-exports.completed', publicationId, formats },
        `Build exports completed: ${title}`
      );

      const updatedPub = await getPublicationBySlugOrId(req.params.id);
      res.json({
        epubReady: !!updatedPub?.epubStoragePath,
        fb2Ready: !!updatedPub?.fb2StoragePath,
      });
    } catch (error: unknown) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Build exports error');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to build publication exports',
      });
    }
  }
);

// ============ Publication Display Settings (author: toggle showGlossary) ============

app.patch('/api/publications/:id', requireAuth, requireRole('author'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = publicationDisplaySettingsBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No display settings to update' });
    }

    const pub = await getPublicationBySlugOrId(req.params.id);
    if (!pub) {
      return res.status(404).json({ error: 'Publication not found' });
    }
    if (pub.status !== 'published') {
      return res.status(400).json({ error: 'Publication must be published' });
    }

    const token = requireToken(req);
    const project = await getProject(pub.projectId, req.user.id, token);
    if (!project) {
      return res.status(403).json({ error: 'Forbidden: not the publication owner' });
    }

    await updatePublicationDisplaySettings(pub.id, req.user.id, token, data);

    await invalidatePublicationCaches(pub.id, pub.id);
    if (pub.slug) {
      await invalidatePublicationCaches(pub.slug);
    }

    res.json({ success: true });
  } catch (error: unknown) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to update publication';
    res.status(500).json({ error: msg });
  }
});

// ============ Publication Download (user+: download built EPUB/FB2) ============

app.get('/api/publications/:id/download', requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const queryResult = publicationDownloadQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: queryResult.error.flatten().fieldErrors,
      });
    }
    const { format } = queryResult.data;

    const pub = await getPublicationBySlugOrId(req.params.id);
    if (!pub) {
      return res.status(404).json({ error: 'Publication not found' });
    }
    if (pub.status !== 'published') {
      return res.status(404).json({ error: 'Publication not found' });
    }

    const storagePath = format === 'epub' ? pub.epubStoragePath : pub.fb2StoragePath;
    if (!storagePath) {
      return res.status(404).json({ error: 'Export not built yet' });
    }

    const buffer = await downloadFile('exports', storagePath);
    const filename = storagePath.split('/').pop() || `book.${format}`;

    const contentType = format === 'epub' ? 'application/epub+zip' : 'application/xml';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error: unknown) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Download failed';
    req.log?.error({ err: error }, 'Publication download error');
    res.status(500).json({ error: msg });
  }
});

// Cyrillic (Russian/Ukrainian) to Latin transliteration for readable export filenames.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g', // Ukrainian
};
const CYRILLIC_RE = /[\u0400-\u04FF]/;

function transliterateCyrillic(text: string): string {
  return text
    .split('')
    .map((c) => {
      const lower = c.toLowerCase();
      const mapped = CYRILLIC_TO_LATIN[lower];
      if (mapped !== undefined)
        return c === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
      return CYRILLIC_RE.test(c) ? '_' : c;
    })
    .join('');
}

// Helper function to sanitize filename for local FS and Supabase Storage.
// Storage keys must be ASCII-safe (no Cyrillic etc.) to avoid "Invalid key" errors.
// Cyrillic is transliterated to Latin for readable names (e.g. "Зенит Колдовства" -> "Zenit_Koldovstva").
function sanitizeFilename(filename: string): string {
  const transliterated = transliterateCyrillic(filename);
  return (
    transliterated
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/[\u0080-\uFFFF]/g, '_') // Replace remaining non-ASCII for storage compatibility
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, '') // Trim leading/trailing underscores
      .substring(0, 100) || // Limit length
    'export'
  ); // Fallback if empty after sanitization
}

// ============ Publications (public catalog) ============

// Create global public entity (admin only)
app.post(
  '/api/admin/entities',
  requireAuth,
  requireRole('admin'),
  uploadImage.single('photo'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parseResult = publicEntityCreateSchema.safeParse({
        kind: req.body?.kind,
        name: req.body?.name,
        description: req.body?.description,
        photoUrl: req.body?.photoUrl,
      });

      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: parseResult.error.flatten(),
        });
      }

      const token = requireToken(req);
      const { kind, name, description } = parseResult.data;
      let photoUrl = parseResult.data.photoUrl ?? null;
      let uploadedStoragePath: string | null = null;

      if (req.file) {
        const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
        const storagePath = generateUniqueFilename(`public-entity-${kind}`, ext);
        uploadedStoragePath = storagePath;
        const uploaded = await uploadFile('images', storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });
        photoUrl = uploaded.publicUrl;
      }

      try {
        const entity = await createPublicEntity(
          {
            kind,
            name,
            description,
            photoUrl,
            createdBy: req.user.id,
          },
          token
        );
        await invalidatePublicEntitiesCaches();
        res.status(201).json(entity);
      } catch (error) {
        if (uploadedStoragePath) {
          await deleteFile('images', uploadedStoragePath).catch((err) => {
            req.log?.error(
              { err, uploadedStoragePath },
              'Failed to rollback uploaded admin entity photo'
            );
          });
        }
        throw error;
      }
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to create public entity');
      res.status(500).json({ error: 'Failed to create public entity' });
    }
  }
);

// List global public entities (public)
app.get('/api/public/entities', async (req, res) => {
  try {
    const parseResult = publicEntityListQuerySchema.safeParse({
      kind: req.query.kind,
      limit: req.query.limit,
      offset: req.query.offset,
    });

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parseResult.error.flatten(),
      });
    }

    const { kind, search, limit, offset } = parseResult.data;
    const listOptions = { kind, search, limit, offset };
    const entities = search
      ? await listPublicEntities(listOptions)
      : await withRedisCache(publicEntitiesCacheKey(kind), CACHE_TTL.redisPublicEntitiesSec, () =>
          listPublicEntities(listOptions)
        );

    res.json(entities);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to list public entities';
    res.status(500).json({ error: msg });
  }
});

// Get single public entity by id (public)
app.get('/api/public/entities/:id', async (req, res) => {
  try {
    const key = publicEntityCacheKey(req.params.id);
    const cached = await redisGetJson<Awaited<ReturnType<typeof getPublicEntityById>>>(key);
    if (cached) {
      return res.json(cached);
    }
    const entity = await getPublicEntityById(req.params.id);
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }
    await redisSetJson(key, entity, CACHE_TTL.redisPublicEntitySec);
    res.json(entity);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get public entity';
    res.status(500).json({ error: msg });
  }
});

// Update global public entity (admin only)
app.patch(
  '/api/admin/entities/:id',
  requireAuth,
  requireRole('admin'),
  uploadImage.single('photo'),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const entityId = req.params.id;
      const existing = await getPublicEntityById(entityId);
      if (!existing) {
        return res.status(404).json({ error: 'Entity not found' });
      }

      const parseResult = publicEntityUpdateSchema.safeParse({
        name: req.body?.name,
        description: req.body?.description,
        photoUrl: req.body?.photoUrl,
      });

      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: parseResult.error.flatten(),
        });
      }

      const token = requireToken(req);
      const updates: { name?: string; description?: string | null; photoUrl?: string | null } = {};
      if (parseResult.data.name !== undefined) updates.name = parseResult.data.name;
      if (parseResult.data.description !== undefined)
        updates.description = parseResult.data.description;
      let photoUrl: string | null | undefined = parseResult.data.photoUrl;

      // Support removePhoto from FormData
      if (req.body?.removePhoto === 'true' || req.body?.removePhoto === true) {
        photoUrl = null;
      }

      if (req.file) {
        const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
        const storagePath = generateUniqueFilename(`public-entity-${existing.kind}`, ext);
        const uploaded = await uploadFile('images', storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });
        photoUrl = uploaded.publicUrl;
      }

      if (photoUrl !== undefined) updates.photoUrl = photoUrl;

      const entity = await updatePublicEntity(entityId, updates, token);
      await invalidatePublicEntitiesCaches(entityId);
      res.json(entity);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to update public entity');
      res.status(500).json({ error: 'Failed to update public entity' });
    }
  }
);

// Delete global public entity (admin only)
app.delete('/api/admin/entities/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const entityId = req.params.id;
    const existing = await getPublicEntityById(entityId);
    if (!existing) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const usageCount = await countPublicationsUsingEntity(entityId);
    if (usageCount > 0) {
      return res.status(409).json({
        error: 'Entity is used by publications',
        usageCount,
      });
    }

    const token = requireToken(req);
    await deletePublicEntity(entityId, token);
    await invalidatePublicEntitiesCaches(entityId);
    res.status(204).send();
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to delete public entity');
    res.status(500).json({ error: 'Failed to delete public entity' });
  }
});

// Get entity usage count (admin only)
app.get('/api/admin/entities/:id/usage', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const entityId = req.params.id;
    const existing = await getPublicEntityById(entityId);
    if (!existing) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const usageCount = await countPublicationsUsingEntity(entityId);
    res.json({ usageCount });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to get entity usage');
    res.status(500).json({ error: 'Failed to get entity usage' });
  }
});

// List published publications (public, no auth)
app.get('/api/publications', async (req, res) => {
  try {
    const queryResult = publicationsListQuerySchema.safeParse(req.query);
    const params = queryResult.success
      ? {
          limit: Math.min(queryResult.data.limit ?? 50, 100),
          offset: Math.max(0, queryResult.data.offset ?? 0),
          orderBy: queryResult.data.orderBy ?? 'published_at',
          orderAsc: queryResult.data.orderAsc ?? false,
          authorEntityId: queryResult.data.author,
          translatorEntityId: queryResult.data.translator,
          tagEntityId: queryResult.data.tag,
        }
      : {
          limit: 50,
          offset: 0,
          orderBy: 'published_at' as const,
          orderAsc: false,
          authorEntityId: undefined,
          translatorEntityId: undefined,
          tagEntityId: undefined,
        };
    const list = await withRedisCache(
      publicationsListCacheKey({
        limit: params.limit,
        offset: params.offset,
        orderBy: params.orderBy,
        orderAsc: params.orderAsc,
        authorEntityId: params.authorEntityId,
        translatorEntityId: params.translatorEntityId,
        tagEntityId: params.tagEntityId,
      }),
      CACHE_TTL.redisPublicationsListSec,
      () =>
        listPublicationsPublic({
          limit: params.limit,
          offset: params.offset,
          orderBy: params.orderBy,
          orderAsc: params.orderAsc,
          authorEntityId: params.authorEntityId,
          translatorEntityId: params.translatorEntityId,
          tagEntityId: params.tagEntityId,
        })
    );
    res.json(list);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to list publications';
    res.status(500).json({ error: msg });
  }
});

// Get single publication (public)
app.get('/api/publications/:id', async (req, res) => {
  try {
    const pub = await withRedisCache(
      publicationCacheKey(req.params.id),
      CACHE_TTL.redisPublicationSec,
      () => getPublicationBySlugOrId(req.params.id)
    );
    if (!pub) {
      return res.status(404).json({ error: 'Publication not found' });
    }
    res.json(pub);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
  }
});

// Get publication with chapters list (public, for reading page)
app.get('/api/publications/:id/chapters', async (req, res) => {
  try {
    const result = await withRedisCache(
      publicationChaptersCacheKey(req.params.id),
      CACHE_TTL.redisPublicationChaptersSec,
      () => getPublicationWithChapters(req.params.id)
    );
    if (!result) {
      return res.status(404).json({ error: 'Publication not found' });
    }
    res.json(result);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
  }
});

// Get single chapter content for public reading (translated text only)
app.get('/api/publications/:id/chapters/:chapterId', async (req, res) => {
  try {
    const pub = await withRedisCache(
      publicationCacheKey(req.params.id),
      CACHE_TTL.redisPublicationSec,
      () => getPublicationBySlugOrId(req.params.id)
    );
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    const chapter = await withRedisCache(
      publicationChapterCacheKey(pub.id, req.params.chapterId),
      CACHE_TTL.redisPublicationChapterSec,
      () => getPublicationChapterContent(pub.id, req.params.chapterId)
    );
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json(chapter);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get chapter';
    res.status(500).json({ error: msg });
  }
});

// Get publication glossary (public, read-only; returns empty array if not published or hidden by author)
app.get('/api/publications/:id/glossary', async (req, res) => {
  try {
    const pub = await withRedisCache(
      publicationCacheKey(req.params.id),
      CACHE_TTL.redisPublicationSec,
      () => getPublicationBySlugOrId(req.params.id)
    );
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    if (pub.showGlossary === false) {
      res.json([]);
      return;
    }
    const entries = await withRedisCache(
      publicationGlossaryCacheKey(pub.id),
      CACHE_TTL.redisPublicationGlossarySec,
      () => getGlossaryForPublication(pub.id)
    );
    res.json(entries);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get glossary';
    res.status(500).json({ error: msg });
  }
});

// Get read progress for publication (optionalAuth: returns [] for guests)
app.get('/api/publications/:id/read-progress', optionalAuth, async (req, res) => {
  try {
    const pub = await getPublicationBySlugOrId(req.params.id);
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    const publicationId = pub.id;
    const userId = req.user?.id ?? null;
    const token = req.token ?? null;
    const progress = await getReadProgress(publicationId, userId, token);
    res.json({
      chapterIds: progress.chapterIds,
      lastReadChapterId: progress.lastReadChapterId ?? undefined,
      lastReadParagraphIndex: progress.lastReadParagraphIndex,
    });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get read progress';
    res.status(500).json({ error: msg });
  }
});

// Report translation (auth required — spammers can be banned)
app.post('/api/publications/:id/report', requireAuth, async (req, res) => {
  try {
    const slugOrId = req.params.id;
    const pub = await getPublicationBySlugOrId(slugOrId);
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    const parsed = reportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { chapterId, description } = parsed.data;

    const { id } = await createTranslationReport({
      publicationId: pub.id,
      chapterId,
      description,
      reporterUserId: req.user!.id,
      reporterIpHash: null,
    });

    // Invalidate reports count cache for publication's project
    await redisDelMany([projectReportsCountCacheKey(pub.projectId)]);

    res.json({ success: true, id });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to submit report';
    const status = msg.includes('wait') ? 429 : msg.includes('not found') ? 404 : 500;
    res.status(status).json({ error: msg });
  }
});

// Mark chapter as read (auth required)
app.post('/api/publications/:id/chapters/:chapterId/read', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const chapterId = req.params.chapterId;

    const pub = await getPublicationBySlugOrId(req.params.id);
    if (!pub) {
      return res.status(404).json({ error: 'Publication not found' });
    }

    // Verify chapter belongs to publication's project
    const { createServiceRoleClient } = await import('./services/supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data: chapter } = await serviceClient
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .eq('project_id', pub.projectId)
      .single();

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    await markChapterAsRead(userId, pub.id, chapterId, token);
    await redisDelMany([
      readingHistoryCacheKey(userId),
      buildRedisKey(CACHE_PREFIX.userReadingProgress, userId, pub.id),
    ]);
    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to mark chapter as read';
    res.status(500).json({ error: msg });
  }
});

// Update reading position (auth required)
app.patch('/api/publications/:id/reading-position', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const parsed = readingPositionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { chapterId, paragraphIndex = 0 } = parsed.data;

    const pub = await getPublicationBySlugOrId(req.params.id);
    if (!pub) {
      return res.status(404).json({ error: 'Publication not found' });
    }

    const { createServiceRoleClient } = await import('./services/supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data: chapter } = await serviceClient
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .eq('project_id', pub.projectId)
      .single();

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    await updateReadingPosition(userId, pub.id, chapterId, paragraphIndex, token);
    await redisDelMany([
      readingHistoryCacheKey(userId),
      buildRedisKey(CACHE_PREFIX.userReadingProgress, userId, pub.id),
    ]);
    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to update reading position';
    res.status(500).json({ error: msg });
  }
});

// Publish project (auth required)
app.post(
  '/api/projects/:projectId/publish',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const token = req.token!;
      const projectId = req.params.projectId;
      const parsed = publishBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const body = parsed.data;
      const status = body.status ?? 'published';

      // Resolve author/translator from entity IDs if provided (project metadata or body)
      const project = await getProject(projectId, userId, token);
      const authorEntityId = body.authorEntityId ?? project?.metadata?.authorEntityId;
      const translatorEntityId = body.translatorEntityId ?? project?.metadata?.translatorEntityId;

      let authorDisplay = body.authorDisplay;
      let translatorDisplay = body.translatorDisplay ?? req.user!.email;

      if (authorEntityId) {
        try {
          const authorEntity = await getPublicEntityById(authorEntityId);
          if (authorEntity) authorDisplay = authorEntity.name;
        } catch {
          // Keep existing authorDisplay if entity fetch fails
        }
      }
      if (authorDisplay == null && project?.metadata?.authors?.[0]) {
        authorDisplay = project.metadata.authors[0];
      }

      if (translatorEntityId) {
        try {
          const translatorEntity = await getPublicEntityById(translatorEntityId);
          if (translatorEntity) translatorDisplay = translatorEntity.name;
        } catch {
          // Keep existing translatorDisplay if entity fetch fails
        }
      }

      const publication = await createOrUpdatePublication(projectId, userId, token, {
        status,
        title: body.title,
        description: body.description,
        coverImageUrl: body.coverImageUrl,
        authorDisplay: authorDisplay ?? undefined,
        translatorDisplay: translatorDisplay ?? undefined,
        authorEntityId: authorEntityId ?? undefined,
        translatorEntityId: translatorEntityId ?? undefined,
        tagEntityIds: project?.metadata?.tagEntityIds ?? undefined,
        sourceLanguage: body.sourceLanguage,
        targetLanguage: body.targetLanguage,
      });
      await invalidateUserProjectCaches(userId, projectId);
      await invalidatePublicationCaches(publication.id, publication.id);
      if (publication.slug) {
        await invalidatePublicationCaches(publication.slug);
      }
      await invalidatePublicationListCaches();
      res.json(publication);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const msg = error instanceof Error ? error.message : 'Failed to publish';
      res.status(400).json({ error: msg });
    }
  }
);

// Unpublish project (auth required)
app.delete(
  '/api/projects/:projectId/publish',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const token = req.token!;
      const projectId = req.params.projectId;
      const ok = await unpublishProject(projectId, userId, token);
      if (!ok) {
        return res.status(404).json({ error: 'Publication not found' });
      }
      await invalidateUserProjectCaches(userId, projectId);
      await invalidatePublicationListCaches();
      res.json({ success: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const msg = error instanceof Error ? error.message : 'Failed to unpublish';
      res.status(400).json({ error: msg });
    }
  }
);

// Get current user's publications (auth required)
app.get('/api/user/publications', requireAuth, requireRole('author'), async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const list = await getUserPublications(userId, token);
    res.json(list);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get publications';
    res.status(500).json({ error: msg });
  }
});

// Get publication for a project (owner only, auth required).
// Returns 200 with publication or null when project has no publication yet (normal case).
app.get(
  '/api/projects/:projectId/publication',
  requireAuth,
  requireRole('author'),
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const token = req.token!;
      const projectId = req.params.projectId;
      const pub = await getPublicationByProjectId(projectId, userId, token);
      res.json(pub);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const msg = error instanceof Error ? error.message : 'Failed to get publication';
      res.status(500).json({ error: msg });
    }
  }
);

// ============ Debug log viewer (dev only) ============

registerDebugRoutes(app);

// ============ SEO: robots.txt & sitemap.xml ============
// Vercel rewrites /robots.txt → /api/robots, /sitemap.xml → /api/sitemap.
// Express receives /api/robots and /api/sitemap, so we need both route sets.

function sendRobotsTxt(req: express.Request, res: express.Response): void {
  const base = `${req.protocol}://${req.get('host') || 'localhost'}`;
  res.type('text/plain').send(
    `User-agent: *
Allow: /
Disallow: /profile
Disallow: /projects
Disallow: /admin

Sitemap: ${base}/sitemap.xml
`
  );
}

const SITEMAP_CHAPTER_PUBS_LIMIT = 100;

async function sendSitemapXml(req: express.Request, res: express.Response): Promise<void> {
  const base = getPublicBaseUrl(req);
  let pubUrls = '';
  let chapterUrls = '';
  try {
    const pubs = await listPublicationsPublic({ limit: 1000 });
    for (const p of pubs) {
      const pubPath = (p as { slug?: string | null }).slug || p.id;
      const lastmod = p.updatedAt
        ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>
    `
        : '';
      pubUrls += `  <url>
    <loc>${escapeHtml(base + '/p/' + pubPath)}</loc>
    ${lastmod}<changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    }
    for (let i = 0; i < Math.min(pubs.length, SITEMAP_CHAPTER_PUBS_LIMIT); i++) {
      const p = pubs[i];
      const pubPath = (p as { slug?: string | null }).slug || p.id;
      try {
        const data = await getPublicationWithChapters(pubPath);
        if (!data?.chapters?.length) continue;
        const firstTranslated = data.chapters.find((c) => c.hasTranslation);
        if (!firstTranslated) continue;
        const lastmod = p.updatedAt
          ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>
    `
          : '';
        chapterUrls += `  <url>
    <loc>${escapeHtml(base + '/p/' + pubPath + '/chapters/' + firstTranslated.id + '/reading')}</loc>
    ${lastmod}<changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
      } catch {
        /* skip on error */
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load publications for sitemap');
  }
  const staticPages = ['/about', '/contact', '/privacy', '/terms', '/catalog']
    .map(
      (p) => `  <url>
    <loc>${escapeHtml(base + p)}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
`
    )
    .join('');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(base + '/')}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${staticPages}${pubUrls}${chapterUrls}</urlset>
`
  );
}

app.get('/robots.txt', sendRobotsTxt);
app.get('/sitemap.xml', (req, res, next) => sendSitemapXml(req, res).catch(next));

// Vercel rewrites: /robots.txt → /api/robots, /sitemap.xml → /api/sitemap
app.get('/api/robots', sendRobotsTxt);
app.get('/api/sitemap', (req, res, next) => sendSitemapXml(req, res).catch(next));

// ============ SEO: Publication pages with dynamic meta ============

async function servePublicationHtml(
  req: express.Request,
  res: express.Response,
  publicationId: string,
  chapterId?: string
): Promise<void> {
  const base = getPublicBaseUrl(req);
  const indexPath = fs.existsSync(path.join(clientPath, 'index.html'))
    ? path.join(clientPath, 'index.html')
    : path.join(publicPath, 'index.html');

  const data = await getPublicationWithChapters(publicationId);
  if (!data) {
    res.sendFile(indexPath);
    return;
  }

  const pub = data.publication;
  const pubPath = (pub as { slug?: string | null }).slug || publicationId;
  const title = pub.title || 'Publication';
  const baseDesc =
    pub.description || (pub.authorDisplay ? `${title} by ${pub.authorDisplay}` : title);
  const pageUrl = chapterId
    ? `${base}/p/${pubPath}/chapters/${chapterId}/reading`
    : `${base}/p/${pubPath}`;

  let pageTitle = title;
  let pageDesc = baseDesc;
  if (chapterId) {
    const ch = data.chapters.find((c) => c.id === chapterId);
    if (ch) {
      pageTitle = `${ch.title || `Chapter ${ch.number}`} — ${title}`;
      pageDesc = `${ch.title || `Chapter ${ch.number}`} of ${title}`;
    }
  } else {
    const hasBuiltExports = !!(pub.epubStoragePath || pub.fb2StoragePath);
    pageDesc = hasBuiltExports
      ? `${pageDesc} Читать онлайн или скачать EPUB, FB2.`
      : `${pageDesc} Читать онлайн.`;
  }

  const hasExport = !!(pub.epubStoragePath || pub.fb2StoragePath);
  const publicationUrl = `${base}/p/${pubPath}`;

  let html = fs.readFileSync(indexPath, 'utf-8');
  html = injectPublicationMeta(html, {
    title: pageTitle,
    description: pageDesc,
    imageUrl: pub.coverImageUrl,
    pageUrl,
    isChapter: !!chapterId,
  });
  html = injectPublicationContent(html, {
    title: pageTitle,
    description: pageDesc,
    authorDisplay: pub.authorDisplay,
    translatorDisplay: pub.translatorDisplay,
    pageUrl,
    publicationUrl,
    hasExport,
  });
  html = injectPublicationJsonLd(html, {
    title: pageTitle,
    description: pageDesc,
    url: pageUrl,
    imageUrl: pub.coverImageUrl,
    authorDisplay: pub.authorDisplay,
    translatorDisplay: pub.translatorDisplay,
    targetLanguage: pub.targetLanguage,
    numberOfPages: data.chapters?.length ?? 0,
  });
  const catalogUrl = `${base}/catalog`;
  const ch = chapterId ? data.chapters.find((c) => c.id === chapterId) : null;
  html = injectBreadcrumbJsonLd(html, {
    baseUrl: base,
    catalogUrl,
    publicationName: title,
    publicationUrl: `${base}/p/${pubPath}`,
    chapterName: ch ? ch.title || `Chapter ${ch.number}` : undefined,
    chapterUrl: chapterId ? pageUrl : undefined,
  });
  res.type('html').send(html);
}

app.get('/p/:publicationId', (req, res, next) => {
  servePublicationHtml(req, res, req.params.publicationId).catch(next);
});

app.get('/p/:publicationId/chapters/:chapterId/reading', (req, res, next) => {
  servePublicationHtml(req, res, req.params.publicationId, req.params.chapterId).catch(next);
});

// ============ Error Handler ============

app.use(serviceUnavailableErrorHandler);

// ============ SEO: Static pages with dynamic meta ============
// Serve /, /catalog, /about, /contact, /privacy, /terms with unique title, description, canonical

const STATIC_SEO_PATHS = ['/', '/catalog', '/about', '/contact', '/privacy', '/terms'];

for (const p of STATIC_SEO_PATHS) {
  app.get(p, (req, res) => {
    serveStaticPageHtml(req, res, p === '/' ? '/' : p);
  });
}

// ============ SPA Fallback ============

app.get('*', (_req, res) => {
  const indexPath = fs.existsSync(path.join(clientPath, 'index.html'))
    ? path.join(clientPath, 'index.html')
    : path.join(publicPath, 'index.html');
  res.sendFile(indexPath);
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
      void startDebugLogSubscriber((entry) => {
        addDebugLogEntry(entry);
      });
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
