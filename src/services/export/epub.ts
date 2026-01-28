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
  // Use provided outputDir or fallback (but outputDir should always be provided on Vercel)
  const outputDir = options.outputDir || './data/exports';
  const filename = options.filename || `${sanitizeFilename(project.title)}.epub`;
  
  // Ensure path is absolute (important for epub-gen on Vercel)
  const outputPath = path.isAbsolute(outputDir) 
    ? path.join(outputDir, filename)
    : path.resolve(outputDir, filename);

  console.log(`[EPUB Export] Output directory: ${outputDir}`);
  console.log(`[EPUB Export] Output path: ${outputPath}`);
  console.log(`[EPUB Export] Path is absolute: ${path.isAbsolute(outputPath)}`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[EPUB Export] Created output directory: ${outputDir}`);
    } catch (mkdirError: any) {
      console.error(`[EPUB Export] Failed to create directory: ${mkdirError.message}`);
      throw new Error(`Не удалось создать директорию для экспорта: ${outputDir}. Ошибка: ${mkdirError.message}`);
    }
  } else {
    console.log(`[EPUB Export] Output directory exists: ${outputDir}`);
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
  console.log(`[EPUB Export] Starting EPUB generation...`);
  try {
    await new Epub(epubOptions).promise;
    console.log(`[EPUB Export] EPUB generated successfully: ${outputPath}`);
    
    // Verify file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error(`EPUB файл не был создан по пути: ${outputPath}`);
    }
    
    const stats = fs.statSync(outputPath);
    console.log(`[EPUB Export] File size: ${stats.size} bytes`);
  } catch (epubError: any) {
    console.error(`[EPUB Export] Error generating EPUB: ${epubError.message}`);
    console.error(`[EPUB Export] Stack: ${epubError.stack}`);
    throw new Error(`Ошибка генерации EPUB: ${epubError.message}`);
  }

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
