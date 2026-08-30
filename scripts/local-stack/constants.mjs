/**
 * Shared constants for the local Docker + Supabase stack.
 */
export const PROD_PROJECT_REF = 'ugcnqejiiybaatcqxmgn';

/** Login password for every seed user in supabase/seed.sql */
export const SEED_PASSWORD = 'local-dev-password';

/** Fixed UUIDs — must match supabase/seed.sql */
export const SEED_USERS = {
  author: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'author@local.test',
    role: 'author',
  },
  authorPlus: {
    id: '10000000-0000-4000-8000-000000000002',
    email: 'author-plus@local.test',
    role: 'author_plus',
  },
  admin: {
    id: '10000000-0000-4000-8000-000000000003',
    email: 'admin@local.test',
    role: 'admin',
  },
  user: {
    id: '10000000-0000-4000-8000-000000000004',
    email: 'user@local.test',
    role: 'user',
  },
};

export const SEED_IDS = Object.values(SEED_USERS).map((u) => u.id);
export const SEED_AUTHOR_ID = SEED_USERS.author.id;

/** Insert/dump order (parents before children). */
export const DATA_DUMP_TABLES = [
  'public_entities',
  'projects',
  'chapters',
  'paragraphs',
  'glossary_entries',
  'news_posts',
  'announcement_alerts',
  'publications',
  'catalog_translation_requests',
  'catalog_translation_request_interests',
  'translation_reports',
];

/** Columns that FK to auth.users / profiles — remapped onto seed author on load. */
export const USER_ID_COLUMNS = [
  'user_id',
  'owner_user_id',
  'reporter_user_id',
  'created_by',
  'author_id',
];

/** Must match POSTGREST_MAX_ROWS in src/shared/cacheContract.ts */
export const POSTGREST_PAGE = 1000;
export const INSERT_BATCH = 100;
export const INSERT_BATCH_LARGE = 25;

export const BOOTSTRAP_SCHEMA = 'supabase/bootstrap/schema.sql';
export const DATA_DUMP_DIR = 'supabase/dumps';
export const DATA_DUMP_MANIFEST = 'supabase/dumps/manifest.json';
export const REMAP_SQL = 'supabase/bootstrap/remap_owners.sql';

/** Local stamp image (PGDATA snapshot). Registry-ready name without a host. */
export const STAMP_IMAGE = 'arcane-reader-stamp';
export const STAMP_IMAGE_LATEST = `${STAMP_IMAGE}:latest`;
/** Future private GHCR name — tag/push only, not used by stack:* yet. */
export const STAMP_GHCR_IMAGE = 'ghcr.io/arcanewords-app/arcane-reader-stamp';
export const STAMP_SOURCE_URL = 'https://github.com/arcanewords-app/arcane-reader';
export const STAMP_DB_VOLUME = 'supabase_db_arcane-reader';
export const STAMP_DB_CONTAINER = 'supabase_db_arcane-reader';
export const STAMP_WORKDIR = 'supabase/.temp/stamp';
export const STAMP_DOCKERFILE = 'scripts/local-stack/stamp.Dockerfile';
export const POSTGRES_MAJOR = 17;
