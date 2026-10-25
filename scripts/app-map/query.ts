import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { segmentsMatchRoute, shapeKey, splitPath } from './normalize.js';
import type { AppMap, Call, Endpoint, Screen } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const GUEST_SHOT = 'tests/e2e/specs/guest.visual.spec.ts-snapshots';
const READER_SHOT = 'tests/e2e/specs/reader.visual.spec.ts-snapshots';
const AUTHOR_SHOT = 'tests/e2e/specs/author.visual.spec.ts-snapshots';
const ADMIN_SHOT = 'tests/e2e/specs/admin.visual.spec.ts-snapshots';

/** One desktop shell per screen. Phone and tablet stay out of the query. */
const SCREEN_VISUALS: Record<string, string> = {
  '/': `${GUEST_SHOT}/guest-catalog-desktop.png`,
  '/catalog': `${GUEST_SHOT}/guest-catalog-desktop.png`,
  '/about': `${GUEST_SHOT}/guest-about-desktop.png`,
  '/account-tiers': `${GUEST_SHOT}/guest-account-tiers-desktop.png`,
  '/news': `${GUEST_SHOT}/guest-news-desktop.png`,
  '/news/:slugOrId': `${GUEST_SHOT}/guest-news-article-desktop.png`,
  '/p/:publicationId': `${GUEST_SHOT}/guest-publication-desktop.png`,
  '/p/:publicationId/chapters/:chapterId/reading': `${GUEST_SHOT}/guest-reading-desktop.png`,
  '/profile': `${READER_SHOT}/reader-profile-desktop.png`,
  '/projects': `${AUTHOR_SHOT}/author-projects-desktop.png`,
  '/projects/:projectId': `${AUTHOR_SHOT}/author-project-desktop.png`,
  '/projects/:projectId/chapters/:chapterId': `${AUTHOR_SHOT}/author-chapter-desktop.png`,
  '/projects/:projectId/chapters/:chapterId/reading': `${AUTHOR_SHOT}/author-reading-desktop.png`,
  '/projects/:projectId/reading': `${AUTHOR_SHOT}/author-reading-desktop.png`,
  '/translation-requests': `${AUTHOR_SHOT}/author-requests-desktop.png`,
  '/admin/users': `${ADMIN_SHOT}/admin-users-desktop.png`,
};

/** Desktop PNG for this screen, or `none` when no shell is allowed yet. */
export function visualForScreen(screenPath: string): string {
  return SCREEN_VISUALS[screenPath] ?? 'none';
}

export type ShotViewport = 'desktop' | 'tablet' | 'phone';

/** Path from the map HTML to a viewport PNG. The agent query keeps desktop. */
export function visualHrefForViewport(screenPath: string, viewport: ShotViewport): string | null {
  const desktop = visualHrefForHtml(screenPath);
  if (!desktop || viewport === 'desktop') return desktop;
  return desktop.replace(/-desktop\.png$/, `-${viewport}.png`);
}

/** Path from `docs/01-reference/app-map/index.html` to the desktop PNG, or null. */
export function visualHrefForHtml(screenPath: string): string | null {
  const path = visualForScreen(screenPath);
  if (path === 'none') return null;
  return `../../../${path}`;
}

/** Same number of segments; a concrete piece matches a `:param`. */
export function screenPathMatches(query: string, screenPath: string): boolean {
  const left = splitPath(query);
  const right = splitPath(screenPath);
  return left.length === right.length && segmentsMatchRoute(left, right);
}

/** Equal pattern, or the query is a prefix of the endpoint (`/api/publications`). */
export function apiPathMatches(query: string, endpointPath: string): boolean {
  const left = splitPath(query);
  const right = splitPath(endpointPath);
  if (left.length === 0 || left.length > right.length) return false;
  return segmentsMatchRoute(left, right.slice(0, left.length));
}

export function formatScreenList(map: AppMap): string {
  const lines = map.screens.map((screen) => `${screen.access}\t${screen.path}\t${screen.title}`);
  return [...lines, warningLine(map)].filter(Boolean).join('\n');
}

export function formatScreen(map: AppMap, query: string): string | null {
  const screens = map.screens.filter((screen) => screenPathMatches(query, screen.path));
  if (screens.length === 0) return null;
  return screens.map((screen) => renderScreen(map, screen)).join('\n\n');
}

