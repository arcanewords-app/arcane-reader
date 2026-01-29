/**
 * EPUB export module
 * Generates EPUB in memory via epub-gen-memory (no temp dir in node_modules).
 * Writes result to outputPath so it works on read-only FS (e.g. Vercel /var/task).
 */

import path from 'path';
import fs from 'fs';
import epubGen from 'epub-gen-memory';
import type { ExportProject } from './common.js';

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

  console.log(`[EPUB Export] Output directory: ${outputDir}`);
  console.log(`[EPUB Export] Output path: ${outputPath}`);
  console.log(`[EPUB Export] Path is absolute: ${path.isAbsolute(outputPath)}`);

  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[EPUB Export] Created output directory: ${outputDir}`);
    } catch (mkdirError: unknown) {
      const msg = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
      console.error(`[EPUB Export] Failed to create directory: ${msg}`);
      throw new Error(`Не удалось создать директорию для экспорта: ${outputDir}. Ошибка: ${msg}`);
    }
  } else {
    console.log(`[EPUB Export] Output directory exists: ${outputDir}`);
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

  console.log(`[EPUB Export] Starting EPUB generation (epub-gen-memory)...`);
  let buffer: Buffer;
  try {
    const epub = (epubGen as { default: (opts: unknown, content: unknown[]) => Promise<Buffer> }).default;
    buffer = await epub(epubOptions, content);
  } catch (epubError: unknown) {
    const msg = epubError instanceof Error ? epubError.message : String(epubError);
    const stack = epubError instanceof Error ? epubError.stack : undefined;
    console.error(`[EPUB Export] Error generating EPUB: ${msg}`);
    if (stack) console.error(`[EPUB Export] Stack: ${stack}`);
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
  console.log(`[EPUB Export] EPUB generated successfully: ${outputPath}`);
  console.log(`[EPUB Export] File size: ${stats.size} bytes`);

  return outputPath;
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}
