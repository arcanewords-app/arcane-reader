/**
 * Structured logger — local first, Axiom shipping in production when enabled.
 * All log messages must be in English.
 *
 * Usage:
 *   import { logger } from './logger.js';
 *   logger.info('Server started');
 *   logger.info({ event: 'translation.completed', chapterId }, 'Translation done');
 *
 * With request context (use req.log in handlers after requestContext middleware):
 *   req.log.info('Processing chapter');
 *
 * Production remote shipping: LOG_SHIPPING=1 + AXIOM_TOKEN + AXIOM_DATASET (see env.example.txt).
 * Uses main-thread multistream (no worker threads) for Vercel serverless compatibility.
 */

import { PassThrough, Writable } from 'node:stream';
import { Axiom } from '@axiomhq/js';
import pino from 'pino';
import { addDebugLogEntry } from './debug/buffer.js';

const isProduction = process.env.NODE_ENV === 'production';
const level = (process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')).toLowerCase();

const axiomToken = process.env.AXIOM_TOKEN?.trim();
const axiomDataset = process.env.AXIOM_DATASET?.trim();
const logShippingEnabled =
  isProduction && isLogShippingFlagSet() && Boolean(axiomToken) && Boolean(axiomDataset);

/** Shared Axiom client for ingest + flush (main thread, serverless-safe). */
let axiomClient: Axiom | null = null;

function isLogShippingFlagSet(): boolean {
  const flag = process.env.LOG_SHIPPING;
  return flag === '1' || flag === 'true';
}

function isLogShippingRequested(): boolean {
  return isLogShippingFlagSet();
}

function resolveDeployEnv(): string {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV;
  if (process.env.ARCANE_ENV) return process.env.ARCANE_ENV;
  return isProduction ? 'production' : 'development';
}

function resolveService(): 'api' | 'worker' {
  return process.env.RUN_AS_WORKER === '1' ? 'worker' : 'api';
}

function resolveVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha && sha.length >= 7) return sha.slice(0, 7);
  return 'local';
}

/** Map Pino numeric level to string label (matches @axiomhq/pino). */
function mapLogLevel(levelValue: string | number): string {
  if (typeof levelValue === 'string') return levelValue;

  if (levelValue <= 10) return 'trace';
  if (levelValue <= 20) return 'debug';
  if (levelValue <= 30) return 'info';
  if (levelValue <= 40) return 'warn';
  if (levelValue <= 50) return 'error';
  if (levelValue <= 60) return 'fatal';
  return 'silent';
}

/**
 * Error serializer: in production, omit stack trace to avoid leaking file paths.
 * Stack traces can reveal server structure and are a security concern in shared logs.
 */
function serializeError(err: unknown): Record<string, unknown> | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as Error & { code?: string };
  const base: Record<string, unknown> = {
    type: e.name || 'Error',
    message: e.message ?? String(err),
  };
  if (e.code) base.code = e.code;
  if (!isProduction && e.stack) base.stack = e.stack;
  return base;
}

const baseOptions: pino.LoggerOptions = {
  level,
  base: {
    service: resolveService(),
    env: resolveDeployEnv(),
    version: resolveVersion(),
  },
  serializers: {
    err: serializeError,
    error: serializeError,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

function createDevStream(): pino.DestinationStream {
  // Tee: pino -> passThrough -> pino-pretty; on data push copy to debug buffer for /debug page
  const passThrough = new PassThrough();
  passThrough.on('data', (chunk: Buffer | string) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    str
      .split('\n')
      .filter(Boolean)
      .forEach((line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          addDebugLogEntry(parsed as Parameters<typeof addDebugLogEntry>[0]);
        } catch {
          // ignore non-JSON or parse errors
        }
      });
  });
  try {
    const pretty = require('pino-pretty')({
      colorize: true,
      translateTime: 'SYS:standard',
      levelFirst: true,
      customColors: 'fatal:red,error:red,warn:yellow,info:green,debug:cyan,trace:gray',
      errorLikeObjectKeys: ['err', 'error'],
    });
    passThrough.pipe(pretty).pipe(process.stdout);
  } catch {
    passThrough.pipe(process.stdout);
  }
  return passThrough;
}

