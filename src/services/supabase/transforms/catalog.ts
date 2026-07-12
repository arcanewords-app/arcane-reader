/**
 * Catalog translation request row transforms — extracted from supabaseDatabase for unit testing.
 */

export type CatalogTranslationRequestStatus =
  'pending' | 'reviewed' | 'accepted' | 'rejected' | 'fulfilled';

export interface CatalogTranslationRequestRow {
  id: string;
  user_id: string;
  title: string;
  author_name: string | null;
  source_language: string | null;
  target_language: string;
  comment: string | null;
  source_url: string | null;
  status: CatalogTranslationRequestStatus;
  admin_notes: string | null;
  linked_publication_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogTranslationRequest {
  id: string;
  userId: string;
  title: string;
  authorName: string | null;
  sourceLanguage: string | null;
  targetLanguage: string;
  comment: string | null;
  sourceUrl: string | null;
  status: CatalogTranslationRequestStatus;
  adminNotes: string | null;
  linkedPublicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CatalogTranslationRequestInterestStatus = 'interested' | 'working' | 'withdrawn';

export interface CatalogTranslationRequestInterestRow {
  id: string;
  request_id: string;
  user_id: string;
  translator_entity_id: string;
  project_id: string | null;
  status: CatalogTranslationRequestInterestStatus;
  created_at: string;
  updated_at: string;
}

export interface CatalogTranslationRequestInterest {
  id: string;
  requestId: string;
  userId: string;
  translatorEntityId: string;
  translatorName: string;
  projectId: string | null;
  status: CatalogTranslationRequestInterestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BoardTranslationRequest {
  id: string;
  title: string;
  authorName: string | null;
  sourceLanguage: string | null;
  targetLanguage: string;
  comment: string | null;
  sourceUrl: string | null;
  status: CatalogTranslationRequestStatus;
  createdAt: string;
  updatedAt: string;
  interestCount: number;
  interests: CatalogTranslationRequestInterest[];
  myInterest: CatalogTranslationRequestInterest | null;
}

export const BOARD_OPEN_REQUEST_STATUSES: CatalogTranslationRequestStatus[] = [
  'pending',
  'reviewed',
  'accepted',
];

export interface AdminCatalogTranslationRequest extends CatalogTranslationRequest {
  userEmail: string;
}

export function transformCatalogTranslationRequestFromDB(
  row: CatalogTranslationRequestRow
): CatalogTranslationRequest {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    authorName: row.author_name,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    comment: row.comment,
    sourceUrl: row.source_url,
    status: row.status,
    adminNotes: row.admin_notes,
    linkedPublicationId: row.linked_publication_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformCatalogTranslationRequestInterestFromDB(
  row: CatalogTranslationRequestInterestRow,
  translatorName: string
): CatalogTranslationRequestInterest {
  return {
    id: row.id,
    requestId: row.request_id,
    userId: row.user_id,
    translatorEntityId: row.translator_entity_id,
    translatorName,
    projectId: row.project_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBoardTranslationRequest(
  row: CatalogTranslationRequestRow,
  interests: CatalogTranslationRequestInterest[],
  currentUserId: string
): BoardTranslationRequest {
  const activeInterests = interests.filter((i) => i.status !== 'withdrawn');
  const myInterest =
    interests.find((i) => i.userId === currentUserId && i.status !== 'withdrawn') ?? null;
  return {
    id: row.id,
    title: row.title,
    authorName: row.author_name,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    comment: row.comment,
    sourceUrl: row.source_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    interestCount: activeInterests.length,
    interests: activeInterests,
    myInterest,
  };
}

export function assertRequestOpenForBoard(request: CatalogTranslationRequest): void {
  if (!BOARD_OPEN_REQUEST_STATUSES.includes(request.status)) {
    const err = new Error('Translation request is not open');
    (err as Error & { code?: string }).code = 'REQUEST_CLOSED';
    throw err;
  }
}
