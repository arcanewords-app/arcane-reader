/**
 * EPUB export module
 * Generates EPUB files using epub-gen library
 */

import path from 'path';
import fs from 'fs';
import Epub from 'epub-gen';
import type { ExportProject } from './common.js';

export interface EpubExportOptions {
  outputDir?: string;
  filename?: string;
}

/**
 * Export project to EPUB format
 */
export async function exportToEpub(
  project: ExportProject,
  options: EpubExportOptions = {}
): Promise<string> {
  const outputDir = options.outputDir || './data/exports';
  const filename = options.filename || `${sanitizeFilename(project.title)}.epub`;
  const outputPath = path.join(outputDir, filename);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Prepare content for epub-gen
  const content = project.chapters.map(chapter => ({
    title: chapter.title,
    data: chapter.htmlContent,
  }));

  // Prepare EPUB options
  const epubOptions: any = {
    title: project.title,
    author: project.author || 'Переведено Arcane',
    lang: project.language || 'ru',
    content: content,
    output: outputPath,
  };

  // Add optional metadata
  if (project.metadata?.translatedAt) {
    epubOptions.publisher = 'Arcane Translator';
    // epub-gen doesn't have built-in date field, but we can add it to description
    epubOptions.description = `Переведено: ${new Date(project.metadata.translatedAt).toLocaleDateString('ru-RU')}`;
  }

  // Generate EPUB
  await new Epub(epubOptions).promise;

  return outputPath;
}

/**
 * Sanitize filename - remove invalid characters
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 100); // Limit length
}
