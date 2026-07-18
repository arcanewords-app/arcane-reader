/**
 * User quotes saved from publication reading mode.
 */

import { createClientWithToken } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import { getPublicationById } from './publications.js';

export const QUOTE_TEXT_MAX_LENGTH = 2000;
export const USER_QUOTES_MAX_COUNT = 500;

export interface UserQuoteRow {
  id: string;
  publicationId: string;
  chapterId: string;
  chapterNumber: number;
  quoteText: string;
  startParagraph: number;
  startOffset: number;
  endParagraph: number;
  endOffset: number;
  createdAt: string;
}

export interface UserQuoteListItem extends UserQuoteRow {
  publicationTitle: string | null;
  publicationSlug: string | null;
  coverImageUrl: string | null;
}

export class UserQuoteError extends Error {
  readonly code: 'NOT_FOUND' | 'LIMIT_REACHED' | 'VALIDATION';

  constructor(message: string, code: 'NOT_FOUND' | 'LIMIT_REACHED' | 'VALIDATION') {
    super(message);
    this.name = 'UserQuoteError';
    this.code = code;
  }
}

export async function createUserQuote(
  userId: string,
  token: string,
  data: {
    publicationId: string;
    chapterId: string;
    chapterNumber: number;
    quoteText: string;
    startParagraph: number;
    startOffset: number;
    endParagraph: number;
    endOffset: number;
  }
): Promise<{ id: string }> {
  const pub = await getPublicationById(data.publicationId);
  if (!pub) {
    throw new UserQuoteError('Publication not found', 'NOT_FOUND');
  }

  const quoteText = data.quoteText.trim();
  if (!quoteText || quoteText.length > QUOTE_TEXT_MAX_LENGTH) {
    throw new UserQuoteError('Quote text must be between 1 and 2000 characters', 'VALIDATION');
  }

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const serviceClient = createServiceRoleClient();

  const { data: chapter, error: chapterError } = await serviceClient
    .from('chapters')
    .select('id')
    .eq('id', data.chapterId)
    .eq('project_id', pub.projectId)
    .maybeSingle();

  if (chapterError || !chapter) {
    throw new UserQuoteError('Chapter not found', 'NOT_FOUND');
  }

  validateToken(token);
  const client = createClientWithToken(token);

  const { count, error: countError } = await client
    .from('user_quotes')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    throw new Error(`Failed to count user quotes: ${countError.message}`);
  }

  if ((count ?? 0) >= USER_QUOTES_MAX_COUNT) {
    throw new UserQuoteError('Quote limit reached', 'LIMIT_REACHED');
  }

  const { data: inserted, error } = await client
    .from('user_quotes')
    .insert({
      user_id: userId,
      publication_id: data.publicationId,
      chapter_id: data.chapterId,
      chapter_number: data.chapterNumber,
      quote_text: quoteText,
      start_paragraph: data.startParagraph,
      start_offset: data.startOffset,
      end_paragraph: data.endParagraph,
      end_offset: data.endOffset,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create quote: ${error.message}`);
  }

  return { id: inserted.id as string };
}

export async function listUserQuotes(userId: string, token: string): Promise<UserQuoteListItem[]> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('user_quotes')
    .select(
      `
      id,
      publication_id,
      chapter_id,
      chapter_number,
      quote_text,
      start_paragraph,
      start_offset,
      end_paragraph,
      end_offset,
      created_at,
      publications!inner (
        title,
        slug,
        cover_image_url,
        status
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list user quotes: ${error.message}`);
  }

  if (!data) return [];

  return data
    .map((row) => {
      const pub = row.publications as unknown as {
        title: string | null;
        slug: string | null;
        cover_image_url: string | null;
        status: string;
      };
      if (pub?.status !== 'published') return null;
      return {
        id: row.id as string,
        publicationId: row.publication_id as string,
        chapterId: row.chapter_id as string,
        chapterNumber: Number(row.chapter_number),
        quoteText: row.quote_text as string,
        startParagraph: Number(row.start_paragraph),
        startOffset: Number(row.start_offset),
        endParagraph: Number(row.end_paragraph),
        endOffset: Number(row.end_offset),
        createdAt: row.created_at as string,
        publicationTitle: pub.title ?? null,
        publicationSlug: pub.slug ?? null,
        coverImageUrl: pub.cover_image_url ?? null,
      } satisfies UserQuoteListItem;
    })
    .filter((item): item is UserQuoteListItem => item != null);
}

export async function deleteUserQuote(
  userId: string,
  token: string,
  quoteId: string
): Promise<boolean> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('user_quotes')
    .delete()
    .eq('id', quoteId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete quote: ${error.message}`);
  }

  return data != null;
}