export function formatApi(map: AppMap, query: string): string | null {
  const endpoints = map.endpoints.filter((endpoint) => apiPathMatches(query, endpoint.path));
  if (endpoints.length === 0) return null;
  const blocks = endpoints.map((endpoint) => renderEndpoint(map, endpoint));
  const warnings = warningLine(map);
  return warnings ? `${blocks.join('\n\n')}\n\n${warnings}` : blocks.join('\n\n');
}

function renderScreen(map: AppMap, screen: Screen): string {
  const neighbors = screen.navigatesTo.map((path) => {
    const target = map.screens.find((item) => item.path === path);
    return target ? `${path} — ${target.title}` : path;
  });
  const calls = screen.calls.map((call) => renderCall(call, findEndpoint(map, call))).join('\n');
  return [
    screen.path,
    `access: ${screen.access}`,
    `title: ${screen.title}`,
    `file: ${screen.file || '—'}`,
    `visual: ${visualForScreen(screen.path)}`,
    '',
    'goes to:',
    neighbors.length > 0 ? neighbors.map((line) => `- ${line}`).join('\n') : '- (none)',
    '',
    'calls:',
    calls || '- (none)',
  ].join('\n');
}

function renderEndpoint(map: AppMap, endpoint: Endpoint): string {
  const usedBy = callersOf(map, endpoint);
  return [
    `${endpoint.method} ${endpoint.path}`,
    `handler: ${endpoint.handler} · ${endpoint.handlerFile}`,
    `services: ${endpoint.services.join(', ') || '—'}`,
    `tags: ${endpoint.tags.join(', ') || '—'}`,
    `screens: ${usedBy.join(', ') || '—'}`,
  ].join('\n');
}

function renderCall(call: Call, endpoint: Endpoint | undefined): string {
  const client = call.clientFn === 'fetch' ? 'fetch' : `api.${call.clientFn}`;
  const lines = [`${call.method} ${call.path || '(no path)'}`, `  ${client}`];
  if (endpoint) {
    lines.push(`  ${endpoint.handler} · ${endpoint.handlerFile}`);
    if (endpoint.services.length > 0) lines.push(`  ${endpoint.services.join(', ')}`);
    if (endpoint.tags.length > 0) lines.push(`  tags: ${endpoint.tags.join(', ')}`);
  }
  return lines.join('\n');
}

function callersOf(map: AppMap, endpoint: Endpoint): string[] {
  const names: string[] = [];
  const matches = (call: Call) =>
    call.path && shapeKey(call.method, call.path) === shapeKey(endpoint.method, endpoint.path);
  if (map.shell.calls.some(matches)) names.push('shell');
  for (const screen of map.screens) {
    if (screen.calls.some(matches)) names.push(screen.path);
  }
  return names;
}

function findEndpoint(map: AppMap, call: Call): Endpoint | undefined {
  if (!call.path) return undefined;
  const key = shapeKey(call.method, call.path);
  return map.endpoints.find((endpoint) => shapeKey(endpoint.method, endpoint.path) === key);
}

function warningLine(map: AppMap): string {
  if (map.warnings.length === 0) return '';
  return `warnings (${map.warnings.length}):\n${map.warnings.map((item) => `- ${item}`).join('\n')}`;
}

function argValue(argv: string[], name: string): string | undefined {
  const flag = `--${name}`;
  const index = argv.indexOf(flag);
  if (index !== -1) return argv[index + 1];
  const inline = argv.find((item) => item.startsWith(`${flag}=`));
  return inline?.slice(flag.length + 1);
}

function main(): void {
  const argv = process.argv.slice(2);
  const screen = argValue(argv, 'screen');
  const api = argValue(argv, 'api');
  const map = JSON.parse(
    readFileSync(join(root, 'docs/01-reference/app-map/app-map.json'), 'utf8')
  ) as AppMap;

  if (!screen && !api) {
    console.log(formatScreenList(map));
    return;
  }

  const parts: string[] = [];
  if (screen) {
    const text = formatScreen(map, screen);
    if (!text) {
      console.error(`no screen matches ${screen}`);
      process.exitCode = 1;
      return;
    }
    parts.push(text);
  }
  if (api) {
    const text = formatApi(map, api);
    if (!text) {
      console.error(`no endpoint matches ${api}`);
      process.exitCode = 1;
      return;
    }
    parts.push(text);
  }
  console.log(parts.join('\n\n'));
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) main();
