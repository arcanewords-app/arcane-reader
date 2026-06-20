/**
 * arcane-scraper ProjectChapterFull chapter files (scraper-console data/chapters/*.json).
 * Mirror of arcane-scraper/apps/scraper-console/shared/types.ts — no cross-repo import.
 */

import { z } from 'zod';

export const scraperChapterFileSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  content: z.string().min(1),
  sourceUrl: z.string().optional(),
  sourceAdapterId: z.string().optional(),
  scrapedAt: z.string().optional(),
  htmlContent: z.string().optional(),
});

export type ScraperChapterFile = z.infer<typeof scraperChapterFileSchema>;

const BQG_RAW_HINT =
  'This looks like raw BQG API JSON (field "txt"). Use a scraper-console chapter file from .../chapters/{number}.json.';

export function parseScraperChapterJson(raw: unknown): ScraperChapterFile {
  if (raw && typeof raw === 'object' && 'txt' in raw && !('content' in raw)) {
    throw new Error(BQG_RAW_HINT);
  }
  const parsed = scraperChapterFileSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid scraper chapter file: ${msg}`);
  }
  return parsed.data;
}

export function formatScraperChapterSaveTitle(
  chapter: Pick<ScraperChapterFile, 'number' | 'title'>
): string {
  return `${chapter.number} — ${chapter.title.trim()}`;
}

const MAX_CHAPTER_FILE_BYTES = 5 * 1024 * 1024;

export async function readScraperChapterFile(file: File): Promise<ScraperChapterFile> {
  if (!file.name.toLowerCase().endsWith('.json')) {
    throw new Error('Expected a .json chapter file');
  }
  if (file.size > MAX_CHAPTER_FILE_BYTES) {
    throw new Error(
      `File is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 5MB.`
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('Invalid JSON in chapter file');
  }
  return parseScraperChapterJson(raw);
}
