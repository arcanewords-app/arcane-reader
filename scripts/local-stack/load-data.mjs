/**
 * Load gitignored JSON dumps into local Supabase. Never uses prod keys.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  DATA_DUMP_DIR,
  DATA_DUMP_MANIFEST,
  DATA_DUMP_TABLES,
  INSERT_BATCH,
  INSERT_BATCH_LARGE,
  SEED_AUTHOR_ID,
  SEED_IDS,
  USER_ID_COLUMNS,
} from './constants.mjs';
import {
  blockExcessTranslatorPseudonyms,
  collectTranslatorEntityIds,
  dedupeCatalogInterests,
} from './dedupe.mjs';
import { root, runCapture } from './run.mjs';

function parseStatusEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

export function localServiceClient() {
  const status = runCapture('npx', ['supabase', 'status', '-o', 'env']);
  if (status.status !== 0) {
    throw new Error('Local Supabase is not running. Start it with npm run stack:up.');
  }
  const env = parseStatusEnv(status.stdout || '');
  const url = env.API_URL;
  const key = env.SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Could not read API_URL / SERVICE_ROLE_KEY from supabase status.');
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error('Refusing to load: supabase status API_URL is not localhost.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function remapUserFks(row) {
  const next = { ...row };
  for (const col of USER_ID_COLUMNS) {
    if (next[col] && !SEED_IDS.includes(next[col])) {
      next[col] = SEED_AUTHOR_ID;
    }
  }
  return next;
}

function readDumpRows(table) {
  const file = join(root, DATA_DUMP_DIR, `${table}.json`);
  if (!existsSync(file)) return [];
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(rows) ? rows : [];
}

function prepareRows(table, rows, referencedTranslatorIds) {
  const remapped = rows.map(remapUserFks);
  if (table === 'public_entities') {
    return blockExcessTranslatorPseudonyms(remapped, referencedTranslatorIds);
  }
  if (table === 'catalog_translation_request_interests') {
    return dedupeCatalogInterests(remapped);
  }
  return remapped;
}

async function deleteAll(client, table) {
  const { error } = await client.from(table).delete().not('id', 'is', null);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    throw new Error(`truncate ${table}: ${error.message}`);
  }
}

async function insertAll(client, table, rows) {
  const batchSize =
    table === 'paragraphs' || table === 'chapters' ? INSERT_BATCH_LARGE : INSERT_BATCH;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await client.from(table).insert(chunk);
    if (error) {
      throw new Error(`insert ${table} @${i}: ${error.message}`);
    }
  }
}

export async function loadProdData() {
  const manifestPath = join(root, DATA_DUMP_MANIFEST);
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${DATA_DUMP_MANIFEST}. Run npm run stack:dump first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const tables = Array.isArray(manifest.tables) ? manifest.tables : DATA_DUMP_TABLES;
  const client = localServiceClient();
  const referencedTranslatorIds = collectTranslatorEntityIds(readDumpRows('publications'));

  console.log('Clearing local dump tables…');
  for (const table of [...tables].reverse()) {
    await deleteAll(client, table);
  }

  console.log('Inserting dump (user FKs → seed author)…');
  for (const table of tables) {
    const file = join(root, DATA_DUMP_DIR, `${table}.json`);
    if (!existsSync(file)) {
      console.warn(`  ${table}: no dump file, skip`);
      continue;
    }
    const rows = readDumpRows(table);
    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows`);
      continue;
    }
    const prepared = prepareRows(table, rows, referencedTranslatorIds);
    await insertAll(client, table, prepared);
    const extra = [];
    if (table === 'public_entities') {
      const blocked = prepared.filter(
        (row, i) => row.status === 'blocked' && rows[i]?.status === 'active'
      ).length;
      if (blocked) extra.push(`${blocked} extra translators → blocked`);
    }
    if (prepared.length !== rows.length) {
      extra.push(`deduped ${rows.length} → ${prepared.length}`);
    }
    const note = extra.length ? ` (${extra.join('; ')})` : '';
    console.log(`  ${table}: ${prepared.length} rows${note}`);
  }
}
