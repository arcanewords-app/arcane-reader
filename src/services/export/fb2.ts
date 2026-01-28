/**
 * FB2 export module
 * Generates FB2 (FictionBook 2.0) XML files
 * FB2 format specification: http://www.fictionbook.org/index.php/Eng:XML_Schema_Fictionbook_2.1
 */

import path from 'path';
import fs from 'fs';
import type { ExportProject, ExportChapter } from './common.js';

export interface Fb2ExportOptions {
  outputDir?: string;
  filename?: string;
}

/**
 * Export project to FB2 format
 */
export async function exportToFb2(
  project: ExportProject,
  options: Fb2ExportOptions = {}
): Promise<string> {
  // Use provided outputDir or fallback (but outputDir should always be provided on Vercel)
  const outputDir = options.outputDir || './data/exports';
  const filename = options.filename || `${sanitizeFilename(project.title)}.fb2`;
  
  // Ensure path is absolute
  const outputPath = path.isAbsolute(outputDir)
    ? path.join(outputDir, filename)
    : path.resolve(outputDir, filename);

  console.log(`[FB2 Export] Output directory: ${outputDir}`);
  console.log(`[FB2 Export] Output path: ${outputPath}`);
  console.log(`[FB2 Export] Path is absolute: ${path.isAbsolute(outputPath)}`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[FB2 Export] Created output directory: ${outputDir}`);
    } catch (mkdirError: any) {
      console.error(`[FB2 Export] Failed to create directory: ${mkdirError.message}`);
      throw new Error(`Не удалось создать директорию для экспорта: ${outputDir}. Ошибка: ${mkdirError.message}`);
    }
  } else {
    console.log(`[FB2 Export] Output directory exists: ${outputDir}`);
  }

  // Generate FB2 XML
  console.log(`[FB2 Export] Generating FB2 XML...`);
  const xml = generateFb2Xml(project);
  console.log(`[FB2 Export] XML generated, length: ${xml.length} characters`);

  // Write to file
  try {
    fs.writeFileSync(outputPath, xml, 'utf-8');
    console.log(`[FB2 Export] FB2 file written successfully: ${outputPath}`);
    
    // Verify file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error(`FB2 файл не был создан по пути: ${outputPath}`);
    }
    
    const stats = fs.statSync(outputPath);
    console.log(`[FB2 Export] File size: ${stats.size} bytes`);
  } catch (writeError: any) {
    console.error(`[FB2 Export] Error writing file: ${writeError.message}`);
    console.error(`[FB2 Export] Stack: ${writeError.stack}`);
    throw new Error(`Ошибка записи FB2 файла: ${writeError.message}`);
  }

  return outputPath;
}

/**
 * Generate FB2 XML structure
 */
function generateFb2Xml(project: ExportProject): string {
  const titleInfo = generateTitleInfo(project);
  const documentInfo = generateDocumentInfo(project);
  const publishInfo = generatePublishInfo(project);
  const body = generateBody(project);

  return `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    ${titleInfo}
    ${documentInfo}
    ${publishInfo}
  </description>
  ${body}
</FictionBook>`;
}

/**
 * Generate title-info section
 */
function generateTitleInfo(project: ExportProject): string {
  const author = escapeXml(project.author || 'Переведено Arcane');
  const title = escapeXml(project.title);
  const lang = project.language || 'ru';

  return `
    <title-info>
      <genre>sf_fantasy</genre>
      <author>
        <nickname>${author}</nickname>
      </author>
      <book-title>${title}</book-title>
      <lang>${lang}</lang>
    </title-info>`;
}

/**
 * Generate document-info section
 */
function generateDocumentInfo(project: ExportProject): string {
  const date = project.metadata?.translatedAt
    ? new Date(project.metadata.translatedAt).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return `
    <document-info>
      <author>
        <nickname>Arcane Translator</nickname>
      </author>
      <date>
        <value>${date}</value>
      </date>
      <version>1.0</version>
    </document-info>`;
}

/**
 * Generate publish-info section
 */
function generatePublishInfo(project: ExportProject): string {
  const title = escapeXml(project.title);

  return `
    <publish-info>
      <book-name>${title}</book-name>
      <publisher>Arcane Translator</publisher>
    </publish-info>`;
}

/**
 * Generate body section with chapters
 */
function generateBody(project: ExportProject): string {
  const sections = project.chapters.map((chapter, index) => {
    return generateSection(chapter, index === 0);
  }).join('\n');

  return `
  <body>
    <title>
      <p>${escapeXml(project.title)}</p>
    </title>
    ${sections}
  </body>`;
}

/**
 * Generate section (chapter) for FB2
 */
function generateSection(chapter: ExportChapter, isFirst: boolean): string {
  const title = escapeXml(chapter.title);
  const paragraphs = convertTextToFb2Paragraphs(chapter.textContent);

  return `
    <section${isFirst ? '' : ''}>
      <title>
        <p>${title}</p>
      </title>
      ${paragraphs}
    </section>`;
}

/**
 * Convert plain text to FB2 paragraphs
 */
function convertTextToFb2Paragraphs(text: string): string {
  if (!text || text.trim().length === 0) {
    return '<p></p>';
  }

  // Split into paragraphs (double newlines)
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Convert to FB2 <p> tags
  return paragraphs
    .map(p => `<p>${escapeXml(p)}</p>`)
    .join('\n      ');
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
