import type { Application } from 'express';
import type { RouteDeps } from './deps.js';
import { registerAuthRoutes } from './auth.js';
import { registerUserRoutes } from './user.js';
import { registerProjectRoutes } from './projects.js';
import { registerChapterRoutes } from './chapters.js';
import { registerChapterImportRoutes } from './chapterImport.js';
import { registerChapterReportRoutes } from './chapterReports.js';
import { registerGlossaryRoutes } from './glossary.js';
import { registerPublicationRoutes } from './publications.js';
import { registerAdminRoutes } from './admin.js';
import { registerTranslationRequestBoardRoutes } from './translationRequestBoard.js';

export function registerAllApiRoutes(app: Application, deps: RouteDeps): void {
  registerAuthRoutes(app, deps);
  registerUserRoutes(app, deps);
  registerProjectRoutes(app, deps);
  registerChapterRoutes(app, deps);
  registerChapterImportRoutes(app, deps);
  registerChapterReportRoutes(app);
  registerGlossaryRoutes(app, deps);
  registerPublicationRoutes(app, deps);
  registerTranslationRequestBoardRoutes(app, deps);
  registerAdminRoutes(app, deps);
}

export type { RouteDeps } from './deps.js';
