import type { RequestHandler } from 'express';

/** Normalize multer middleware for Express typings (monorepo may hoist duplicate @types/express). */
export function asUploadMiddleware(middleware: unknown): RequestHandler {
  return middleware as RequestHandler;
}
