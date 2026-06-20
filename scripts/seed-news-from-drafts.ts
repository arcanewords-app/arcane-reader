/**
 * Seed published news posts and announcement banners from docs/05-plans/news-drafts/*.md
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:news
 *   npm run seed:news -- --direct          # service role (SUPABASE_* in .env), no admin login
 *   npm run seed:news -- --dry-run
 *   npm run seed:news -- --force
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAFTS_DIR = path.join(__dirname, '../docs/05-plans/news-drafts');

/** Publication order (oldest feature first in feed after backdate). */
const PUBLISH_ORDER = [
  'report-translation',
  'account-tiers',
  'new-language-pairs',
  'glossary-from-external-sources',
  'belarusian',
  'engine-gpt-54-mini',
] as const;

const BANNER_PRIORITY: Record<string, number> = {
  'new-language-pairs': 10,
  belarusian: 20,
  'engine-gpt-54-mini': 30,
};

type NewsCategory = 'feature' | 'discount' | 'update' | 'other';
type AnnouncementVariant = 'info' | 'promo' | 'neutral';
type AnnouncementMinRole = 'guest' | 'user' | 'author' | 'author_plus' | 'super_author' | 'admin';

interface ParsedDraft {
  slug: string;
  category: NewsCategory;
  publishedAt: string | null;
  banner: boolean;
  bannerMessage: string | null;
  bannerStyle: AnnouncementVariant;
  bannerMinRole: AnnouncementMinRole;
  title: string;
  summary: string;
  body: string;
}

interface NewsPost {
  id: string;
  slug: string | null;
  title: string;
  status: string;
}

function parseArgs(argv: string[]): { dryRun: boolean; force: boolean; direct: boolean } {
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    direct: argv.includes('--direct'),
  };
}

function parseFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function extractAdminField(content: string, field: 'title' | 'summary'): string {
  const re = new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*([^|\\n]+)\\s*\\|`, 'i');
  const m = content.match(re);
  return m?.[1]?.trim() ?? '';
}

function extractBody(content: string): string {
  const marker = '## Body (markdown для Admin → Body)';
  const idx = content.indexOf(marker);
  if (idx === -1) {
    throw new Error('Missing "## Body (markdown для Admin → Body)" section');
  }
  return content.slice(idx + marker.length).trim();
}

function parseDraftFile(filePath: string): ParsedDraft {
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = parseFrontmatter(content);
  const slug = fm.slug?.trim();
  if (!slug) {
    throw new Error(`Missing slug in ${filePath}`);
  }

  const category = (fm.category ?? 'other') as NewsCategory;
  const bannerRaw = (fm.banner ?? 'false').toLowerCase();
  const banner = bannerRaw === 'true';

  return {
    slug,
    category,
    publishedAt: fm.published_at?.trim() || null,
    banner,
    bannerMessage: fm.banner_message?.trim() || null,
    bannerStyle: (fm.banner_style ?? 'info') as AnnouncementVariant,
    bannerMinRole: (fm.banner_min_role ?? 'guest') as AnnouncementMinRole,
    title: extractAdminField(content, 'title'),
    summary: extractAdminField(content, 'summary'),
    body: extractBody(content),
  };
}

function loadDrafts(): ParsedDraft[] {
  const files = fs
    .readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(DRAFTS_DIR, f));

  const bySlug = new Map<string, ParsedDraft>();
  for (const file of files) {
    const draft = parseDraftFile(file);
    if (!draft.title || !draft.summary) {
      throw new Error(`Missing title/summary in ${file}`);
    }
    bySlug.set(draft.slug, draft);
  }

  const ordered: ParsedDraft[] = [];
  for (const slug of PUBLISH_ORDER) {
    const draft = bySlug.get(slug);
    if (!draft) {
      throw new Error(`Missing draft for slug "${slug}" in ${DRAFTS_DIR}`);
    }
    ordered.push(draft);
  }
  return ordered;
}

async function apiFetch<T>(
  baseUrl: string,
  token: string | null,
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await apiFetch<{
    session: { access_token: string } | null;
    user: { role?: string };
  }>(baseUrl, null, 'POST', '/api/auth/login', { email, password });

  if (!res.ok || !res.data?.session?.access_token) {
    throw new Error(`Login failed (${res.status}): ${res.text}`);
  }
  if (res.data.user?.role !== 'admin') {
    throw new Error(`User ${email} is not admin (role: ${res.data.user?.role ?? 'unknown'})`);
  }
  return res.data.session.access_token;
}

async function getPublishedPost(baseUrl: string, slug: string): Promise<NewsPost | null> {
  const res = await apiFetch<NewsPost>(baseUrl, null, 'GET', `/api/news/${slug}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GET /api/news/${slug} failed (${res.status}): ${res.text}`);
  }
  return res.data;
}

async function invalidateNewsCaches(postIdOrSlug?: string): Promise<void> {
  const { CACHE_PREFIX, CACHE_SCHEMA_VERSION } = await import('../src/shared/cacheContract.js');
  const { redisDelByPattern } = await import('../src/services/redisCache.js');

  if (postIdOrSlug) {
    await redisDelByPattern(`${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.newsPost}:${postIdOrSlug}`);
  }
  await redisDelByPattern(`${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.newsList}:*`);
  await redisDelByPattern(`${CACHE_SCHEMA_VERSION}:${CACHE_PREFIX.announcementsActive}:*`);
}

/** Placeholder JWT — createNewsPost validates format only; DB uses service role. */
const SERVICE_ROLE_PLACEHOLDER_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZWVkIn0.placeholder';

async function seedDraftDirect(
  draft: ParsedDraft,
  options: { dryRun: boolean; force: boolean }
): Promise<void> {
  const {
    getPublishedNewsPostByIdOrSlug,
    createNewsPost,
    publishNewsPost,
    createAnnouncementFromNews,
  } = await import('../src/services/supabaseDatabase.js');

  const existing = await getPublishedNewsPostByIdOrSlug(draft.slug);
  if (existing && !options.force) {
    console.log(`  skip ${draft.slug} (already published as ${existing.id})`);
    return;
  }

  if (options.dryRun) {
    console.log(`  [dry-run] would create+publish: ${draft.slug} — ${draft.title}`);
    if (draft.banner) {
      console.log(`  [dry-run] would create banner: ${draft.bannerMessage}`);
    }
    return;
  }

  if (existing && options.force) {
    console.log(`  force: ${draft.slug} already exists (${existing.id}), skipping create`);
    return;
  }

  const created = await createNewsPost(
    {
      title: draft.title,
      summary: draft.summary,
      body: draft.body,
      category: draft.category,
      slug: draft.slug,
    },
    SERVICE_ROLE_PLACEHOLDER_TOKEN
  );
  console.log(`  created draft ${draft.slug} (${created.id})`);

  const published = await publishNewsPost(created.id);
  console.log(`  published ${draft.slug}`);

  if (draft.banner) {
    const priority = BANNER_PRIORITY[draft.slug] ?? 0;
    await createAnnouncementFromNews(created.id, {
      message: draft.bannerMessage ?? draft.summary,
      variant: draft.bannerStyle,
      minRole: draft.bannerMinRole,
      priority,
      isActive: true,
    });
    console.log(`  banner created for ${draft.slug} (priority ${priority})`);
  }

  await invalidateNewsCaches(published.slug ?? published.id);
}

async function seedDraftApi(
  baseUrl: string,
  token: string,
  draft: ParsedDraft,
  options: { dryRun: boolean; force: boolean }
): Promise<void> {
  const existing = await getPublishedPost(baseUrl, draft.slug);
  if (existing && !options.force) {
    console.log(`  skip ${draft.slug} (already published as ${existing.id})`);
    return;
  }

  if (options.dryRun) {
    console.log(`  [dry-run] would create+publish: ${draft.slug} — ${draft.title}`);
    if (draft.banner) {
      console.log(`  [dry-run] would create banner: ${draft.bannerMessage}`);
    }
    return;
  }

  if (existing && options.force) {
    console.log(`  force: ${draft.slug} already exists (${existing.id}), skipping create`);
    return;
  }

  const createRes = await apiFetch<NewsPost>(baseUrl, token, 'POST', '/api/admin/news', {
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    category: draft.category,
    slug: draft.slug,
  });

  if (!createRes.ok || !createRes.data) {
    throw new Error(`Create ${draft.slug} failed (${createRes.status}): ${createRes.text}`);
  }

  const postId = createRes.data.id;
  console.log(`  created draft ${draft.slug} (${postId})`);

  const publishRes = await apiFetch<NewsPost>(
    baseUrl,
    token,
    'POST',
    `/api/admin/news/${postId}/publish`
  );
  if (!publishRes.ok) {
    throw new Error(`Publish ${draft.slug} failed (${publishRes.status}): ${publishRes.text}`);
  }
  console.log(`  published ${draft.slug}`);

  if (draft.banner) {
    const priority = BANNER_PRIORITY[draft.slug] ?? 0;
    const bannerRes = await apiFetch<unknown>(
      baseUrl,
      token,
      'POST',
      `/api/admin/announcements/from-news/${postId}`,
      {
        message: draft.bannerMessage ?? draft.summary,
        variant: draft.bannerStyle,
        minRole: draft.bannerMinRole,
        priority,
        isActive: true,
      }
    );
    if (!bannerRes.ok) {
      throw new Error(`Banner for ${draft.slug} failed (${bannerRes.status}): ${bannerRes.text}`);
    }
    console.log(`  banner created for ${draft.slug} (priority ${priority})`);
  }
}

async function main(): Promise<void> {
  const { dryRun, force, direct } = parseArgs(process.argv.slice(2));
  const baseUrl = (process.env.ARCANE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!dryRun && !direct && (!email || !password)) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD, or use --direct (service role from .env).');
    process.exit(1);
  }

  const drafts = loadDrafts();
  console.log(`API: ${baseUrl}`);
  console.log(`Drafts: ${drafts.length} (order: ${PUBLISH_ORDER.join(', ')})`);
  if (dryRun) console.log('Mode: dry-run');
  if (force) console.log('Mode: force (skip existing slugs only)');
  if (direct) console.log('Mode: direct (Supabase service role)');

  if (direct) {
    for (const draft of drafts) {
      console.log(`\n→ ${draft.slug}`);
      await seedDraftDirect(draft, { dryRun, force });
    }
    console.log('\nDone.');
    if (!dryRun) {
      console.log('Run backdate SQL for published_at chronological order (see plan).');
    }
    return;
  }

  let token: string | null = null;
  if (!dryRun) {
    token = await login(baseUrl, email!, password!);
    console.log('Logged in as admin.');
  }

  for (const draft of drafts) {
    console.log(`\n→ ${draft.slug}`);
    await seedDraftApi(baseUrl, token!, draft, { dryRun, force });
  }

  console.log('\nDone.');
  if (!dryRun) {
    console.log(
      'Tip: backdate published_at via Supabase SQL if chronological order in /news matters.'
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
