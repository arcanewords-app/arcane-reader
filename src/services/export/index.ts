/**
 * Export service - unified interface for EPUB and FB2 export
 */

import type { Project } from '../../storage/database.js';
import { prepareProjectForExport } from './common.js';
import { exportToEpub } from './epub.js';
import { exportToFb2 } from './fb2.js';

export type ExportFormat = 'epub' | 'fb2';

export interface ExportOptions {
  format: ExportFormat;
  outputDir?: string;
  filename?: string;
  author?: string;
}

/**
 * Export project to specified format
 */
export async function exportProject(
  project: Project,
  options: ExportOptions
): Promise<string> {
  // Prepare project data
  const exportData = prepareProjectForExport(project, options.author);

  // Check if there are any chapters to export
  if (exportData.chapters.length === 0) {
    throw new Error('Нет переведенных глав для экспорта');
  }

  // Export based on format
  switch (options.format) {
    case 'epub':
      return await exportToEpub(exportData, {
        outputDir: options.outputDir,
        filename: options.filename,
      });
    case 'fb2':
      return await exportToFb2(exportData, {
        outputDir: options.outputDir,
        filename: options.filename,
      });
    default:
      throw new Error(`Неподдерживаемый формат: ${options.format}`);
  }
}
