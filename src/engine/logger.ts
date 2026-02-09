/**
 * Engine logging helper.
 * All engine code should use this instead of console.* or importing the app logger directly.
 * If you migrate to another logging system, replace only this file.
 *
 * API: log.debug(msg, data?), log.info(msg, data?), log.warn(msg, data?), log.error(msg, data? | err?)
 * Messages must be in English.
 */

import { logger as appLogger } from '../logger.js';

function errorToObject(err: Error): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    err,
    errMessage: err.message,
    errName: err.name,
  };
  if ('type' in err && typeof (err as { type: string }).type === 'string') {
    obj.errType = (err as { type: string }).type;
  }
  return obj;
}

function withData(
  msg: string,
  data?: Record<string, unknown> | Error
): [Record<string, unknown>, string] {
  if (data instanceof Error) {
    return [{ ...errorToObject(data) }, msg];
  }
  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    return [data as Record<string, unknown>, msg];
  }
  return [{}, msg];
}

export const log = {
  debug(msg: string, data?: Record<string, unknown>): void {
    const [obj, m] = withData(msg, data);
    appLogger.debug(obj, m);
  },

  info(msg: string, data?: Record<string, unknown>): void {
    const [obj, m] = withData(msg, data);
    appLogger.info(obj, m);
  },

  warn(msg: string, data?: Record<string, unknown> | Error): void {
    const [obj, m] = withData(msg, data);
    appLogger.warn(obj, m);
  },

  error(msg: string, data?: Record<string, unknown> | Error): void {
    const [obj, m] = withData(msg, data);
    appLogger.error(obj, m);
  },
};
