/**
 * FB2 export module
 * Generates FB2 (FictionBook 2.0) XML files
 * FB2 format specification: http://www.fictionbook.org/index.php/Eng:XML_Schema_Fictionbook_2.1
 */

import path from 'path';
import fs from 'fs';
import type { ExportProject, ExportChapter } from './common.js';
import type { TextBlockType } from '../../engine/types/common.js';
import { stripBlockMarkers } from '../../engine/utils/text-blocks.js';
import { logger } from '../../logger.js';

/** Preset IDs that map to FB2 <cite> (block-level) */
const FB2_CITE_TYPES = new Set(
  ['system-message', 'note', 'letter', 'inner-voice'].map((s) => s.toLowerCase())
);

/** Preset ID for <emphasis> (inline) */
const FB2_EMPHASIS_TYPE = 'notification';

/** Preset ID for <strong> (inline) */
const FB2_STRONG_TYPE = 'skill';

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

  logger.debug(
    { outputDir, outputPath, isAbsolute: path.isAbsolute(outputPath) },
    'FB2 export: output paths'
  );

  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      logger.debug({ outputDir }, 'FB2 export: created output directory');
    } catch (mkdirError: unknown) {
      const msg = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
      logger.error({ err: mkdirError, outputDir }, 'FB2 export: failed to create directory');
      throw new Error(`Не удалось создать директорию для экспорта: ${outputDir}. Ошибка: ${msg}`);
    }
  } else {
    logger.debug({ outputDir }, 'FB2 export: output directory exists');
  }

  logger.debug('FB2 export: generating XML');
  const xml = generateFb2Xml(project);
  logger.debug({ xmlLength: xml.length }, 'FB2 export: XML generated');

  try {
    fs.writeFileSync(outputPath, xml, 'utf-8');
    logger.info({ outputPath }, 'FB2 export: file written successfully');

    if (!fs.existsSync(outputPath)) {
      throw new Error(`FB2 file was not created at: ${outputPath}`);
    }

    const stats = fs.statSync(outputPath);
    logger.debug({ outputPath, size: stats.size }, 'FB2 export: file size');
  } catch (writeError: unknown) {
    const msg = writeError instanceof Error ? writeError.message : String(writeError);
    logger.error({ err: writeError }, `FB2 export: error writing file: ${msg}`);
    throw new Error(`Ошибка записи FB2 файла: ${msg}`);
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
  const sections = project.chapters
    .map((chapter, index) => {
      return generateSection(chapter, index === 0, project.textBlockTypes);
    })
    .join('\n');

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
function generateSection(
  chapter: ExportChapter,
  isFirst: boolean,
  textBlockTypes?: TextBlockType[]
): string {
  const title = escapeXml(chapter.title);
  const paragraphs = convertTextToFb2Paragraphs(chapter.textContent, textBlockTypes);

  return `
    <section${isFirst ? '' : ''}>
      <title>
        <p>${title}</p>
      </title>
      ${paragraphs}
    </section>`;
}

const BLOCK_MARKER_REGEX = /\{\{block:([\w-]+)\}\}([\s\S]*?)\{\{\/block:\1\}\}/g;

/**
 * Convert block markers to FB2 elements (cite, emphasis, strong).
 * Only preset types are mapped; unknown types use stripBlockMarkers.
 */
function convertMarkersToFb2(text: string, blockTypes: TextBlockType[]): string {
  const typeMap = new Map(blockTypes.map((bt) => [bt.id.toLowerCase(), bt]));
  const parts: string[] = [];
  let lastIndex = 0;
  const re = new RegExp(BLOCK_MARKER_REGEX.source, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    parts.push(escapeXml(text.slice(lastIndex, m.index)));
    const typeId = m[1].toLowerCase();
    const content = m[2];
    const bt = typeMap.get(typeId);
    if (bt?.enabled) {
      if (FB2_CITE_TYPES.has(typeId)) {
        const innerParas = content
          .split(/\n\s*\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const inner = innerParas
          .map((para) => `<p>${escapeXml(para)}</p>`)
          .join('\n        <empty-line/>\n        ');
        parts.push(`<cite>\n        ${inner}\n      </cite>`);
      } else if (typeId === FB2_EMPHASIS_TYPE) {
        parts.push(`<emphasis>${escapeXml(content)}</emphasis>`);
      } else if (typeId === FB2_STRONG_TYPE) {
        parts.push(`<strong>${escapeXml(content)}</strong>`);
      } else {
        parts.push(escapeXml(content));
      }
    } else {
      parts.push(escapeXml(content));
    }
    lastIndex = re.lastIndex;
  }
  parts.push(escapeXml(text.slice(lastIndex)));
  return parts.join('');
}

/**
 * Convert plain text to FB2 paragraphs.
 * When textBlockTypes provided, converts block markers to FB2 elements.
 */
function convertTextToFb2Paragraphs(text: string, textBlockTypes?: TextBlockType[]): string {
  if (!text || text.trim().length === 0) {
    return '<p></p>';
  }

  const blockTypes = textBlockTypes?.filter((bt) => bt.enabled) ?? [];
  const hasBlocks = blockTypes.length > 0 && text.includes('{{block:');

  if (!hasBlocks) {
    const plain = text.includes('{{block:') ? stripBlockMarkers(text) : text;
    const paragraphs = plain
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return paragraphs.map((p) => `<p>${escapeXml(p)}</p>`).join('\n      ');
  }

  const segments = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const result: string[] = [];
  for (const seg of segments) {
    const converted = convertMarkersToFb2(seg, blockTypes);
    if (converted.startsWith('<cite>')) {
      result.push(converted);
    } else {
      result.push(`<p>${converted}</p>`);
    }
  }
  return result.join('\n      ');
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
