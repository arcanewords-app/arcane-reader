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

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const level = (process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')).toLowerCase();

function createStream(): pino.DestinationStream {
  if (isProduction) {
    return pino.destination(1); // stdout, JSON
  }
  // Development: pretty print (pino-pretty is devDependency)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pretty = require('pino-pretty');
    return pretty({
      colorize: true,
      translateTime: 'SYS:standard',
    });
  } catch {
    return pino.destination(1);
  }
}

const base = pino(
  {
    level,
    base: undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  createStream()
);

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
