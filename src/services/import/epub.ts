/**
 * EPUB parser module
 * Extracts metadata, chapters, and content from EPUB files
 */

import AdmZip from 'adm-zip';
import { EPub } from 'epub2';
import { XMLParser } from 'fast-xml-parser';
import { dirname } from 'path';
import type { BookMetadata, ParsedChapter, ParseResult } from './types.js';

function joinPath(base: string, rel: string): string {
  const parts = base.split('/').concat(rel.split('/')).filter(Boolean);
  const result: string[] = [];
  for (const p of parts) {
    if (p === '..') result.pop();
    else if (p !== '.') result.push(p);
  }
  return result.join('/');
}

const EPUB_PARSE_TIMEOUT_MS = 45000;
const EPUB_COVER_TIMEOUT_MS = 15000;
const EPUB_CHAPTER_TIMEOUT_MS = 20000;

/** Result of lazy EPUB parsing: metadata + async iterator over chapters (avoids loading all in memory) */
export interface ParseEpubLazyResult {
  metadata: BookMetadata;
  warnings: string[];
  errors: string[];
  chapterCount: number;
  chapterIterator: AsyncGenerator<ParsedChapter, void, unknown>;
}

function normalizeTocHref(href?: string): string {
  if (!href) return '';
  return href.split('#')[0].trim().toLowerCase();
}

function normalizeTocTitle(title: string): string {
  return title.replace(/\s+-\s+/g, '. ');
}

