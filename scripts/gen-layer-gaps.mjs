/**
 * Layer gap instrument — advisory report for component + contract blind spots.
 *
 * Usage:
 *   npm run test:gaps              # run component coverage, then report
 *   npm run test:gaps -- --reuse   # reuse coverage-component/ if present
 *
 * Always exits 0 (advisory, like mutation break: null). Not a pre-push gate.
 * Writes reports/layer-gaps.json + prints a human summary.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureNativeCwd } from './resolve-vitest.mjs';

const root = ensureNativeCwd();
const reuse = process.argv.includes('--reuse');

/** UI monsters deferred from component suite (strategy / deepen plan). */
const COMPONENT_DEFERRED = [
  'src/client/components/ReadingMode/index.tsx',
  'src/client/components/Glossary/GlossaryModal.tsx',
  'src/client/components/Sidebar/ChapterList.tsx',
  'src/client/components/Sidebar/ProcessChapters.tsx',
  'src/client/components/SearchReplace/SearchReplaceBar.tsx',
  'src/client/components/SearchReplace/ProjectSearchModal.tsx',
  'src/client/components/EntityCard/EntityPickerModal.tsx',
];

/** Zod primitives — not contract gaps. */
const SCHEMA_SKIP = new Set([
  'uuidSchema',
  'idSchema',
  'paginationQuerySchema',
  'dateQuerySchema',
  'optionalUrlSchema',
]);

/** Lab schemas deferred from contract Phase 1. */
const SCHEMA_DEFERRED_FILES = new Set(['prompt-lab.ts']);

/**
 * Client ↔ server enum-sync targets (manifest).
 * Covered when the listed test file exists under tests/contracts/.
 */
const ENUM_SYNC_TARGETS = [
  {
    id: 'news-enums',
    test: 'tests/contracts/client-server/news-enums.contract.test.ts',
    fixture: 'tests/contracts/fixtures/news-enums.json',
  },
  {
    id: 'catalog-status',
    test: 'tests/contracts/client-server/catalog-status.contract.test.ts',
    fixture: 'tests/contracts/fixtures/catalog-request-statuses.json',
  },
  {
    id: 'chapter-status',
    test: 'tests/contracts/client-server/chapter-status.contract.test.ts',
    fixture: 'tests/contracts/fixtures/chapter-statuses.json',
  },
  {
    id: 'glossary-enums',
    test: 'tests/contracts/client-server/glossary-enums.contract.test.ts',
    fixture: 'tests/contracts/fixtures/glossary-enums.json',
  },
  {
    id: 'catalog-interest-status',
    test: 'tests/contracts/client-server/catalog-interest-status.contract.test.ts',
    fixture: 'tests/contracts/fixtures/catalog-interest-statuses.json',
  },
  {
    id: 'public-entity-kinds',
    test: 'tests/contracts/client-server/public-entity-kinds.contract.test.ts',
    fixture: 'tests/contracts/fixtures/public-entity-kinds.json',
  },
  {
    id: 'supported-languages',
    test: 'tests/contracts/client-server/supported-languages.contract.test.ts',
    fixture: 'tests/contracts/fixtures/supported-languages.json',
  },
  {
    id: 'translation-status',
    test: 'tests/contracts/shared/translation-status.contract.test.ts',
    fixture: 'tests/contracts/fixtures/translation-statuses.json',
  },
  {
    id: 'cache-contract',
    test: 'tests/contracts/shared/cache-contract.contract.test.ts',
    fixture: 'tests/contracts/fixtures/cache-contract-keys.json',
  },
];

function collect(dir, pred, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      collect(full, pred, out);
      continue;
    }
    if (pred(name, full)) out.push(relative(root, full).replace(/\\/g, '/'));
  }
  return out;
}

function isSourceTs(name) {
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false;
  if (name.endsWith('.hook.test.ts')) return false;
  return name.endsWith('.ts') || name.endsWith('.tsx');
}

/** Component-layer suite only (not co-located unit `*.test.ts`). */
function hasComponentSuite(relPath) {
  if (relPath.endsWith('.tsx')) {
    const colocated = relPath.replace(/\.tsx$/, '.test.tsx');
    if (existsSync(join(root, colocated))) return colocated;
  }
  if (relPath.endsWith('.ts')) {
    const base = relPath.replace(/\.ts$/, '');
    const hookSuite = `${base}.hook.test.ts`;
    if (existsSync(join(root, hookSuite))) return hookSuite;
  }
  return null;
}

