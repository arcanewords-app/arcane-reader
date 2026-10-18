import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import {
  areaForPath,
  areas,
  isShellFile,
  product,
  roleByPath,
  roles,
  spines,
} from './overrides.js';
import {
  featureTitle,
  joinUrlParts,
  parseRouteDescriptions,
  segmentsMatchRoute,
  shapeKey,
  splitPath,
} from './normalize.js';
import { tokenize, type Tok } from './scan.js';
import type { AppMap, Call, Endpoint, Role, Screen } from './types.js';

const FETCH_FNS = new Set([
  'fetchJson',
  'fetchJsonDeduped',
  'fetchFormData',
  'fetchFormDataWithProgress',
  'downloadBlob',
  'openSignedDownload',
  'uploadToSignedUrl',
  'fetch',
]);

const SKIP_FOLLOW = new Set([
  'set',
  'get',
  'map',
  'filter',
  'then',
  'catch',
  'forEach',
  'push',
  'sort',
  'keys',
  'values',
  'append',
  'trim',
]);

const IMPORT_DEPTH = 2;

interface ImportBinding {
  specifier: string;
  importedName: string;
  namespace: boolean;
}

interface FnBody {
  from: number;
  to: number;
  method: boolean;
}

interface FileInfo {
  abs: string;
  rel: string;
  tokens: Tok[];
  imports: Map<string, ImportBinding>;
  functions: Map<string, FnBody>;
  localExports: Set<string>;
  exportFrom: { exported: string; local: string; from: string }[];
}

interface ServiceHit {
  label: string;
  engine: boolean;
  queue: boolean;
}

export function buildAppMap(root: string): AppMap {
  const repoRoot = resolve(root);
  const sources = new SourceCache(repoRoot);
  const descriptions = parseRouteDescriptions(
    readFileSync(join(repoRoot, '.cursor/rules/routing.mdc'), 'utf8')
  );
  const warnings: string[] = [];
  const { screens, redirects } = extractScreens(sources, descriptions, warnings);
  const screenPaths = screens.map((screen) => screen.path);
  const clientFns = extractClientFns(sources, warnings);
  const endpoints = extractEndpoints(sources);

  for (const screen of screens) {
    const files = screen.file ? walkImports(sources, screen.file, IMPORT_DEPTH) : [];
    const surface = collectSurface(sources, files, clientFns, screenPaths, redirects, warnings);
    screen.calls = surface.calls;
    screen.navigatesTo = surface.navigatesTo.filter((path) => path !== screen.path);
  }

  const shellFiles = listClientFiles(repoRoot).filter((file) => isShellFile(file));
  const shell = collectSurface(sources, shellFiles, clientFns, screenPaths, redirects, warnings);

  for (const role of roles) {
    for (const path of spines[role.id]) {
      if (!matchScreen(path, screenPaths)) warnings.push(`spine ${role.id}: missing ${path}`);
    }
  }

  const usedKeys = new Set<string>();
  const referenced: Endpoint[] = [];
  for (const call of [...screens.flatMap((screen) => screen.calls), ...shell.calls]) {
    if (!call.path) continue;
    const key = shapeKey(call.method, call.path);
    if (usedKeys.has(key)) continue;
    const endpoint = endpoints.get(key);
    if (!endpoint) {
      warnings.push(`no handler for ${call.method} ${call.path}`);
      continue;
    }
    usedKeys.add(key);
    referenced.push(endpoint);
  }

  referenced.sort(compareEndpoint);

  return {
    generatedBy: 'npm run docs:app-map',
    product,
    areas: areas.map(({ id, title, blurb }) => ({ id, title, blurb })),
    roles,
    spines,
    screens,
    shell,
    endpoints: referenced,
    warnings: [...new Set(warnings)].sort(),
  };
}

class SourceCache {
  private readonly files = new Map<string, FileInfo>();

  constructor(readonly root: string) {}

