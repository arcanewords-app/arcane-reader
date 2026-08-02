import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/storage.js', () => ({
  generateUniqueFilename: (prefix: string, ext: string, projectId: string) =>
    `${projectId}/${prefix}.${ext}`,
}));

import { buildImportCoverPath } from './importCoverPath.js';

describe('buildImportCoverPath', () => {
  it('uses mime subtype as extension', () => {
    expect(buildImportCoverPath('proj-1', 'image/png')).toBe('proj-1/cover.png');
  });

  it('falls back to jpg when mime has no subtype', () => {
    expect(buildImportCoverPath('proj-1', 'image')).toBe('proj-1/cover.jpg');
  });
});
