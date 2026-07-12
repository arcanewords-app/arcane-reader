import { generateUniqueFilename } from '../../../services/storage.js';
import type { CoverPathBuilder } from './importPipeline.js';

export const buildImportCoverPath: CoverPathBuilder = (projectId, mimeType) =>
  generateUniqueFilename('cover', mimeType.split('/')[1] || 'jpg', projectId);
