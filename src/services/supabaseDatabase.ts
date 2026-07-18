/**
 * Supabase Database Service — thin facade
 *
 * Re-exports domain modules for backward compatibility with existing importers.
 */

export type { ProjectListItemDB } from './supabaseTransforms.js';
export type { PublicationStatus, PublicationRow } from './supabase/transforms/publication.js';

export * from './supabase/domains/projects.js';
export * from './supabase/loaders.js';
export * from './supabase/domains/glossary.js';
export * from './supabase/domains/chapters.js';
export * from './supabase/domains/paragraphs.js';
export * from './supabase/domains/publications.js';
export * from './supabase/domains/readerProgress.js';
export * from './supabase/domains/publicationRatings.js';
export * from './supabase/domains/translationReports.js';
export * from './supabase/domains/userQuotes.js';
export * from './supabase/domains/news.js';
export * from './supabase/domains/admin.js';
export * from './supabase/domains/catalogBoard.js';
