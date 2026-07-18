/**
 * Publication ratings (1–5 stars per user per publication).
 */

import { createClientWithToken } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import { getPublicationById } from './publications.js';
import { getReadProgress } from './readerProgress.js';

export type PublicationRatingEligibility =
  'eligible' | 'guest' | 'owner' | 'not_read' | 'not_found';

export class PublicationRatingError extends Error {
  readonly code: 'NOT_FOUND' | 'OWN_WORK' | 'NOT_ELIGIBLE' | 'FORBIDDEN';

  constructor(message: string, code: 'NOT_FOUND' | 'OWN_WORK' | 'NOT_ELIGIBLE' | 'FORBIDDEN') {
    super(message);
    this.name = 'PublicationRatingError';
    this.code = code;
  }
}

export interface PublicationRatingStatus {
  userScore: number | null;
  eligibility: PublicationRatingEligibility;
}

export async function getPublicationRatingStatus(
  publicationId: string,
  userId: string | null,
  token: string | null
): Promise<PublicationRatingStatus> {
  const pub = await getPublicationById(publicationId);
  if (!pub) {
    return { userScore: null, eligibility: 'not_found' };
  }

  if (!userId || !token) {
    return { userScore: null, eligibility: 'guest' };
  }

  if (pub.userId === userId) {
    return { userScore: null, eligibility: 'owner' };
  }

  const progress = await getReadProgress(publicationId, userId, token);
  const hasRead = progress.chapterIds.length >= 1 || Boolean(progress.lastReadChapterId);
  if (!hasRead) {
    return { userScore: null, eligibility: 'not_read' };
  }

  validateToken(token);
  const client = createClientWithToken(token);
  const { data, error } = await client
    .from('publication_ratings')
    .select('score')
    .eq('publication_id', publicationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get publication rating: ${error.message}`);
  }

  return {
    userScore: data?.score != null ? Number(data.score) : null,
    eligibility: 'eligible',
  };
}

async function assertCanRate(publicationId: string, userId: string, token: string): Promise<void> {
  const status = await getPublicationRatingStatus(publicationId, userId, token);
  if (status.eligibility === 'not_found') {
    throw new PublicationRatingError('Publication not found', 'NOT_FOUND');
  }
  if (status.eligibility === 'owner') {
    throw new PublicationRatingError('Cannot rate own publication', 'OWN_WORK');
  }
  if (status.eligibility === 'not_read') {
    throw new PublicationRatingError('Read at least one chapter first', 'NOT_ELIGIBLE');
  }
  if (status.eligibility === 'guest') {
    throw new PublicationRatingError('Authentication required', 'FORBIDDEN');
  }
}

export async function upsertPublicationRating(
  publicationId: string,
  userId: string,
  score: number,
  token: string
): Promise<{ score: number }> {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error('Score must be an integer from 1 to 5');
  }

  await assertCanRate(publicationId, userId, token);
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('publication_ratings')
    .upsert(
      {
        publication_id: publicationId,
        user_id: userId,
        score,
      },
      { onConflict: 'user_id,publication_id' }
    )
    .select('score')
    .single();

  if (error) {
    throw new Error(`Failed to save publication rating: ${error.message}`);
  }

  return { score: Number(data.score) };
}

export async function deletePublicationRating(
  publicationId: string,
  userId: string,
  token: string
): Promise<void> {
  await assertCanRate(publicationId, userId, token);
  validateToken(token);
  const client = createClientWithToken(token);

  const { error } = await client
    .from('publication_ratings')
    .delete()
    .eq('publication_id', publicationId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to remove publication rating: ${error.message}`);
  }
}
