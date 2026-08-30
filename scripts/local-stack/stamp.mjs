/**
 * Local stamp image: Postgres PGDATA snapshot after stack:load.
 * Does not replace the official supabase/postgres image (CLI pins that).
 *
 *   npm run stack:stamp    — export volume → arcane-reader-stamp:latest
 *   npm run stack:restore  — extract image into the db volume + start
 *
 * Future GHCR (private): docker tag arcane-reader-stamp:latest ghcr.io/arcanewords-app/arcane-reader-stamp:YYYY-MM-DD
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATA_DUMP_MANIFEST,
  POSTGRES_MAJOR,
  STAMP_DB_CONTAINER,
  STAMP_DB_VOLUME,
  STAMP_DOCKERFILE,
  STAMP_IMAGE,
  STAMP_IMAGE_LATEST,
  STAMP_SOURCE_URL,
  STAMP_WORKDIR,
} from './constants.mjs';
import { localServiceClient } from './load-data.mjs';
import { root, run, runCapture, supabase } from './run.mjs';

export function stampImageExists() {
  const result = runCapture('docker', ['image', 'inspect', STAMP_IMAGE_LATEST]);
  return result.status === 0;
}

/** STACK_STAMP=0|false skips stamp restore (bootstrap / rebuild path). */
export function stampEnabled() {
  const flag = process.env.STACK_STAMP;
  if (flag === '0' || flag === 'false') return false;
  return stampImageExists();
}

export function printStampStatus() {
  if (!stampImageExists()) {
    console.log('Stamp image: none (stack:up bootstraps from schema.sql)');
    return;
  }
  const inspect = runCapture('docker', [
    'image',
    'inspect',
    STAMP_IMAGE_LATEST,
    '--format',
    '{{.Id}} {{.Created}} {{.Size}}',
  ]);
  console.log(`Stamp image: ${STAMP_IMAGE_LATEST}`);
  if (inspect.status === 0) {
    console.log(`  ${inspect.stdout.trim()}`);
  }
  const manifest = runCapture('docker', [
    'run',
    '--rm',
    STAMP_IMAGE_LATEST,
    'cat',
    '/stamp/manifest.json',
  ]);
  if (manifest.status === 0 && manifest.stdout?.trim()) {
    console.log(manifest.stdout.trim());
  }
}

function stampWorkdir() {
  return join(root, STAMP_WORKDIR);
}

function stampDateTag() {
  return new Date().toISOString().slice(0, 10);
}

function isSupabaseRunning() {
  const status = runCapture('npx', ['supabase', 'status', '-o', 'env']);
  return status.status === 0 && /API_URL=/.test(status.stdout || '');
}

export function stopSupabaseKeepVolumes() {
  if (!isSupabaseRunning()) return;
  // Do not pass --no-backup: that flag deletes data volumes.
  supabase(['stop']);
}

function inspectPostgresImage() {
  const image = runCapture('docker', [
    'inspect',
    STAMP_DB_CONTAINER,
    '--format',
    '{{.Config.Image}}',
  ]);
  const digest = runCapture('docker', ['inspect', STAMP_DB_CONTAINER, '--format', '{{.Image}}']);
  return {
    postgresImage: image.status === 0 ? image.stdout.trim() : null,
    postgresDigest: digest.status === 0 ? digest.stdout.trim() : null,
  };
}

async function assertStampDataLoaded() {
  const client = localServiceClient();
  const publications = await client
    .from('publications')
    .select('id', { count: 'exact', head: true });
  if (publications.error) {
    throw new Error(`Could not read publications: ${publications.error.message}`);
  }
  if (!publications.count) {
    throw new Error(
      'Local DB has no publications. Run npm run stack:load before npm run stack:stamp.'
    );
  }
  const projects = await client.from('projects').select('id', { count: 'exact', head: true });
  return {
    publications: publications.count,
    projects: projects.count ?? 0,
  };
}

