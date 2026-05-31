/**
 * Structured logger — local first, ready for cloud transport later.
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
 * Adding a cloud transport later (without changing call sites):
 * - Use pino.transport({ targets: [{ target: 'pino/file', options: { destination: 1 } }, { target: 'pino-axiom', options: { ... } }] })
 *   or a custom stream that POSTs batches to your log service. Put API keys in env.
 */

import { PassThrough } from 'node:stream';
import pino from 'pino';
import { addDebugLogEntry } from './debug/buffer.js';

const isProduction = process.env.NODE_ENV === 'production';
const level = (process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')).toLowerCase();

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
  base: undefined,
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

const base = isProduction
  ? pino(baseOptions, pino.destination(1))
  : pino(baseOptions, createDevStream());

/** Default app logger. Use req.log in request handlers when available. */
export const logger = base;

export type AppLogger = pino.Logger;

/**
 * Create a request-scoped child logger (adds requestId, optionally userId to every log).
 * Used by requestContext middleware; later cloud services can filter by requestId.
 */
export function createRequestLogger(bindings: {
  requestId: string;
  userId?: string;
  [key: string]: unknown;
}): AppLogger {
  return base.child(bindings);
}
