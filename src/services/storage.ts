/**
 * Storage service for Supabase Storage
 * Handles file uploads, downloads, and deletions
 */

import { createServiceRoleClient } from './supabaseClient.js';

export type StorageBucket = 'images' | 'exports';

export interface UploadOptions {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
}

export interface UploadResult {
  path: string;
  publicUrl: string;
}

export interface SignedUrlResult {
  signedUrl: string;
}

export interface ListedFile {
  name: string;
  id?: string;
  updated_at?: string;
  created_at?: string;
  last_accessed_at?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Upload file to Supabase Storage
 */
export async function uploadFile(
  bucket: StorageBucket,
  path: string,
  file: Buffer | Uint8Array,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: options.contentType,
      upsert: options.upsert ?? true,
      cacheControl: options.cacheControl || '3600',
    });

  if (error) {
    throw new Error(`Failed to upload file to ${bucket}: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    path: data.path,
    publicUrl: urlData.publicUrl,
  };
}

/**
 * Create a signed URL for a file in Supabase Storage.
 * Useful for private buckets (recommended for exports).
 */
export async function createSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds: number = 60 * 15
): Promise<SignedUrlResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${bucket}: ${error?.message || 'Unknown error'}`);
  }

  return { signedUrl: data.signedUrl };
}

/**
 * List files in a bucket folder (non-recursive). Uses pagination to fetch all.
 * For exports we store files as `${projectId}/${filename}` so a single-level list is enough.
 */
export async function listFiles(
  bucket: StorageBucket,
  folder: string,
  options: { limit?: number } = {}
): Promise<ListedFile[]> {
  const supabase = createServiceRoleClient();

  const limit = options.limit ?? 100;
  let offset = 0;
  const all: ListedFile[] = [];

  // Supabase Storage list() is paginated via offset/limit.
  // We continue until we receive fewer than `limit` items.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw new Error(`Failed to list files in ${bucket}/${folder}: ${error.message}`);
    }

    const page = (data as ListedFile[]) || [];
    all.push(...page);

    if (page.length < limit) break;
    offset += limit;
  }

  return all;
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFile(
  bucket: StorageBucket,
  path: string
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Failed to delete file from ${bucket}: ${error.message}`);
  }
}

/**
 * Delete multiple files from Supabase Storage
 */
export async function deleteFiles(
  bucket: StorageBucket,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;

  const supabase = createServiceRoleClient();

  const { error } = await supabase.storage.from(bucket).remove(paths);

  if (error) {
    throw new Error(`Failed to delete files from ${bucket}: ${error.message}`);
  }
}

/**
 * Get public URL for a file in Supabase Storage
 */
export function getPublicUrl(bucket: StorageBucket, path: string): string {
  const supabase = createServiceRoleClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Extract path from Supabase Storage URL
 * Example: https://xxx.supabase.co/storage/v1/object/public/images/project-123/image.jpg
 * Returns: project-123/image.jpg
 */
export function extractPathFromUrl(url: string, bucket: StorageBucket): string | null {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(new RegExp(`/${bucket}/(.+)$`));
    return pathMatch ? pathMatch[1] : null;
  } catch {
    return null;
  }
}

/**
 * Generate unique filename with timestamp
 */
export function generateUniqueFilename(
  prefix: string,
  extension: string,
  projectId?: string
): string {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const filename = `${prefix}-${timestamp}-${random}.${extension}`;
  
  if (projectId) {
    return `${projectId}/${filename}`;
  }
  
  return filename;
}
