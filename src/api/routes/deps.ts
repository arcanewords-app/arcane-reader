import type multer from 'multer';
import type { AppConfig } from '../../config.js';
import type { ImportJobStore } from '../../services/importJobStore.js';
import type { AnalysisJobStore } from '../../services/analysisJobStore.js';
import type { TranslateJobStore } from '../../services/translateJobStore.js';

export type ConfigValidation = {
  valid: boolean;
  errors: string[];
};

export type RouteDeps = {
  config: AppConfig;
  configValidation: ConfigValidation;
  upload: multer.Multer;
  uploadGlossaryFile: multer.Multer;
  uploadImage: multer.Multer;
  uploadAvatar: multer.Multer;
  importJobStore: ImportJobStore;
  analysisJobStore: AnalysisJobStore;
  translateJobStore: TranslateJobStore;
};