function readDumpManifest() {
  const path = join(root, DATA_DUMP_MANIFEST);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function removeDbVolume() {
  const inspect = runCapture('docker', ['volume', 'inspect', STAMP_DB_VOLUME]);
  if (inspect.status !== 0) return;
  const removed = runCapture('docker', ['volume', 'rm', STAMP_DB_VOLUME]);
  if (removed.status !== 0) {
    console.error(removed.stderr || removed.stdout);
    throw new Error(
      `Could not remove volume ${STAMP_DB_VOLUME}. Stop local Supabase first (npm run stack:down or stack:restore).`
    );
  }
}

function extractStampIntoVolume() {
  run('docker', ['volume', 'create', STAMP_DB_VOLUME]);
  run('docker', [
    'run',
    '--rm',
    '-v',
    `${STAMP_DB_VOLUME}:/data`,
    STAMP_IMAGE_LATEST,
    'tar',
    'xzf',
    '/stamp/pgdata.tar.gz',
    '-C',
    '/data',
  ]);
}

/**
 * Stop Supabase (keep other volumes), replace db volume from stamp image.
 * Caller starts Supabase afterwards.
 */
export function restoreStampVolume() {
  if (!stampImageExists()) {
    throw new Error(
      `Missing ${STAMP_IMAGE_LATEST}. Build with npm run stack:stamp after stack:load, or STACK_STAMP=0 npm run stack:up + stack:load.`
    );
  }
  console.log(`Restoring ${STAMP_IMAGE_LATEST} into ${STAMP_DB_VOLUME}…`);
  stopSupabaseKeepVolumes();
  removeDbVolume();
  extractStampIntoVolume();
  console.log('Stamp volume restored.');
}

export async function createStampImage() {
  if (!isSupabaseRunning()) {
    throw new Error(
      'Local Supabase is not running. Start it with npm run stack:up, then stack:load.'
    );
  }
  const liveCounts = await assertStampDataLoaded();
  const postgres = inspectPostgresImage();
  const dump = readDumpManifest();
  const workdir = stampWorkdir();
  mkdirSync(workdir, { recursive: true });

  console.log('Stopping Supabase for a consistent PGDATA checkpoint (volumes kept)…');
  stopSupabaseKeepVolumes();

  const tarPath = join(workdir, 'pgdata.tar.gz');
  rmSync(tarPath, { force: true });
  console.log(`Archiving ${STAMP_DB_VOLUME}…`);
  run('docker', [
    'run',
    '--rm',
    '-v',
    `${STAMP_DB_VOLUME}:/var/lib/postgresql/data`,
    '-v',
    `${workdir}:/out`,
    'alpine:3.21',
    'tar',
    'czf',
    '/out/pgdata.tar.gz',
    '-C',
    '/var/lib/postgresql/data',
    '.',
  ]);
  if (!existsSync(tarPath)) {
    throw new Error(`Stamp archive was not created at ${tarPath}.`);
  }

  const dateTag = stampDateTag();
  const manifest = {
    createdAt: new Date().toISOString(),
    dumpedAt: dump?.dumpedAt ?? null,
    host: dump?.host ?? null,
    counts: dump?.counts ?? liveCounts,
    liveCounts,
    postgresMajor: POSTGRES_MAJOR,
    postgresImage: postgres.postgresImage,
    postgresDigest: postgres.postgresDigest,
    dbVolume: STAMP_DB_VOLUME,
  };
  writeFileSync(join(workdir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const dockerfile = join(root, STAMP_DOCKERFILE);
  const dated = `${STAMP_IMAGE}:${dateTag}`;
  console.log(`Building ${STAMP_IMAGE_LATEST} and ${dated}…`);
  run('docker', [
    'build',
    '-f',
    dockerfile,
    '-t',
    STAMP_IMAGE_LATEST,
    '-t',
    dated,
    '--label',
    `org.opencontainers.image.source=${STAMP_SOURCE_URL}`,
    '--label',
    `arcane.stamp.postgres_major=${POSTGRES_MAJOR}`,
    ...(postgres.postgresImage
      ? ['--label', `arcane.stamp.postgres_image=${postgres.postgresImage}`]
      : []),
    ...(postgres.postgresDigest
      ? ['--label', `arcane.stamp.postgres_digest=${postgres.postgresDigest}`]
      : []),
    '--label',
    `arcane.stamp.created=${manifest.createdAt}`,
    workdir,
  ]);
  rmSync(tarPath, { force: true });
  console.log(
    `Stamp image ready: ${STAMP_IMAGE_LATEST} (${dated}). Local Docker only — do not push to a public registry.`
  );
}
