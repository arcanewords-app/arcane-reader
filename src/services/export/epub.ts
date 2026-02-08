/**
 * EPUB export module
 * Generates EPUB in memory via epub-gen-memory (no temp dir in node_modules).
 * Writes result to outputPath so it works on read-only FS (e.g. Vercel /var/task).
 */

import path from 'path';
import fs from 'fs';
import epubGen from 'epub-gen-memory';
import type { ExportProject } from './common.js';
import { logger } from '../../logger.js';

export interface EpubExportOptions {
  outputDir?: string;
  filename?: string;
}

/**
 * Export project to EPUB format
 * Uses epub-gen-memory (in-memory) then writes to outputPath to avoid EROFS on Vercel.
 */
export async function exportToEpub(
  project: ExportProject,
  options: EpubExportOptions = {}
): Promise<string> {
  const outputDir = options.outputDir || './data/exports';
  const filename = options.filename || `${sanitizeFilename(project.title)}.epub`;

  const outputPath = path.isAbsolute(outputDir)
    ? path.join(outputDir, filename)
    : path.resolve(outputDir, filename);

  logger.debug({ outputDir, outputPath, isAbsolute: path.isAbsolute(outputPath) }, 'EPUB export: output paths');

  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      logger.debug({ outputDir }, 'EPUB export: created output directory');
    } catch (mkdirError: unknown) {
      const msg = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
      logger.error({ err: mkdirError, outputDir }, 'EPUB export: failed to create directory');
      throw new Error(`Не удалось создать директорию для экспорта: ${outputDir}. Ошибка: ${msg}`);
    }
  } else {
    logger.debug({ outputDir }, 'EPUB export: output directory exists');
  }

  // epub-gen-memory: content is array of { title?, content } (content = HTML)
  const content = project.chapters.map((chapter) => ({
    title: chapter.title,
    content: chapter.htmlContent,
  }));

  const epubOptions = {
    title: project.title,
    author: project.author || 'Переведено Arcane',
    lang: project.language || 'ru',
    publisher: 'Arcane Translator',
    description: project.metadata?.translatedAt
      ? `Переведено: ${new Date(project.metadata.translatedAt).toLocaleDateString('ru-RU')}`
      : undefined,
  };

  logger.debug('EPUB export: starting generation (epub-gen-memory)');
  let buffer: Buffer;
  try {
    const epub = (epubGen as { default: (opts: unknown, content: unknown[]) => Promise<Buffer> }).default;
    buffer = await epub(epubOptions, content);
  } catch (epubError: unknown) {
    const msg = epubError instanceof Error ? epubError.message : String(epubError);
    logger.error({ err: epubError }, `EPUB export: error generating EPUB: ${msg}`);
    throw new Error(`Ошибка генерации EPUB: ${msg}`);
  }

  try {
    fs.writeFileSync(outputPath, buffer);
  } catch (writeError: unknown) {
    const msg = writeError instanceof Error ? writeError.message : String(writeError);
    throw new Error(`Не удалось записать EPUB по пути: ${outputPath}. Ошибка: ${msg}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`EPUB файл не был создан по пути: ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  logger.info({ outputPath, size: stats.size }, 'EPUB export: generated successfully');

  return outputPath;
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}
