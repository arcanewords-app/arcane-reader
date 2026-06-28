import type { Application } from 'express';
import type { RouteDeps } from './deps.js';
import { registerAuthRoutes } from './auth.js';
import { registerUserRoutes } from './user.js';
import { registerProjectRoutes } from './projects.js';
import { registerChapterRoutes } from './chapters.js';
import { registerGlossaryRoutes } from './glossary.js';
import { registerPublicationRoutes } from './publications.js';
import { registerAdminRoutes } from './admin.js';

export function registerAllApiRoutes(app: Application, deps: RouteDeps): void {
  registerAuthRoutes(app, deps);
  registerUserRoutes(app, deps);
  registerProjectRoutes(app, deps);
  registerChapterRoutes(app, deps);
  registerGlossaryRoutes(app, deps);
  registerPublicationRoutes(app, deps);
  registerAdminRoutes(app, deps);
}

export type { RouteDeps } from './deps.js';