function buildTocTitleMap(
  toc: Array<{ href?: string; title?: string }> | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  if (!toc) return map;
  for (const item of toc) {
    const key = normalizeTocHref(item.href);
    if (!key) continue;
    const title = item.title?.trim();
    if (!title) continue;
    if (!map.has(key)) {
      map.set(key, normalizeTocTitle(title));
    }
  }
  return map;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`EPUB ${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function parseEpubArchive(epub: EPub): Promise<void> {
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const onEnd = () => {
        epub.removeListener('end', onEnd);
        epub.removeListener('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        epub.removeListener('end', onEnd);
        epub.removeListener('error', onError);
        reject(err);
      };
      epub.on('end', onEnd);
      epub.on('error', onError);
      epub.parse();
    }),
    EPUB_PARSE_TIMEOUT_MS,
    'archive parse'
  );
}

async function getEpubCover(
  epub: EPub,
  coverId: string
): Promise<{ img?: Buffer; mimeType?: string }> {
  return withTimeout(
    new Promise<{ img?: Buffer; mimeType?: string }>((resolve, reject) => {
      epub.getImage(coverId, (err: Error | null, img?: Buffer, mimeType?: string) => {
        if (err) reject(err);
        else resolve({ img, mimeType });
      });
    }),
    EPUB_COVER_TIMEOUT_MS,
    'cover extraction'
  );
}

async function getEpubChapter(epub: EPub, chapterId: string): Promise<string> {
  return withTimeout(
    new Promise<string>((resolve, reject) => {
      epub.getChapter(chapterId, (err: Error | null, text?: string) => {
        if (err) reject(err);
        else resolve(text || '');
      });
    }),
    EPUB_CHAPTER_TIMEOUT_MS,
    `chapter "${chapterId}"`
  );
}

/** Fallback when epub2 returns empty flow (OPF with opf: namespace) */
interface OpfFallbackResult {
  flow: Array<{ id: string; href: string }>;
  zip: AdmZip;
}

function parseOpfFallback(fileBuffer: Buffer): OpfFallbackResult | null {
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  });
  let zip: AdmZip;
  try {
    zip = new AdmZip(fileBuffer);
  } catch {
    return null;
  }
  const entries = zip.getEntries();
  const names = entries.map((e) => e.entryName);
  const containerPath = names.find((n: string) => n.toLowerCase() === 'meta-inf/container.xml');
  if (!containerPath) return null;
  const containerData = zip.readAsText(containerPath);
  const parsed = xmlParser.parse(containerData);
  const root = parsed?.container || parsed;
  const rootfiles = root?.rootfiles;
  const rootfile = Array.isArray(rootfiles?.rootfile) ? rootfiles.rootfile[0] : rootfiles?.rootfile;
  const attrs = rootfile?.['@'] || rootfile;
  const opfPath =
    attrs?.['full-path'] ?? attrs?.['fullPath'] ?? attrs?.['@_full-path'] ?? attrs?.['@_fullPath'];
  if (!opfPath) return null;
  const opfEntryName = names.find((n: string) => n.toLowerCase() === opfPath.toLowerCase());
  if (!opfEntryName) return null;
  const opfData = zip.readAsText(opfEntryName);
  const opf = xmlParser.parse(opfData);
  const pkg = opf?.package || opf?.['opf:package'] || opf;
  if (!pkg) return null;
  const manifest = pkg.manifest || pkg['opf:manifest'];
  const spine = pkg.spine || pkg['opf:spine'];
  if (!manifest || !spine) return null;
  const items = manifest.item || manifest['opf:item'];
  const itemrefs = spine.itemref || spine['opf:itemref'];
  if (!items || !itemrefs) return null;
  const itemList = Array.isArray(items) ? items : [items];
  const refList = Array.isArray(itemrefs) ? itemrefs : [itemrefs];
  const manifestMap = new Map<string, { href: string; mediaType?: string }>();
  for (const it of itemList) {
    const a = it['@'] || it;
    const id = a.id ?? a['@_id'];
    const href = a.href ?? a['@_href'];
    const mediaType = a['media-type'] ?? a.mediaType ?? a['@_media-type'];
    if (id && href && /xhtml|html|xml/i.test(mediaType || '')) {
      manifestMap.set(id, { href, mediaType });
    }
  }
  const opfDir = dirname(opfPath).replace(/\\/g, '/');
  const flow: Array<{ id: string; href: string }> = [];
  for (const ref of refList) {
    const a = ref['@'] || ref;
    const idref = a.idref ?? a['@_idref'];
    const item = manifestMap.get(idref);
    if (item) {
      const fullHref =
        item.href.startsWith('/') || /^[a-z]+:/i.test(item.href)
          ? item.href.replace(/^\//, '')
          : joinPath(opfDir, item.href);
      flow.push({ id: idref, href: fullHref });
    }
  }
  if (flow.length === 0) return null;
  return { flow, zip };
}

function getChapterFromZip(zip: AdmZip, href: string): string {
  const entries = zip.getEntries();
  const entry = entries.find(
    (e: { entryName: string; isDirectory: boolean }) =>
      !e.isDirectory &&
      (e.entryName === href ||
        e.entryName.toLowerCase() === href.toLowerCase() ||
        e.entryName === decodeURIComponent(href))
  );
  if (!entry) return '';
  const data = zip.readAsText(entry);
  const bodyMatch = data.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : data;
}

/**
 * Parse EPUB lazily: yields chapters one-by-one to reduce memory for large books.
 * Use this for EPUB files with many chapters instead of parseEpub().
 */
export async function parseEpubLazy(fileBuffer: Buffer): Promise<ParseEpubLazyResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metadata: BookMetadata = {};

  const epub = new EPub(fileBuffer as unknown as string);

  await parseEpubArchive(epub);

  metadata.title = epub.metadata?.title || undefined;
  const creator = epub.metadata?.creator;
  if (creator) {
    metadata.authors = Array.isArray(creator) ? creator : [creator];
  }
  metadata.language = epub.metadata?.language || undefined;
  metadata.publisher = epub.metadata?.publisher || undefined;
  metadata.description = epub.metadata?.description || undefined;
  metadata.isbn = epub.metadata?.identifier || undefined;
  metadata.publishedDate = epub.metadata?.date || undefined;

  try {
    const coverId = epub.metadata?.cover;
    if (coverId) {
      const { img, mimeType } = await getEpubCover(epub, coverId);
      if (img) {
        metadata.coverImage = { data: img, mimeType: mimeType || 'image/jpeg' };
      }
    }
  } catch {
    warnings.push('Не удалось извлечь обложку');
  }

  type SpineItem = { id: string; href?: string };
  let spine: SpineItem[] = (epub.flow || [])
    .map((item) => ({ id: item.id ?? '', href: item.href }))
    .filter((item) => item.id) as SpineItem[];
  let useFallback = false;
  let fallbackZip: AdmZip | null = null;

  if (spine.length === 0) {
    const fallback = parseOpfFallback(fileBuffer);
    if (fallback) {
      spine = fallback.flow;
      fallbackZip = fallback.zip;
      useFallback = true;
      warnings.push('EPUB использует OPF с namespace — применён fallback-парсер');
    }
  }

  if (spine.length === 0) {
    errors.push('EPUB файл не содержит глав');
    return {
      metadata,
      warnings,
      errors,
      chapterCount: 0,
      chapterIterator: (async function* () {})(),
    };
  }
  const tocTitleMap = buildTocTitleMap(
    epub.toc as Array<{ href?: string; title?: string }> | undefined
  );

  async function* iterateChapters(): AsyncGenerator<ParsedChapter, void, unknown> {
    for (let i = 0; i < spine.length; i++) {
      const item = spine[i];
      const itemId = item.id;
      if (!itemId) {
        warnings.push(`Глава ${i + 1} не имеет ID`);
        continue;
      }
      try {
        let chapterText: string;
        if (useFallback && fallbackZip && item.href) {
          chapterText = getChapterFromZip(fallbackZip, item.href);
        } else {
          chapterText = await getEpubChapter(epub, itemId);
        }
        if (!chapterText || chapterText.trim().length === 0) {
          warnings.push(`Глава ${i + 1} пуста или не может быть прочитана`);
          continue;
        }
        const href = item.href || '';
        const title = tocTitleMap.get(normalizeTocHref(href)) || `Глава ${i + 1}`;
        yield {
          title,
          number: i + 1,
          content: htmlToPlainText(chapterText),
          htmlContent: chapterText,
        };
      } catch (chapterError) {
        const msg = chapterError instanceof Error ? chapterError.message : 'Unknown error';
        errors.push(`Ошибка при парсинге главы ${i + 1}: ${msg}`);
      }
    }
  }

  return {
    metadata,
    warnings,
    errors,
    chapterCount: spine.length,
    chapterIterator: iterateChapters(),
  };
}

/**
 * Parse EPUB file (loads all chapters into memory)
 */
export async function parseEpub(fileBuffer: Buffer): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metadata: BookMetadata = {};
  const chapters: ParsedChapter[] = [];

  try {
    const epub = new EPub(fileBuffer as unknown as string);
    await parseEpubArchive(epub);

    metadata.title = epub.metadata?.title || undefined;
    const creator = epub.metadata?.creator;
    if (creator) {
      metadata.authors = Array.isArray(creator) ? creator : [creator];
    }
    metadata.language = epub.metadata?.language || undefined;
    metadata.publisher = epub.metadata?.publisher || undefined;
    metadata.description = epub.metadata?.description || undefined;
    metadata.isbn = epub.metadata?.identifier || undefined;
    metadata.publishedDate = epub.metadata?.date || undefined;

    try {
      const coverId = epub.metadata?.cover;
      if (coverId) {
        const { img, mimeType } = await getEpubCover(epub, coverId);
        if (img) {
          metadata.coverImage = {
            data: img,
            mimeType: mimeType || 'image/jpeg',
          };
        }
      }
    } catch {
      warnings.push('Не удалось извлечь обложку');
    }

    type SpineItem = { id: string; href?: string };
    let spine: SpineItem[] = (epub.flow || [])
      .map((item) => ({ id: item.id ?? '', href: item.href }))
      .filter((item) => item.id) as SpineItem[];
    let useFallback = false;
    let fallbackZip: AdmZip | null = null;

    if (spine.length === 0) {
      const fallback = parseOpfFallback(fileBuffer);
      if (fallback) {
        spine = fallback.flow;
        fallbackZip = fallback.zip;
        useFallback = true;
        warnings.push('EPUB использует OPF с namespace — применён fallback-парсер');
      }
    }

    if (spine.length === 0) {
      errors.push('EPUB файл не содержит глав');
      return {
        format: 'epub',
        metadata,
        chapters: [],
        errors,
        warnings,
      };
    }
    const tocTitleMap = buildTocTitleMap(
      epub.toc as Array<{ href?: string; title?: string }> | undefined
    );

    for (let i = 0; i < spine.length; i++) {
      const item = spine[i];
      if (!item.id) {
        warnings.push(`Глава ${i + 1} не имеет ID`);
        continue;
      }
      try {
        let chapterText: string;
        if (useFallback && fallbackZip && item.href) {
          chapterText = getChapterFromZip(fallbackZip, item.href);
        } else {
          chapterText = await getEpubChapter(epub, item.id);
        }
        if (!chapterText || chapterText.trim().length === 0) {
          warnings.push(`Глава ${i + 1} пуста или не может быть прочитана`);
          continue;
        }
        const title = tocTitleMap.get(normalizeTocHref(item.href || '')) || `Глава ${i + 1}`;
        chapters.push({
          title,
          number: i + 1,
          content: htmlToPlainText(chapterText),
          htmlContent: chapterText,
        });
      } catch (chapterError) {
        const errorMsg = chapterError instanceof Error ? chapterError.message : 'Unknown error';
        errors.push(`Ошибка при парсинге главы ${i + 1}: ${errorMsg}`);
      }
    }

    if (chapters.length === 0) {
      errors.push('Не удалось извлечь ни одной главы из EPUB файла');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Ошибка парсинга EPUB: ${errorMsg}`);
  }

  return {
    format: 'epub',
    metadata,
    chapters,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Convert HTML to plain text
 * Removes HTML tags and converts entities
 */
function htmlToPlainText(html: string): string {
  // Remove script and style tags with content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Convert block elements to double newlines
  text = text.replace(/<\/?(p|div|h[1-6]|li|br)[^>]*>/gi, '\n\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Clean up whitespace
  text = text
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single
    .trim();

  return text;
}