function loadCoverageSummary(dir) {
  const path = join(root, dir, 'coverage-summary.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function coverageLinesFor(summary, relPath) {
  if (!summary) return null;
  for (const [key, val] of Object.entries(summary)) {
    if (key === 'total') continue;
    const norm = key.replace(/\\/g, '/');
    if (norm.endsWith(relPath) || norm.includes(`/${relPath}`)) {
      return {
        pct: val.lines?.pct ?? 0,
        total: val.lines?.total ?? 0,
        covered: val.lines?.covered ?? 0,
      };
    }
  }
  return null;
}

function runComponentCoverage() {
  const summaryPath = join(root, 'coverage-component', 'coverage-summary.json');
  if (reuse && existsSync(summaryPath)) {
    console.log('Reusing existing coverage-component/ (--reuse)\n');
    return true;
  }
  console.log('Running component suite with coverage…\n');
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/test-component.mjs'), '--coverage'],
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
  if ((result.status ?? 1) !== 0) {
    console.error(
      '\nComponent coverage run failed; presence scan will continue without v8 data.\n'
    );
    return false;
  }
  return existsSync(summaryPath);
}

function analyzeComponent(summary) {
  const scoped = [
    ...collect(
      join(root, 'src/client/components'),
      (name) => isSourceTs(name) && name !== 'index.ts'
    ),
    ...collect(join(root, 'src/client/pages'), (name) => isSourceTs(name) && name !== 'index.ts'),
    ...collect(join(root, 'src/client/hooks'), (name) => isSourceTs(name) && name !== 'index.ts'),
  ].sort();

  const deferredSet = new Set(COMPONENT_DEFERRED);
  const gaps = [];
  const deferred = [];
  const covered = [];
  let withSuite = 0;

  for (const rel of scoped) {
    if (deferredSet.has(rel)) {
      deferred.push({ file: rel, reason: 'deferred-monster' });
      continue;
    }
    const suite = hasComponentSuite(rel);
    const cov = coverageLinesFor(summary, rel);
    const linesPct = cov?.pct ?? null;
    const executed = linesPct !== null && linesPct > 0;

    if (suite) withSuite += 1;

    if (suite || executed) {
      covered.push({
        file: rel,
        suite: suite ?? null,
        linesPct,
      });
      continue;
    }

    const lines = existsSync(join(root, rel))
      ? readFileSync(join(root, rel), 'utf8').split(/\r?\n/).length
      : 0;
    gaps.push({
      file: rel,
      lines,
      suite: null,
      linesPct: linesPct ?? 0,
    });
  }

  gaps.sort((a, b) => b.lines - a.lines);

  return {
    scopedFiles: scoped.length,
    withSuite,
    coveredCount: covered.length,
    gaps,
    deferred,
    total: summary?.total?.lines
      ? {
          linesPct: summary.total.lines.pct,
          branchesPct: summary.total.branches?.pct ?? null,
        }
      : null,
  };
}

function collectSchemaExports() {
  const dir = join(root, 'src/api/schemas');
  const files = collect(dir, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
  const schemas = [];

  for (const rel of files) {
    const base = rel.split('/').pop();
    if (SCHEMA_DEFERRED_FILES.has(base)) {
      // Still list as deferred file-level later via enum of exports
      const body = readFileSync(join(root, rel), 'utf8');
      for (const m of body.matchAll(/export const (\w+Schema)\b/g)) {
        schemas.push({ name: m[1], file: rel, status: 'deferred-lab' });
      }
      continue;
    }
    const body = readFileSync(join(root, rel), 'utf8');
    for (const m of body.matchAll(/export const (\w+Schema)\b/g)) {
      const name = m[1];
      if (SCHEMA_SKIP.has(name)) {
        schemas.push({ name, file: rel, status: 'skip' });
      } else {
        schemas.push({ name, file: rel, status: 'track' });
      }
    }
  }
  return schemas;
}

function collectContractMentions() {
  const tests = collect(join(root, 'tests/contracts'), (name) => name.endsWith('.ts'));
  const text = tests.map((rel) => readFileSync(join(root, rel), 'utf8')).join('\n');
  return text;
}

function analyzeContract() {
  const schemas = collectSchemaExports();
  const corpus = collectContractMentions();
  const gaps = [];
  const withFixture = [];
  const skipped = [];
  const deferredLab = [];

  for (const s of schemas) {
    if (s.status === 'skip') {
      skipped.push(s.name);
      continue;
    }
    if (s.status === 'deferred-lab') {
      deferredLab.push({ name: s.name, file: s.file });
      continue;
    }
    const mentioned = new RegExp(`\\b${s.name}\\b`).test(corpus);
    if (mentioned) {
      withFixture.push({ name: s.name, file: s.file });
    } else {
      gaps.push({ name: s.name, file: s.file });
    }
  }

  const enumSync = ENUM_SYNC_TARGETS.map((t) => {
    const hasTest = existsSync(join(root, t.test));
    const hasFixture = existsSync(join(root, t.fixture));
    return {
      id: t.id,
      test: t.test,
      fixture: t.fixture,
      status: hasTest && hasFixture ? 'covered' : 'gap',
      hasTest,
      hasFixture,
    };
  });

  const trackable = schemas.filter((s) => s.status === 'track');

  return {
    schemasTotal: trackable.length,
    withFixture: withFixture.length,
    gaps,
    skipped,
    deferredLab,
    enumSync,
  };
}

function printSummary(report) {
  const { component: c, contract: k } = report;
  console.log('\n========== Layer gaps (advisory) ==========');
  console.log(
    `Component CLIENT_SCOPE: ${c.scopedFiles} files | with suite: ${c.withSuite} | gaps: ${c.gaps.length} | deferred: ${c.deferred.length}`
  );
  if (c.total) {
    console.log(
      `  v8 (component suite): lines ${c.total.linesPct}%` +
        (c.total.branchesPct != null ? ` | branches ${c.total.branchesPct}%` : '')
    );
  } else {
    console.log('  v8: no coverage-component/coverage-summary.json');
  }

  const topComp = c.gaps.slice(0, 15);
  if (topComp.length) {
    console.log('\n  Top component gaps (no suite + 0% / missing v8):');
    for (const g of topComp) {
      console.log(`    ${g.lines.toString().padStart(4)} lines  ${g.file}`);
    }
    if (c.gaps.length > topComp.length) {
      console.log(`    … +${c.gaps.length - topComp.length} more`);
    }
  }

  console.log(
    `\nContract schemas (tracked): ${k.schemasTotal} | with fixture test: ${k.withFixture} | gaps: ${k.gaps.length}`
  );
  const topSch = k.gaps.slice(0, 20);
  if (topSch.length) {
    console.log('\n  Schema gaps (exported, no contract mention):');
    for (const g of topSch) {
      console.log(`    ${g.name}  (${g.file})`);
    }
    if (k.gaps.length > topSch.length) {
      console.log(`    … +${k.gaps.length - topSch.length} more`);
    }
  }

  const enumGaps = k.enumSync.filter((e) => e.status === 'gap');
  const enumOk = k.enumSync.filter((e) => e.status === 'covered');
  console.log(`\nEnum sync targets: ${enumOk.length} covered | ${enumGaps.length} gaps`);
  if (enumGaps.length) {
    for (const e of enumGaps) {
      console.log(
        `    ${e.id}  test=${e.hasTest ? 'yes' : 'MISSING'} fixture=${e.hasFixture ? 'yes' : 'MISSING'}`
      );
    }
  }

  console.log(`\nJSON: reports/layer-gaps.json`);
  console.log('===========================================\n');
}

// --- main ---
const coverageOk = runComponentCoverage();
const summary = coverageOk ? loadCoverageSummary('coverage-component') : null;
const component = analyzeComponent(summary);
const contract = analyzeContract();

const report = {
  generatedAt: new Date().toISOString(),
  component,
  contract,
};

const outPath = join(root, 'reports/layer-gaps.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

printSummary(report);

// Advisory tool — always exit 0 (even if component coverage failed).
process.exit(0);
