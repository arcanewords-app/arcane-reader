/**
 * Express 5 route/query param helpers — params and query values may be string | string[].
 */

export function routeParam(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function requireRouteParam(value: string | string[] | undefined, name = 'param'): string {
  const s = routeParam(value);
  if (!s) throw new Error(`Missing route ${name}`);
  return s;
}

export function queryParam(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}
