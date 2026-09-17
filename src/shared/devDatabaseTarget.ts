export type DevDatabaseTarget = 'local' | 'prod';

export function parseDevDatabaseTarget(raw: string | undefined): DevDatabaseTarget {
  return raw === 'prod' || raw === 'cloud' ? 'prod' : 'local';
}

export function envFileNamesForTarget(target: DevDatabaseTarget): readonly string[] {
  return target === 'prod' ? ['.env.prod.local', '.env.local', '.env'] : ['.env.local', '.env'];
}

export function supabaseHostLabel(url: string | undefined): string {
  if (!url) return 'unset';
  try {
    return new URL(url).host;
  } catch {
    return 'invalid';
  }
}

export function isLocalSupabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}
