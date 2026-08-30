/**
 * Prod data dump via PostgREST (SUPABASE_DUMP_URL + SUPABASE_DUMP_SERVICE_ROLE_KEY).
 * HTTPS / IPv4 — no pg_dump, no database password.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from '../load-env.mjs';
import {
  DATA_DUMP_DIR,
  DATA_DUMP_MANIFEST,
  DATA_DUMP_TABLES,
  POSTGREST_PAGE,
} from './constants.mjs';
import { root } from './run.mjs';

loadProjectEnv(root);

function isLocalHost(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

function dumpTarget() {
  const url = process.env.SUPABASE_DUMP_URL;
  const key = process.env.SUPABASE_DUMP_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Set SUPABASE_DUMP_URL + SUPABASE_DUMP_SERVICE_ROLE_KEY in .env.local (prod HTTPS). Does not fall back to SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (isLocalHost(url)) {
    throw new Error(
      'Dump URL is localhost. Set SUPABASE_DUMP_URL in .env.local to prod HTTPS before npm run stack:dump.'
    );
  }
  return { url, key };
}

function sanitizeDumpRows(table, rows) {
  if (table !== 'translation_reports') return rows;
  return rows.map((row) => ({ ...row, reporter_ip_hash: null }));
}

async function fetchTable(client, table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + POSTGREST_PAGE - 1);
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < POSTGREST_PAGE) break;
    from += POSTGREST_PAGE;
  }
  return rows;
}

export async function dumpProdData() {
  const { url, key } = dumpTarget();
  const host = new URL(url).host;
  console.log(`Dumping public tables from ${host} (keys not printed)…`);

  const timeoutMs = Number.parseInt(process.env.SUPABASE_REQUEST_TIMEOUT_MS ?? '120000', 10);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init = {}) => {
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        return fetch(input, { ...init, signal });
      },
    },
  });
  const dir = join(root, DATA_DUMP_DIR);
  mkdirSync(dir, { recursive: true });

  const counts = {};
  for (const table of DATA_DUMP_TABLES) {
    try {
      const rows = sanitizeDumpRows(table, await fetchTable(client, table));
      writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows));
      counts[table] = rows.length;
      console.log(`  ${table}: ${rows.length} rows`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/schema cache|does not exist|Could not find the table/i.test(message)) {
        console.warn(`  ${table}: skipped (${message})`);
        counts[table] = 0;
        continue;
      }
      throw err;
    }
  }

  const manifest = {
    dumpedAt: new Date().toISOString(),
    host,
    tables: DATA_DUMP_TABLES,
    counts,
  };
  writeFileSync(join(root, DATA_DUMP_MANIFEST), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${DATA_DUMP_DIR}/ (gitignored — do not git add -f)`);
}
