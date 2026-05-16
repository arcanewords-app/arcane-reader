#!/usr/bin/env npx tsx
/**
 * Generate module dependency graphs for Obsidian documentation.
 *
 * Usage:
 *   npx tsx scripts/gen-dep-graph.ts              # full docs + optional SVG
 *   npx tsx scripts/gen-dep-graph.ts --circular-only  # fast check (exit 1 if cycles)
 */

import { execFile } from 'child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import madge from 'madge';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'docs/01-reference/dependency-graphs');

const CIRCULAR_ONLY = process.argv.includes('--circular-only');
const CHECK_GRAPHVIZ = process.argv.includes('--check-graphviz');

/** Directory containing gvpr.exe / dot.exe (madge `graphVizPath`). */
let resolvedGraphVizBin: string | null | undefined;

const GRAPHVIZ_CANDIDATES = [
  () => process.env.GRAPHVIZ_BIN,
  () => process.env.GRAPHVIZ_PATH,
  () => 'C:\\Program Files\\Graphviz\\bin',
  () => 'C:\\Program Files (x86)\\Graphviz\\bin',
  findWinGetGraphvizBin,
];

function gvprPath(binDir: string): string {
  return join(binDir, process.platform === 'win32' ? 'gvpr.exe' : 'gvpr');
}

function findWinGetGraphvizBin(): string | undefined {
  const packagesRoot = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  if (!existsSync(packagesRoot)) return undefined;

  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.toLowerCase().includes('graphviz')) continue;
    const bin = join(packagesRoot, entry.name, 'bin');
    if (existsSync(gvprPath(bin))) return bin;
  }
  return undefined;
}