  load(absPath: string): FileInfo {
    const cached = this.files.get(absPath);
    if (cached) return cached;
    const text = readFileSync(absPath, 'utf8');
    const jsx = absPath.endsWith('.tsx');
    let tokens: Tok[];
    try {
      tokens = tokenize(text, jsx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${relative(this.root, absPath)}: ${message}`);
    }
    const info: FileInfo = {
      abs: absPath,
      rel: relative(this.root, absPath).replace(/\\/g, '/'),
      tokens,
      imports: new Map(),
      functions: new Map(),
      localExports: new Set(),
      exportFrom: [],
    };
    parseStructure(info);
    this.files.set(absPath, info);
    return info;
  }
}

function parseStructure(file: FileInfo): void {
  const tokens = file.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || token.k !== 'word') continue;
    if (token.t === 'import') {
      i = parseImport(file, i);
      continue;
    }
    if (token.t === 'export') {
      i = parseExport(file, i);
      continue;
    }
    if (token.t === 'function') {
      const name = wordAt(tokens, i + 1);
      if (name) i = recordFunction(file, name, i + 1, false);
      continue;
    }
    if (token.t === 'async' && wordAt(tokens, i + 1) === 'function') {
      const name = wordAt(tokens, i + 2);
      if (name) i = recordFunction(file, name, i + 2, false);
      continue;
    }
    const methodAt = methodNameIndex(tokens, i);
    if (methodAt !== null) {
      const name = wordAt(tokens, methodAt);
      if (name) i = recordFunction(file, name, methodAt, true);
    }
  }
}

function parseImport(file: FileInfo, index: number): number {
  const tokens = file.tokens;
  let i = index + 1;
  let typeOnly = false;
  if (wordAt(tokens, i) === 'type') {
    typeOnly = true;
    i++;
  }
  if (symAt(tokens, i) === '*') {
    i++;
    if (wordAt(tokens, i) === 'as') i++;
    const local = wordAt(tokens, i);
    i++;
    if (wordAt(tokens, i) === 'from') i++;
    const spec = strAt(tokens, i);
    if (local && spec && !typeOnly) {
      file.imports.set(local, { specifier: spec, importedName: '*', namespace: true });
    }
    return i;
  }
  if (wordAt(tokens, i) && symAt(tokens, i + 1) !== '{') {
    const local = wordAt(tokens, i);
    i++;
    if (wordAt(tokens, i) === 'from') i++;
    const spec = strAt(tokens, i);
    if (local && spec && !typeOnly) {
      file.imports.set(local, { specifier: spec, importedName: 'default', namespace: false });
    }
    return i;
  }
  if (symAt(tokens, i) === '{') {
    i++;
    const names: { local: string; imported: string; typeOnly: boolean }[] = [];
    while (i < tokens.length && symAt(tokens, i) !== '}') {
      if (symAt(tokens, i) === ',') {
        i++;
        continue;
      }
      let specType = false;
      if (wordAt(tokens, i) === 'type' && wordAt(tokens, i + 1)) {
        specType = true;
        i++;
      }
      const first = wordAt(tokens, i);
      i++;
      if (!first) break;
      if (wordAt(tokens, i) === 'as') {
        i++;
        const local = wordAt(tokens, i);
        i++;
        if (local) names.push({ local, imported: first, typeOnly: specType });
      } else {
        names.push({ local: first, imported: first, typeOnly: specType });
      }
    }
    if (symAt(tokens, i) === '}') i++;
    if (wordAt(tokens, i) === 'from') i++;
    const spec = strAt(tokens, i);
    if (spec && !typeOnly) {
      for (const name of names) {
        if (name.typeOnly) continue;
        file.imports.set(name.local, {
          specifier: spec,
          importedName: name.imported,
          namespace: false,
        });
      }
    }
  }
  return i;
}

function parseExport(file: FileInfo, index: number): number {
  const tokens = file.tokens;
  let i = index + 1;
  if (wordAt(tokens, i) === 'type') return i;
  if (
    wordAt(tokens, i) === 'function' ||
    (wordAt(tokens, i) === 'async' && wordAt(tokens, i + 1) === 'function')
  ) {
    const nameIndex = wordAt(tokens, i) === 'async' ? i + 2 : i + 1;
    const name = wordAt(tokens, nameIndex);
    if (name) {
      file.localExports.add(name);
      return recordFunction(file, name, nameIndex, false);
    }
  }
  if (wordAt(tokens, i) === 'const') {
    const name = wordAt(tokens, i + 1);
    if (name) file.localExports.add(name);
    return i;
  }
  if (symAt(tokens, i) !== '{') return i;
  i++;
  const specs: { exported: string; local: string }[] = [];
  while (i < tokens.length && symAt(tokens, i) !== '}') {
    if (symAt(tokens, i) === ',') {
      i++;
      continue;
    }
    if (wordAt(tokens, i) === 'type') i++;
    const first = wordAt(tokens, i);
    i++;
    if (!first) break;
    if (wordAt(tokens, i) === 'as') {
      i++;
      const exported = wordAt(tokens, i);
      i++;
      if (exported) specs.push({ local: first, exported });
    } else {
      specs.push({ local: first, exported: first });
    }
  }
  if (symAt(tokens, i) === '}') i++;
  if (wordAt(tokens, i) === 'from') {
    i++;
    const spec = strAt(tokens, i);
    if (spec) {
      for (const item of specs) file.exportFrom.push({ ...item, from: spec });
    }
  } else {
    for (const item of specs) file.localExports.add(item.exported);
  }
  return i;
}

function recordFunction(file: FileInfo, name: string, nameIndex: number, method: boolean): number {
  const end = functionEnd(file.tokens, nameIndex);
  if (!file.functions.has(name)) file.functions.set(name, { from: nameIndex, to: end, method });
  return end;
}

function functionEnd(tokens: Tok[], nameIndex: number): number {
  let i = nameIndex + 1;
  if (symAt(tokens, i) === '<') i = skipNest(tokens, i, '<', '>') + 1;
  if (symAt(tokens, i) === '(') i = skipNest(tokens, i, '(', ')') + 1;
  if (symAt(tokens, i) === ':') i = skipType(tokens, i + 1);
  if (symAt(tokens, i) === '=>') {
    i++;
    if (symAt(tokens, i) === '{') return skipNest(tokens, i, '{', '}');
    return i;
  }
  if (symAt(tokens, i) === '{') return skipNest(tokens, i, '{', '}');
  return Math.max(nameIndex, i - 1);
}

function methodNameIndex(tokens: Tok[], index: number): number | null {
  const prev = tokens[index - 1];
  if (!prev || prev.k !== 'sym' || !['{', ',', ';', '}'].includes(prev.t)) return null;
  let nameAt = index;
  if (wordAt(tokens, index) === 'async') nameAt = index + 1;
  const name = wordAt(tokens, nameAt);
  if (!name || name === 'function') return null;
  const after = tokens[nameAt + 1];
  if (!after || (after.t !== '(' && after.t !== '<')) return null;
  return nameAt;
}

function skipNest(tokens: Tok[], index: number, open: string, close: string): number {
  let depth = 0;
  for (let i = index; i < tokens.length; i++) {
    const token = tokens[i];
    if (token?.k === 'sym' && token.t === open) depth++;
    else if (token?.k === 'sym' && token.t === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return tokens.length - 1;
}

function skipType(tokens: Tok[], index: number): number {
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let angle = 0;
  for (let i = index; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) break;
    const flat = paren === 0 && brace === 0 && bracket === 0 && angle === 0;
    if (
      flat &&
      i > index &&
      (token.t === '{' || token.t === '=>' || token.t === ';' || token.t === ',')
    ) {
      return i;
    }
    if (token.k !== 'sym') continue;
    if (token.t === '(') paren++;
    else if (token.t === ')') paren = Math.max(0, paren - 1);
    else if (token.t === '{') brace++;
    else if (token.t === '}') brace = Math.max(0, brace - 1);
    else if (token.t === '[') bracket++;
    else if (token.t === ']') bracket = Math.max(0, bracket - 1);
    else if (token.t === '<') angle++;
    else if (token.t === '>') angle = Math.max(0, angle - 1);
  }
  return index;
}

function extractScreens(
  sources: SourceCache,
  descriptions: Map<string, string>,
  warnings: string[]
): { screens: Screen[]; redirects: Set<string> } {
  const appRouter = resolve(sources.root, 'src/client/AppRouter.tsx');
  const file = sources.load(appRouter);
  const screens: Screen[] = [];
  const redirects = new Set<string>();
  const tokens = file.tokens;

  for (let i = 0; i < tokens.length; i++) {
    if (symAt(tokens, i) !== '<') continue;
    const tag = wordAt(tokens, i + 1);
    if (!tag || tag[0] !== tag[0]?.toUpperCase()) continue;
    const third = tokens[i + 2];
    if (!third) continue;
    if (third.t === '|' || third.t === ',') continue;
    if (third.t === '>' && symAt(tokens, i + 3) === '(') continue;
    const tagInfo = readJsxTag(tokens, i);
    if (!tagInfo?.path) continue;
    i = tagInfo.end;
    const component = tagInfo.component ?? tag;
    if (component.endsWith('Redirect') || tag.endsWith('Redirect')) {
      redirects.add(tagInfo.path);
      continue;
    }
    const access: Role =
      tag === 'AdminGate'
        ? 'admin'
        : tag === 'AuthorGate'
          ? 'author'
          : (roleByPath[tagInfo.path] ?? 'guest');
    const fileAbs = resolveImportedName(sources, appRouter, component);
    if (!fileAbs) warnings.push(`screen ${tagInfo.path}: cannot resolve ${component}`);
    const description = descriptions.get(tagInfo.path) ?? '';
    if (!description) warnings.push(`screen ${tagInfo.path}: no description in routing.mdc`);
    screens.push({
      path: tagInfo.path,
      component,
      file: fileAbs ? sources.load(fileAbs).rel : '',
      access,
      areaId: areaForPath(tagInfo.path),
      title: featureTitle(description, component),
      calls: [],
      navigatesTo: [],
    });
  }

  screens.sort((left, right) => {
    const area =
      areas.findIndex((item) => item.id === left.areaId) -
      areas.findIndex((item) => item.id === right.areaId);
    if (area !== 0) return area;
    return left.path.localeCompare(right.path);
  });
  return { screens, redirects };
}

function readJsxTag(
  tokens: Tok[],
  index: number
): { path?: string; component?: string; end: number } | null {
  const attrs: Record<string, string> = {};
  let end = index + 2;
  for (let i = index + 2; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) break;
    if (token.t === '>' || (token.t === '/' && symAt(tokens, i + 1) === '>')) {
      end = token.t === '/' ? i + 1 : i;
      break;
    }
    if (token.k === 'word' && symAt(tokens, i + 1) === '=') {
      const value = tokens[i + 2];
      if (value?.k === 'str') attrs[token.t] = value.t;
      if (value?.t === '{' && wordAt(tokens, i + 3) && symAt(tokens, i + 4) === '}') {
        attrs[token.t] = wordAt(tokens, i + 3) ?? '';
      }
    }
  }
  if (!attrs.path) return null;
  return { path: attrs.path, component: attrs.component, end };
}

function extractClientFns(
  sources: SourceCache,
  warnings: string[]
): Map<string, { method: string; path: string }> {
  const fns = new Map<string, { method: string; path: string }>();
  const dir = resolve(sources.root, 'src/client/api/domains');
  for (const abs of listTs(dir)) {
    const file = sources.load(abs);
    for (const [name, body] of file.functions) {
      if (!body.method || fns.has(name)) continue;
      const found = firstApiCall(file, body);
      if (!found) warnings.push(`api.${name} has no path`);
      else fns.set(name, found);
    }
  }
  return fns;
}

function firstApiCall(file: FileInfo, body: FnBody): { method: string; path: string } | null {
  const direct = findFetch(file.tokens, body.from, body.to);
  if (direct) return direct;
  const tokens = file.tokens;
  for (let i = body.from; i < body.to; i++) {
    if (tokens[i]?.k !== 'word' || symAt(tokens, i + 1) !== '(') continue;
    const name = tokens[i]?.t;
    if (!name || FETCH_FNS.has(name)) continue;
    const local = file.functions.get(name);
    if (!local) continue;
    const nested = findFetch(file.tokens, local.from, local.to);
    if (nested) return nested;
  }
  return null;
}

function findFetch(
  tokens: Tok[],
  from: number,
  to: number
): { method: string; path: string } | null {
  for (let i = from; i < to; i++) {
    const name = tokens[i]?.k === 'word' ? tokens[i]?.t : undefined;
    if (!name || !FETCH_FNS.has(name)) continue;
    let open = i + 1;
    if (symAt(tokens, open) === '<') open = skipNest(tokens, open, '<', '>') + 1;
    if (symAt(tokens, open) !== '(') continue;
    const path = resolveFetchArg(tokens, from, open + 1);
    if (!path?.startsWith('/api')) continue;
    const fallback =
      name === 'fetchFormData' || name === 'fetchFormDataWithProgress' ? 'POST' : 'GET';
    return { method: httpMethod(tokens, open, fallback), path };
  }
  return null;
}

function resolveFetchArg(tokens: Tok[], from: number, argIndex: number): string | null {
  const direct = tokenPath(tokens[argIndex]);
  if (direct?.startsWith('/api')) return direct;
  if (tokens[argIndex]?.k === 'word' && symAt(tokens, argIndex + 1) === '(') {
    const end = skipNest(tokens, argIndex + 1, '(', ')');
    for (let k = argIndex + 2; k < end; k++) {
      const path = tokenPath(tokens[k]);
      if (path?.startsWith('/api')) return path;
    }
  }
  const name = tokens[argIndex]?.k === 'word' ? tokens[argIndex].t : undefined;
  if (!name) return null;
  for (let k = argIndex - 1; k > from; k--) {
    if (tokens[k]?.t !== name || symAt(tokens, k + 1) !== '=') continue;
    for (let j = k + 2; j < argIndex; j++) {
      if (symAt(tokens, j) === ';') break;
      const path = tokenPath(tokens[j]);
      if (path?.startsWith('/api')) return path;
    }
  }
  return null;
}

function httpMethod(tokens: Tok[], parenIndex: number, fallback: string): string {
  const end = skipNest(tokens, parenIndex, '(', ')');
  for (let i = parenIndex; i < end; i++) {
    if (
      tokens[i]?.t === 'method' &&
      (symAt(tokens, i + 1) === ':' || symAt(tokens, i + 1) === '=')
    ) {
      const value = tokens[i + 2];
      if (value?.k === 'str') return value.t.toUpperCase();
    }
  }
  return fallback;
}

function extractEndpoints(sources: SourceCache): Map<string, Endpoint> {
  const endpoints = new Map<string, Endpoint>();
  for (const abs of listTs(resolve(sources.root, 'src/api/routes'))) {
    const file = sources.load(abs);
    const tokens = file.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]?.t !== 'app' || symAt(tokens, i + 1) !== '.') continue;
      const method = wordAt(tokens, i + 2)?.toUpperCase();
      if (!method || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;
      if (symAt(tokens, i + 3) !== '(') continue;
      const path = strAt(tokens, i + 4);
      if (!path?.startsWith('/api')) continue;
      const handler = lastArgName(tokens, i + 3);
      if (!handler) continue;
      const key = shapeKey(method, path);
      if (!endpoints.has(key)) {
        endpoints.set(key, resolveHandler(sources, file, handler, method, path));
      }
    }
  }
  return endpoints;
}

function lastArgName(tokens: Tok[], parenIndex: number): string | null {
  const end = skipNest(tokens, parenIndex, '(', ')');
  let depth = 0;
  let argStart = parenIndex + 1;
  let last = '';
  const take = (start: number, stop: number): void => {
    const slice = tokens.slice(start, stop).filter((token) => token.k !== 'sym' || token.t !== ',');
    const words = slice.filter((token) => token.k === 'word');
    if (words.length === 1 && words[0]) last = words[0].t;
    if (
      words.length >= 1 &&
      slice.some((token, index) => token.k === 'word' && slice[index + 1]?.t === '(')
    ) {
      const call = slice.find((token, index) => token.k === 'word' && slice[index + 1]?.t === '(');
      if (call) last = call.t;
    }
  };
  for (let i = parenIndex + 1; i < end; i++) {
    const token = tokens[i];
    if (token?.t === '(' || token?.t === '{' || token?.t === '[') depth++;
    else if (token?.t === ')' || token?.t === '}' || token?.t === ']') depth--;
    else if (token?.t === ',' && depth === 0) {
      take(argStart, i);
      argStart = i + 1;
    }
  }
  take(argStart, end);
  return last || null;
}

function resolveHandler(
  sources: SourceCache,
  routeFile: FileInfo,
  handlerName: string,
  method: string,
  path: string
): Endpoint {
  const binding = routeFile.imports.get(handlerName);
  const handlerAbs = binding ? resolveModule(routeFile.abs, binding.specifier) : routeFile.abs;
  const file = sources.load(handlerAbs ?? routeFile.abs);
  const fn = file.functions.get(binding?.importedName ?? handlerName);
  const hits = fn ? serviceHits(sources, file, fn, 0) : [];
  const tags = new Set<string>();
  for (const hit of hits) {
    if (hit.engine) tags.add('engine');
    if (hit.queue) tags.add('queue');
  }
  return {
    method,
    path,
    handler: handlerName,
    handlerFile: file.rel,
    services: [...new Set(hits.map((hit) => hit.label))].sort(),
    tags: [...tags].sort(),
  };
}

function serviceHits(
  sources: SourceCache,
  file: FileInfo,
  body: FnBody,
  depth: number
): ServiceHit[] {
  const hits: ServiceHit[] = [];
  const seen = new Set<string>();
  const tokens = file.tokens;
  for (let i = body.from; i < body.to; i++) {
    const token = tokens[i];
    if (token?.k !== 'word' || symAt(tokens, i + 1) !== '(') {
      if (
        token?.k === 'word' &&
        symAt(tokens, i + 1) === '.' &&
        wordAt(tokens, i + 2) &&
        symAt(tokens, i + 3) === '('
      ) {
        const ns = file.imports.get(token.t);
        const method = wordAt(tokens, i + 2);
        if (ns?.namespace && method && isServiceSpecifier(ns.specifier)) {
          pushHit(sources, file, { ...ns, importedName: method }, hits, seen);
        }
      }
      continue;
    }
    const binding = file.imports.get(token.t);
    if (binding && isServiceSpecifier(binding.specifier)) {
      pushHit(sources, file, binding, hits, seen);
    } else if (depth < 1) {
      const local = file.functions.get(token.t);
      if (local && local !== body) {
        for (const hit of serviceHits(sources, file, local, depth + 1)) {
          if (!seen.has(hit.label)) {
            seen.add(hit.label);
            hits.push(hit);
          }
        }
      }
    }
  }
  return hits;
}

function pushHit(
  sources: SourceCache,
  file: FileInfo,
  binding: ImportBinding,
  hits: ServiceHit[],
  seen: Set<string>
): void {
  const base = binding.specifier.split('/').pop()?.replace(/\.js$/, '') ?? 'service';
  const label = `${base}.${binding.importedName}`;
  if (seen.has(label)) return;
  seen.add(label);
  const moduleAbs = resolveModule(file.abs, binding.specifier);
  hits.push({ label, ...moduleTags(sources, binding.specifier, moduleAbs) });
}

function moduleTags(
  sources: SourceCache,
  specifier: string,
  moduleAbs: string | null
): { engine: boolean; queue: boolean } {
  let engine = /\/engine(?:\/|$)/.test(specifier) || specifier.includes('engine-integration');
  let queue = specifier.includes('chapterQueue') || specifier.includes('Queue');
  if (!moduleAbs) return { engine, queue };
  try {
    for (const binding of sources.load(moduleAbs).imports.values()) {
      if (binding.specifier.includes('/engine')) engine = true;
      if (binding.specifier.includes('chapterQueue') || binding.specifier.includes('importJob'))
        queue = true;
    }
  } catch {
    return { engine, queue };
  }
  return { engine, queue };
}

function collectSurface(
  sources: SourceCache,
  files: string[],
  clientFns: Map<string, { method: string; path: string }>,
  screenPaths: string[],
  redirects: Set<string>,
  warnings: string[]
): { calls: Call[]; navigatesTo: string[] } {
  const calls = new Map<string, Call>();
  const targets = new Set<string>();

  for (const relFile of [...files].sort()) {
    const file = sources.load(resolve(sources.root, relFile));
    const tokens = file.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token?.t === 'route' && symAt(tokens, i + 1) === '(') {
        for (const path of routeTargets(sources, file, i + 2)) {
          const screen = matchScreen(path, screenPaths);
          if (screen) targets.add(screen);
          else if (path.startsWith('/') && !path.includes('.') && !redirects.has(path)) {
            warnings.push(`nav ${relFile}: ${path} does not match a screen`);
          }
        }
      }
      if (
        token?.t === 'api' &&
        symAt(tokens, i + 1) === '.' &&
        wordAt(tokens, i + 2) &&
        symAt(tokens, i + 3) === '('
      ) {
        const name = wordAt(tokens, i + 2) ?? '';
        const known = clientFns.get(name);
        pushCall(calls, known?.method ?? 'GET', known?.path ?? '', name, relFile);
      }
      if (token?.t === 'fetch' && symAt(tokens, i + 1) === '(') {
        const path = tokenPath(tokens[i + 2]);
        if (path?.startsWith('/api')) {
          pushCall(calls, httpMethod(tokens, i + 1, 'GET'), path, 'fetch', relFile);
        }
      }
      if (token?.t === 'href' && symAt(tokens, i + 1) === '=') {
        const path =
          tokenPath(tokens[i + 2]) ?? (tokens[i + 2]?.t === '{' ? tokenPath(tokens[i + 3]) : null);
        if (path) {
          const screen = matchScreen(path, screenPaths);
          if (screen) targets.add(screen);
        }
      }
    }
  }

  return {
    calls: [...calls.values()].sort(compareCall),
    navigatesTo: [...targets].sort(),
  };
}

function routeTargets(sources: SourceCache, file: FileInfo, argIndex: number): string[] {
  const arg = file.tokens[argIndex];
  const direct = arg ? tokenPath(arg) : null;
  if (direct) return [direct];
  const name = arg?.k === 'word' ? arg.t : undefined;
  if (!name || symAt(file.tokens, argIndex + 1) !== '(') return [];
  return pathsInFunction(sources, file, name, 0, new Set());
}

function pathsInFunction(
  sources: SourceCache,
  file: FileInfo,
  name: string,
  depth: number,
  seen: Set<string>
): string[] {
  const id = `${file.rel}:${name}`;
  if (seen.has(id) || depth > 4 || SKIP_FOLLOW.has(name)) return [];
  seen.add(id);
  const binding = file.imports.get(name);
  const ownerAbs = binding ? resolveModule(file.abs, binding.specifier) : file.abs;
  if (ownerAbs && !sources.load(ownerAbs).rel.startsWith('src/client/') && binding) return [];
  const owner = sources.load(ownerAbs ?? file.abs);
  const fn = owner.functions.get(binding?.importedName ?? name);
  if (!fn) return [];
  const paths = new Set<string>();
  const tokens = owner.tokens;
  for (let i = fn.from; i < fn.to; i++) {
    const path = tokenPath(tokens[i]);
    if (path) paths.add(path);
    const called = tokens[i]?.k === 'word' ? tokens[i]?.t : undefined;
    if (called && called !== 'route' && symAt(tokens, i + 1) === '(') {
      for (const item of pathsInFunction(sources, owner, called, depth + 1, seen)) paths.add(item);
    }
  }
  return [...paths].sort();
}

function walkImports(sources: SourceCache, startRel: string, depth: number): string[] {
  const found = new Set<string>();
  const queue: { rel: string; depth: number }[] = [{ rel: startRel, depth: 0 }];
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || found.has(item.rel)) continue;
    if (item.rel !== startRel && isShellFile(item.rel)) continue;
    if (isSkippedFile(item.rel)) continue;
    found.add(item.rel);
    if (item.depth >= depth) continue;
    const file = sources.load(resolve(sources.root, item.rel));
    for (const binding of file.imports.values()) {
      if (!binding.specifier.startsWith('.')) continue;
      const abs = resolveModule(file.abs, binding.specifier);
      if (!abs) continue;
      const targets = resolveImportedFiles(sources, abs, binding);
      for (const target of targets) {
        const rel = sources.load(target).rel;
        if (!found.has(rel)) queue.push({ rel, depth: item.depth + 1 });
      }
    }
  }
  return [...found].sort();
}

function resolveImportedFiles(sources: SourceCache, abs: string, binding: ImportBinding): string[] {
  if (binding.namespace || binding.importedName === 'default') return [abs];
  const resolved = resolveExportFile(sources, abs, binding.importedName);
  return [resolved ?? abs];
}

function resolveImportedName(sources: SourceCache, fromAbs: string, name: string): string | null {
  const file = sources.load(fromAbs);
  const binding = file.imports.get(name);
  if (!binding) return null;
  const resolved = resolveModule(fromAbs, binding.specifier);
  if (!resolved) return null;
  return resolveExportFile(sources, resolved, binding.importedName);
}

function resolveExportFile(
  sources: SourceCache,
  abs: string,
  exportName: string,
  depth = 0
): string | null {
  if (depth > 6) return null;
  const file = sources.load(abs);
  if (exportName !== 'default' && file.localExports.has(exportName)) return abs;
  if (exportName === 'default') return abs;
  for (const item of file.exportFrom) {
    if (item.exported !== exportName) continue;
    const next = resolveModule(abs, item.from);
    if (!next) return null;
    return resolveExportFile(sources, next, item.local, depth + 1);
  }
  return null;
}

function matchScreen(path: string, screens: string[]): string | null {
  const parts = splitPath(path);
  const hits = screens.filter((screen) => segmentsMatchRoute(parts, splitPath(screen)));
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.localeCompare(b));
  return hits[0] ?? null;
}

function tokenPath(token: Tok | undefined): string | null {
  if (!token) return null;
  if (token.k === 'str') {
    const bare = token.t.split('?')[0] ?? token.t;
    return bare.startsWith('/') ? bare : null;
  }
  if (token.k !== 'tmpl' || token.head === undefined) return null;
  const path = joinUrlParts(token.head, token.spans ?? []);
  return path ? (path.split('?')[0] ?? path) : null;
}

function pushCall(
  calls: Map<string, Call>,
  method: string,
  path: string,
  clientFn: string,
  relFile: string
): void {
  const key = `${method} ${path} ${clientFn}`;
  const existing = calls.get(key);
  if (existing) {
    if (!existing.callers.includes(relFile)) existing.callers.push(relFile);
    existing.callers.sort();
    return;
  }
  calls.set(key, { clientFn, method, path, callers: [relFile] });
}

function isServiceSpecifier(specifier: string): boolean {
  return specifier.includes('/services/') || specifier.includes('/engine');
}

function isSkippedFile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return (
    norm.includes('.test.') ||
    norm.endsWith('.css') ||
    norm.startsWith('src/client/api/') ||
    norm.startsWith('src/client/locales/')
  );
}

function resolveModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier).replace(/\.js$/, '');
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const abs = join(current, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(abs);
    }
  };
  walk(dir);
  return out;
}

function listClientFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const abs = join(current, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.includes('.test.')) {
        out.push(relative(root, abs).replace(/\\/g, '/'));
      }
    }
  };
  walk(join(root, 'src/client'));
  return out;
}

function wordAt(tokens: Tok[], index: number): string | undefined {
  const token = tokens[index];
  return token?.k === 'word' ? token.t : undefined;
}

function strAt(tokens: Tok[], index: number): string | undefined {
  const token = tokens[index];
  return token?.k === 'str' ? token.t : undefined;
}

function symAt(tokens: Tok[], index: number): string | undefined {
  const token = tokens[index];
  return token?.k === 'sym' ? token.t : undefined;
}

function compareCall(a: Call, b: Call): number {
  return `${a.method} ${a.path} ${a.clientFn}`.localeCompare(`${b.method} ${b.path} ${b.clientFn}`);
}

function compareEndpoint(a: Endpoint, b: Endpoint): number {
  return `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`);
}
