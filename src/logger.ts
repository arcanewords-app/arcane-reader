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
 */

import { PassThrough } from 'node:stream';
import pino from 'pino';
import { addDebugLogEntry } from './debug/buffer.js';

const isProduction = process.env.NODE_ENV === 'production';
const level = (process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')).toLowerCase();

function isLogShippingEnabled(): boolean {
  const flag = process.env.LOG_SHIPPING;
  return flag === '1' || flag === 'true';
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- dynamic require for optional dev dependency
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

function createProductionLogger(): pino.Logger {
  const token = process.env.AXIOM_TOKEN?.trim();
  const dataset = process.env.AXIOM_DATASET?.trim();

  if (isLogShippingEnabled() && !token) {
    // eslint-disable-next-line no-console -- boot-time config warning before logger is ready
    console.warn('[logger] LOG_SHIPPING is enabled but AXIOM_TOKEN is missing; using stdout only');
  }

  if (isProduction && isLogShippingEnabled() && token && dataset) {
    return pino(
      baseOptions,
      pino.transport({
        targets: [
          { target: 'pino/file', options: { destination: 1 } },
          {
            target: '@axiomhq/pino',
            options: { dataset, token },
          },
        ],
      })
    );
  }

  return pino(baseOptions, pino.destination(1));
}

const base = isProduction ? createProductionLogger() : pino(baseOptions, createDevStream());

/** Default app logger. Use req.log in request handlers when available. */
export const logger = base;

export type AppLogger = pino.Logger;

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