function resolveAxiomClientOptions(token: string): {
  token: string;
  url?: string;
  edge?: string;
  onError: (error: Error) => void;
} {
  const url = process.env.AXIOM_URL?.trim();
  const edge = process.env.AXIOM_EDGE?.trim();
  const region = process.env.AXIOM_REGION?.trim()?.toLowerCase();

  let resolvedUrl = url;
  let resolvedEdge = edge;

  if (!resolvedUrl && !resolvedEdge && region === 'eu') {
    resolvedUrl = 'https://api.eu.axiom.co';
    resolvedEdge = 'eu-central-1.aws.edge.axiom.co';
  }

  return {
    token,
    ...(resolvedUrl ? { url: resolvedUrl } : {}),
    ...(resolvedEdge ? { edge: resolvedEdge } : {}),
    onError: (error: Error) => {
      console.error('[logger] Axiom ingest error:', error.message);
    },
  };
}

function createAxiomWritableStream(token: string, dataset: string): Writable {
  axiomClient = new Axiom(resolveAxiomClientOptions(token));

  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      try {
        const str = typeof chunk === 'string' ? chunk : chunk.toString();
        for (const line of str.split('\n').filter(Boolean)) {
          const obj = JSON.parse(line) as Record<string, unknown> & {
            time?: string | number;
            level?: string | number;
          };
          const { time, level: levelField, ...rest } = obj;
          axiomClient?.ingest(dataset, {
            _time: time,
            level: mapLogLevel(levelField ?? 'info'),
            ...rest,
          });
        }
        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}

function createProductionLogger(): pino.Logger {
  if (isLogShippingRequested() && !axiomToken) {
    console.warn('[logger] LOG_SHIPPING is enabled but AXIOM_TOKEN is missing; using stdout only');
  }

  if (isLogShippingRequested() && axiomToken && !axiomDataset) {
    console.warn(
      '[logger] LOG_SHIPPING is enabled but AXIOM_DATASET is missing; using stdout only'
    );
  }

  if (logShippingEnabled && axiomToken && axiomDataset) {
    const axiomStream = createAxiomWritableStream(axiomToken, axiomDataset);
    const streams = [{ stream: pino.destination(1) }, { stream: axiomStream }];
    return pino(baseOptions, pino.multistream(streams));
  }

  return pino(baseOptions, pino.destination(1));
}

const base = isProduction ? createProductionLogger() : pino(baseOptions, createDevStream());

if (isProduction) {
  base.info(
    {
      event: 'logger.initialized',
      logShipping: logShippingEnabled,
      axiomDataset: logShippingEnabled ? axiomDataset : undefined,
      transport: logShippingEnabled ? 'multistream-main-thread' : 'stdout-only',
    },
    'Logger initialized'
  );
}

/** Default app logger. Use req.log in request handlers when available. */
export const logger = base;

export type AppLogger = pino.Logger;

export interface LoggingStatus {
  shippingEnabled: boolean;
  axiomConfigured: boolean;
  dataset: string | null;
  transport: 'multistream-main-thread' | 'stdout-only';
  axiomUrlConfigured: boolean;
  axiomEdgeConfigured: boolean;
  axiomRegion: string | null;
}

/** Non-secret logging config for /api/status and ops checks. */
export function getLoggingStatus(): LoggingStatus {
  const region = process.env.AXIOM_REGION?.trim()?.toLowerCase() ?? null;
  return {
    shippingEnabled: logShippingEnabled,
    axiomConfigured: logShippingEnabled,
    dataset: logShippingEnabled ? (axiomDataset ?? null) : null,
    transport: logShippingEnabled ? 'multistream-main-thread' : 'stdout-only',
    axiomUrlConfigured: Boolean(process.env.AXIOM_URL?.trim()),
    axiomEdgeConfigured: Boolean(process.env.AXIOM_EDGE?.trim()),
    axiomRegion: region,
  };
}

/**
 * Flush buffered Axiom ingest batches. Call after HTTP response on serverless
 * so logs are not lost when the function freezes.
 */
export async function flushLogs(): Promise<void> {
  if (!axiomClient) return;
  try {
    await axiomClient.flush();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error('[logger] Axiom flush error:', message);
  }
}

/**
 * Create a request-scoped child logger (adds requestId, optionally userId to every log).
 * Used by requestContext middleware; cloud services filter by requestId / traceId fields.
 */
export function createRequestLogger(bindings: {
  requestId: string;
  userId?: string;
  [key: string]: unknown;
}): AppLogger {
  return base.child(bindings);
}