async function probeGraphvizBin(binDir: string): Promise<boolean> {
  try {
    await execFileAsync(gvprPath(binDir), ['-V'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function resolveGraphvizBin(): Promise<string | null> {
  if (resolvedGraphVizBin !== undefined) {
    return resolvedGraphVizBin;
  }

  for (const candidate of GRAPHVIZ_CANDIDATES) {
    const binDir = candidate()?.trim();
    if (!binDir || !existsSync(gvprPath(binDir))) continue;
    if (await probeGraphvizBin(binDir)) {
      resolvedGraphVizBin = binDir;
      return binDir;
    }
  }

  resolvedGraphVizBin = null;
  return null;
}

async function printGraphvizDiagnostics(): Promise<number> {
  console.log('Graphviz diagnostics\n');

  const pathEntries = (process.env.PATH ?? '').split(';').filter(Boolean);
  const dotInPath = pathEntries.some(
    (p) => existsSync(join(p, 'dot.exe')) || existsSync(join(p, 'dot'))
  );
  const gvprInPath = pathEntries.some((p) => existsSync(gvprPath(p)));

  console.log(`  PATH has dot:  ${dotInPath ? 'yes' : 'no'}`);
  console.log(`  PATH has gvpr: ${gvprInPath ? 'yes' : 'no'}`);
  if (process.env.GRAPHVIZ_BIN) {
    console.log(`  GRAPHVIZ_BIN: ${process.env.GRAPHVIZ_BIN}`);
  }

  for (const candidate of GRAPHVIZ_CANDIDATES) {
    const binDir = candidate()?.trim();
    if (!binDir) continue;
    const exists = existsSync(gvprPath(binDir));
    const works = exists && (await probeGraphvizBin(binDir));
    console.log(`  ${binDir}`);
    console.log(`    gvpr on disk: ${exists ? 'yes' : 'no'}, runs: ${works ? 'yes' : 'no'}`);
  }

  const resolved = await resolveGraphvizBin();
  if (resolved) {
    console.log(`\nOK — use: GRAPHVIZ_BIN=${resolved}`);
    return 0;
  }

  console.log(`
Graphviz not found. Madge needs gvpr (and dot) on PATH or via GRAPHVIZ_BIN.

Install (Windows):
  winget install graphviz.Graphviz --accept-package-agreements --accept-source-agreements

Then add to PATH (new terminal):
  C:\\Program Files\\Graphviz\\bin

Or set for one session:
  $env:GRAPHVIZ_BIN = "C:\\Program Files\\Graphviz\\bin"
  npm run docs:deps
`);
  return 1;
}

const MADGE_TS_OPTIONS = {
  ts: { skipTypeImports: true },
  tsx: { skipTypeImports: true },
} as const;

interface ScopeConfig {
  id: string;
  label: string;
  paths: string | string[];
  fileExtensions: string[];
  tsConfig: string;
}

const SCOPES: ScopeConfig[] = [
  {
    id: 'client',
    label: 'Client (Preact SPA)',
    paths: 'src/client',
    fileExtensions: ['ts', 'tsx'],
    tsConfig: 'tsconfig.client.json',
  },
  {
    id: 'server',
    label: 'Server (API, services, middleware)',
    paths: ['src/server.ts', 'src/engine', 'src/services', 'src/middleware', 'src/api'],
    fileExtensions: ['ts'],
    tsConfig: 'tsconfig.json',
  },
];

const ENGINE_SCOPE: ScopeConfig = {
  id: 'engine',
  label: 'Engine (translation pipeline)',
  paths: 'src/engine',
  fileExtensions: ['ts'],
  tsConfig: 'tsconfig.json',
};

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/** Collapse file paths to module folders for readable graphs. */
export function toModuleKey(filePath: string): string {
  const normalized = normalizePath(filePath);
  const withoutExt = normalized.replace(/\.(tsx?|jsx?)$/, '');
  const parts = withoutExt.split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'src') {
    return withoutExt;
  }
  if (parts[1] === 'client' && parts.length >= 3) {
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  return `${parts[0]}/${parts[1]}`;
}

export function aggregateModuleEdges(tree: Record<string, string[]>): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  for (const [from, deps] of Object.entries(tree)) {
    const fromMod = toModuleKey(from);
    for (const dep of deps) {
      const toMod = toModuleKey(dep);
      if (fromMod === toMod) continue;
      if (!edges.has(fromMod)) edges.set(fromMod, new Set());
      edges.get(fromMod)!.add(toMod);
    }
  }
  return edges;
}

function mermaidNodeId(moduleKey: string): string {
  return moduleKey.replace(/[^a-zA-Z0-9_]/g, '_');
}

function mermaidLabel(moduleKey: string): string {
  return moduleKey.replace(/^src\//, '');
}

export function buildMermaidFlowchart(edges: Map<string, Set<string>>, title: string): string {
  const lines: string[] = ['```mermaid', 'flowchart LR'];
  const seen = new Set<string>();

  for (const [from, targets] of edges) {
    const fromId = mermaidNodeId(from);
    if (!seen.has(fromId)) {
      lines.push(`  ${fromId}["${mermaidLabel(from)}"]`);
      seen.add(fromId);
    }
    for (const to of targets) {
      const toId = mermaidNodeId(to);
      if (!seen.has(toId)) {
        lines.push(`  ${toId}["${mermaidLabel(to)}"]`);
        seen.add(toId);
      }
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }

  if (edges.size === 0) {
    lines.push('  empty["No module edges"]');
  }

  lines.push('```');
  return [`## ${title}`, '', ...lines, ''].join('\n');
}

function formatCircularList(cycles: string[][]): string {
  if (cycles.length === 0) {
    return '_No circular dependencies._\n';
  }
  return cycles
    .map((cycle, i) => {
      const path = cycle.map((f) => `\`${normalizePath(f)}\``).join(' → ');
      return `${i + 1}. ${path}`;
    })
    .join('\n');
}

function formatModuleList(items: string[]): string {
  if (items.length === 0) {
    return '_None._\n';
  }
  return items.map((item) => `- \`${normalizePath(item)}\``).join('\n') + '\n';
}

interface FileEdge {
  from: string;
  to: string;
}

export function collectFileEdges(tree: Record<string, string[]>): FileEdge[] {
  const edges: FileEdge[] = [];
  for (const [from, deps] of Object.entries(tree)) {
    const fromPath = normalizePath(from);
    for (const dep of deps) {
      const toPath = normalizePath(dep);
      if (fromPath === toPath) continue;
      if (!fromPath.startsWith('src/') || !toPath.startsWith('src/')) continue;
      edges.push({ from: fromPath, to: toPath });
    }
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return edges;
}

export function buildReverseIndex(edges: FileEdge[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const { from, to } of edges) {
    if (!map.has(to)) map.set(to, new Set());
    map.get(to)!.add(from);
  }
  const result = new Map<string, string[]>();
  for (const [to, froms] of map) {
    result.set(to, [...froms].sort());
  }
  return result;
}

function formatFileEdgesList(edges: FileEdge[]): string {
  if (edges.length === 0) {
    return '_No file-level edges._\n';
  }
  return edges.map((e) => `- \`${e.from}\` → \`${e.to}\``).join('\n') + '\n';
}

function formatReverseLookup(index: Map<string, string[]>): string {
  const targets = [...index.keys()].sort();
  if (targets.length === 0) {
    return '_None._\n';
  }
  return targets
    .map((target) => {
      const importers = index.get(target)!;
      const lines = importers.map((f) => `  - \`${f}\``).join('\n');
      return `#### \`${target}\`\n\nImported by:\n${lines}\n`;
    })
    .join('\n');
}

export function buildFileDepsSection(label: string, tree: Record<string, string[]>): string {
  const edges = collectFileEdges(tree);
  const reverse = buildReverseIndex(edges);
  return (
    `### ${label}\n\n` +
    `${edges.length} import edge(s).\n\n` +
    `#### Import edges (from → to)\n\n` +
    formatFileEdgesList(edges) +
    `\n#### Reverse lookup (imported by)\n\n` +
    formatReverseLookup(reverse)
  );
}

export function buildFileDepsMarkdown(
  sections: Array<{ label: string; tree: Record<string, string[]> }>
): string {
  const body = sections.map((s) => buildFileDepsSection(s.label, s.tree)).join('\n');
  return (
    docFrontmatter('File-level dependencies') +
    `# File-level dependencies\n\n` +
    `Searchable import map for Obsidian and AI context. Each line is one runtime import (type-only imports excluded).\n\n` +
    `> Auto-generated by \`npm run docs:deps\`. Regenerate after moving or renaming files.\n\n` +
    `**Tips:** search for a filename (e.g. \`Header.tsx\`) — hits appear in edges and in reverse lookup.\n\n` +
    body
  );
}

function docFrontmatter(title: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `---
type: reference
status: active
domain: meta
stale: false
generated: true
updated: ${date}
title: ${title}
---

`;
}

function prependGraphvizToPath(binDir: string): () => void {
  const sep = process.platform === 'win32' ? ';' : ':';
  const previous = process.env.PATH ?? '';
  process.env.PATH = `${binDir}${sep}${previous}`;
  return () => {
    process.env.PATH = previous;
  };
}

async function analyzeScope(config: ScopeConfig) {
  const tsConfigPath = join(ROOT, config.tsConfig);
  const result = await madge(config.paths, {
    baseDir: ROOT,
    fileExtensions: config.fileExtensions,
    tsConfig: tsConfigPath,
    detectiveOptions: MADGE_TS_OPTIONS,
  });
  return { config, result };
}

async function tryWriteSvg(
  result: Awaited<ReturnType<typeof madge>>,
  filename: string
): Promise<boolean> {
  const outPath = join(OUT_DIR, filename);
  try {
    await result.image(outPath);
    console.log(`  SVG: ${normalizePath(outPath)}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  SVG skipped (${filename}): ${message}`);
    return false;
  }
}

async function runCircularCheck(): Promise<number> {
  let hasCircular = false;

  for (const scope of [...SCOPES, ENGINE_SCOPE]) {
    const { config, result } = await analyzeScope(scope);
    const circular = result.circular();
    if (circular.length > 0) {
      hasCircular = true;
      console.error(`\n[${config.id}] Circular dependencies (${circular.length}):`);
      for (const cycle of circular) {
        console.error(`  ${cycle.map(normalizePath).join(' → ')}`);
      }
    } else {
      console.log(`[${config.id}] OK — no circular dependencies`);
    }

    const warnings = result.warnings();
    if (warnings.skipped?.length) {
      console.warn(
        `[${config.id}] Skipped ${warnings.skipped.length} file(s) (run with --debug via CLI)`
      );
    }
  }

  return hasCircular ? 1 : 0;
}

async function generateDocs(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const graphVizBin = await resolveGraphvizBin();
  const restorePath = graphVizBin ? prependGraphvizToPath(graphVizBin) : null;

  const scopeResults: Array<{
    config: ScopeConfig;
    result: Awaited<ReturnType<typeof madge>>;
  }> = [];

  let engineAnalysis: Awaited<ReturnType<typeof analyzeScope>>;

  try {
    for (const scope of SCOPES) {
      console.log(`Analyzing ${scope.id}...`);
      scopeResults.push(await analyzeScope(scope));
    }

    console.log('Analyzing engine...');
    engineAnalysis = await analyzeScope(ENGINE_SCOPE);
  } finally {
    restorePath?.();
  }

  const circularSections: string[] = [];
  const orphanSections: string[] = [];
  const mermaidSections: string[] = [];

  for (const { config, result } of scopeResults) {
    const circular = result.circular();
    const orphans = result.orphans();
    const tree = result.obj();
    const edges = aggregateModuleEdges(tree);

    circularSections.push(`### ${config.label}\n\n${formatCircularList(circular)}`);
    orphanSections.push(`### ${config.label}\n\n${formatModuleList(orphans.map(normalizePath))}`);
    mermaidSections.push(buildMermaidFlowchart(edges, config.label));
  }

  const circularPath = join(OUT_DIR, 'circular-deps.md');
  writeFileSync(
    circularPath,
    docFrontmatter('Circular dependencies') +
      `# Circular dependencies\n\n` +
      `> Auto-generated by \`npm run docs:deps\`. Do not edit by hand.\n\n` +
      circularSections.join('\n')
  );
  console.log(`Wrote ${normalizePath(circularPath)}`);

  const orphansPath = join(OUT_DIR, 'orphans.md');
  writeFileSync(
    orphansPath,
    docFrontmatter('Orphan modules') +
      `# Orphan modules\n\n` +
      `Modules that nothing imports (may be entry points or dead code).\n\n` +
      `> Auto-generated by \`npm run docs:deps\`.\n\n` +
      orphanSections.join('\n')
  );
  console.log(`Wrote ${normalizePath(orphansPath)}`);

  const clientEdges = aggregateModuleEdges(
    scopeResults.find((s) => s.config.id === 'client')!.result.obj()
  );
  const serverEdges = aggregateModuleEdges(
    scopeResults.find((s) => s.config.id === 'server')!.result.obj()
  );

  const clientDepsPath = join(OUT_DIR, 'client-deps.md');
  writeFileSync(
    clientDepsPath,
    docFrontmatter('Client module dependencies') +
      `# Client module dependencies\n\n` +
      `Aggregated folder-level graph (Obsidian renders Mermaid natively).\n\n` +
      `> Auto-generated by \`npm run docs:deps\`.\n\n` +
      buildMermaidFlowchart(clientEdges, 'Client') +
      `\n## Server overview\n\n` +
      buildMermaidFlowchart(serverEdges, 'Server')
  );
  console.log(`Wrote ${normalizePath(clientDepsPath)}`);

  const fileDepsPath = join(OUT_DIR, 'file-deps.md');
  writeFileSync(
    fileDepsPath,
    buildFileDepsMarkdown(
      scopeResults.map(({ config, result }) => ({
        label: config.label,
        tree: result.obj(),
      }))
    )
  );
  console.log(`Wrote ${normalizePath(fileDepsPath)}`);

  console.log('\nGenerating SVG (requires Graphviz)...');
  if (!graphVizBin) {
    console.warn('Graphviz not found — skipping SVG. Run: npm run check:graphviz');
  } else {
    console.log(`Using Graphviz: ${graphVizBin}`);
  }

  let svgCount = 0;
  if (graphVizBin) {
    const restorePathForSvg = prependGraphvizToPath(graphVizBin);
    try {
      for (const { config, result } of scopeResults) {
        if (await tryWriteSvg(result, `${config.id}-graph.svg`)) svgCount++;
      }
      if (await tryWriteSvg(engineAnalysis.result, 'engine-graph.svg')) svgCount++;
    } finally {
      restorePathForSvg();
    }
  }

  if (svgCount === 0) {
    console.log('No SVG files written — Mermaid graphs in client-deps.md still updated.');
  }

  const allCircular = scopeResults.some(({ result }) => result.circular().length > 0);
  if (allCircular) {
    console.warn('\nWarning: circular dependencies detected — see circular-deps.md');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'src'))) {
    console.error('Run from repository root (src/ not found).');
    process.exit(1);
  }

  if (CHECK_GRAPHVIZ) {
    const code = await printGraphvizDiagnostics();
    process.exit(code);
  }

  if (CIRCULAR_ONLY) {
    const code = await runCircularCheck();
    process.exit(code);
  }

  await generateDocs();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
