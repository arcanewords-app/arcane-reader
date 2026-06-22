import { api } from '../../api/client';

const CHUNK_SIZE = 50;

export interface BulkReplaceProgress {
  done: number;
  total: number;
}

export interface BulkReplaceChunkResult {
  succeeded: string[];
  failed: Array<{ paragraphId: string; error: string }>;
}

export async function bulkReplaceParagraphsChunked(
  projectId: string,
  updates: Array<{ chapterId: string; paragraphId: string; translatedText: string }>,
  onProgress?: (progress: BulkReplaceProgress) => void
): Promise<BulkReplaceChunkResult> {
  const succeeded: string[] = [];
  const failed: Array<{ paragraphId: string; error: string }> = [];
  const total = updates.length;

  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const result = await api.bulkUpdateParagraphs(projectId, chunk);
    succeeded.push(...result.succeeded);
    failed.push(...result.failed);
    onProgress?.({ done: Math.min(i + chunk.length, total), total });
  }

  return { succeeded, failed };
}
