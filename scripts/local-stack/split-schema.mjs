/**
 * Split a public schema dump into ordered sections so `db reset` names the failing file.
 * Does not split on ';' inside $dollar$ quotes.
 */
export const BOOTSTRAP_SECTIONS = [
  '01_types_tables',
  '02_constraints',
  '03_indexes',
  '04_functions',
  '05_triggers',
  '06_views',
  '07_rls',
  '08_grants',
];

export function splitSqlStatements(sql) {
  const stmts = [];
  let buf = '';
  let dollar = null;
  let i = 0;
  while (i < sql.length) {
    if (!dollar && sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl + 1;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    if (sql[i] === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        if (!dollar) dollar = tag;
        else if (dollar === tag) dollar = null;
        buf += tag;
        i += tag.length;
        continue;
      }
    }
    if (!dollar && sql[i] === ';') {
      buf += ';';
      const trimmed = buf.trim();
      if (trimmed && trimmed !== ';') stmts.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += sql[i];
    i += 1;
  }
  if (buf.trim()) stmts.push(buf);
  return stmts;
}

export function classifyStatement(stmt) {
  const body = stmt
    .replace(/^\s*--[^\n]*\n/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  const u = body.toUpperCase();
  if (u.startsWith('CREATE TYPE') || u.startsWith('CREATE TABLE')) return '01_types_tables';
  if (u.startsWith('ALTER TABLE')) return '02_constraints';
  if (u.startsWith('CREATE INDEX') || u.startsWith('CREATE UNIQUE INDEX')) return '03_indexes';
  if (u.startsWith('CREATE OR REPLACE FUNCTION') || u.startsWith('CREATE FUNCTION'))
    return '04_functions';
  if (u.startsWith('CREATE TRIGGER') || u.startsWith('DROP TRIGGER')) return '05_triggers';
  if (u.startsWith('CREATE OR REPLACE VIEW') || u.startsWith('CREATE VIEW')) return '06_views';
  if (u.includes('ENABLE ROW LEVEL SECURITY') || u.startsWith('CREATE POLICY')) return '07_rls';
  if (u.startsWith('GRANT') || u.startsWith('REVOKE') || u.startsWith('DO ')) return '08_grants';
  return null;
}

export function groupBootstrapSections(sql) {
  const grouped = Object.fromEntries(BOOTSTRAP_SECTIONS.map((k) => [k, []]));
  let last = '01_types_tables';
  for (const stmt of splitSqlStatements(sql)) {
    const kind = classifyStatement(stmt) ?? last;
    last = kind;
    grouped[kind].push(stmt.trim());
  }
  return grouped;
}

export function bootstrapMigrationName(section, index) {
  const version = String(index + 1).padStart(14, '0');
  return `${version}_bootstrap_${section}.sql`;
}

export function isGeneratedBootstrap(name) {
  return /^\d{14}_bootstrap/.test(name);
}
