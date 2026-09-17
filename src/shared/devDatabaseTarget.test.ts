import { describe, expect, it } from 'vitest';
import {
  envFileNamesForTarget,
  isLocalSupabaseUrl,
  parseDevDatabaseTarget,
  supabaseHostLabel,
} from './devDatabaseTarget.js';

describe('devDatabaseTarget', () => {
  it('treats unset and local as the Docker stack', () => {
    expect(parseDevDatabaseTarget(undefined)).toBe('local');
    expect(parseDevDatabaseTarget('local')).toBe('local');
    expect(parseDevDatabaseTarget('prod')).toBe('prod');
    expect(parseDevDatabaseTarget('cloud')).toBe('prod');
  });

  it('loads the prod overlay only for the prod target', () => {
    expect(envFileNamesForTarget('local')).toEqual(['.env.local', '.env']);
    expect(envFileNamesForTarget('prod')).toEqual(['.env.prod.local', '.env.local', '.env']);
  });

  it('labels localhost vs cloud hosts', () => {
    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true);
    expect(isLocalSupabaseUrl('https://example.supabase.co')).toBe(false);
    expect(supabaseHostLabel('https://example.supabase.co')).toBe('example.supabase.co');
  });
});
