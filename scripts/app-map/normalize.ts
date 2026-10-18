export interface UrlSpan {
  expr: string;
  literal: string;
}

/** Turn a template URL into `/api/projects/:projectId/search`, dropping the query. */
export function joinUrlParts(head: string, spans: UrlSpan[]): string | null {
  let out = '';
  const headCut = cutQuery(head);
  out += headCut.text;
  if (!headCut.stop) {
    for (const span of spans) {
      if (isQueryExpr(span.expr)) break;
      out += paramToken(span.expr);
      const lit = cutQuery(span.literal);
      out += lit.text;
      if (lit.stop) break;
    }
  }
  return cleanPath(out);
}

export function splitPath(path: string): string[] {
  const bare = path.split('?')[0]?.split('#')[0] ?? path;
  return bare.split('/').filter((part) => part.length > 0);
}

/** A literal segment matches a route param (`tag` matches `:kind`). */
export function segmentsMatchRoute(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((seg, index) => {
    const other = right[index] ?? '';
    if (seg.startsWith(':') || other.startsWith(':')) return true;
    return seg === other;
  });
}

/** Static segments must be equal. A param matches only another param. */
export function segmentsMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((seg, index) => {
    const other = right[index] ?? '';
    const leftParam = seg.startsWith(':');
    const rightParam = other.startsWith(':');
    if (leftParam || rightParam) return leftParam && rightParam;
    return seg === other;
  });
}

export function shapeKey(method: string, path: string): string {
  const segments = splitPath(path).map((seg) => (seg.startsWith(':') ? ':' : seg));
  return `${method.toUpperCase()} /${segments.join('/')}`;
}

export function featureTitle(description: string, component: string): string {
  const trimmed = description.trim();
  if (!trimmed) return componentTitle(component);
  const sentence = trimmed.split(/\.\s/)[0]?.trim() || trimmed;
  if (sentence.length > 140) return `${sentence.slice(0, 137)}...`;
  return sentence;
}

export function componentTitle(name: string): string {
  const withoutPage = name.replace(/Page$/, '');
  return withoutPage.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function splitMarkdownRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (line[i] === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += line[i];
  }
  if (current.trim()) cells.push(current.trim());
  if (cells[0] === '') cells.shift();
  if (cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/** Path → description from the frontend table in routing.mdc. */
export function parseRouteDescriptions(markdown: string): Map<string, string> {
  const start = markdown.indexOf('## Frontend Routes');
  if (start === -1) return new Map();
  const rest = markdown.slice(start);
  const next = rest.indexOf('\n## ', 1);
  const section = next === -1 ? rest : rest.slice(0, next);
  const descriptions = new Map<string, string>();
  for (const line of section.split('\n')) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length < 4 || cells[0] === 'Path') continue;
    const path = cells[0]?.replace(/^`|`$/g, '') ?? '';
    if (!path.startsWith('/')) continue;
    descriptions.set(path, cells[3] ?? '');
  }
  return descriptions;
}

export function roleAtLeast(access: string, selected: string): boolean {
  const rank: Record<string, number> = { guest: 0, user: 1, author: 2, admin: 3 };
  return (rank[access] ?? 0) <= (rank[selected] ?? 0);
}

function cutQuery(value: string): { text: string; stop: boolean } {
  const queryAt = value.indexOf('?');
  if (queryAt === -1) return { text: value, stop: false };
  return { text: value.slice(0, queryAt), stop: true };
}

function isQueryExpr(expr: string): boolean {
  const trimmed = expr.trim();
  if (trimmed.includes('?') || trimmed.includes('URLSearchParams')) return true;
  return /^(qs|q)$/.test(trimmed);
}

function paramToken(expr: string): string {
  const trimmed = expr.trim();
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) return `:${trimmed}`;
  return ':param';
}

function cleanPath(path: string): string | null {
  if (!path.startsWith('/')) return null;
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}
