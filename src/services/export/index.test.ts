import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../../storage/database.js';

const { prepareProjectForExport, exportToEpub, exportToFb2 } = vi.hoisted(() => ({
  prepareProjectForExport: vi.fn(),
  exportToEpub: vi.fn(async () => '/tmp/book.epub'),
  exportToFb2: vi.fn(async () => '/tmp/book.fb2'),
}));

vi.mock('./common.js', () => ({ prepareProjectForExport }));
vi.mock('./epub.js', () => ({ exportToEpub }));
vi.mock('./fb2.js', () => ({ exportToFb2 }));

import { exportProject } from './index.js';

const project = {
  settings: { textBlockTypes: [{ id: 'note' }] },
} as unknown as Project;

describe('exportProject', () => {
  it('exports epub without repeating the chapter title in HTML', async () => {
    prepareProjectForExport.mockReturnValue({ chapters: [{ id: 'c1' }] });
    await expect(exportProject(project, { format: 'epub', author: 'Ada' })).resolves.toBe(
      '/tmp/book.epub'
    );
    expect(prepareProjectForExport).toHaveBeenCalledWith(
      project,
      'Ada',
      project.settings?.textBlockTypes,
      false
    );
    expect(exportToEpub).toHaveBeenCalled();
  });

  it('exports fb2 and uses the default text blocks when the project has none', async () => {
    prepareProjectForExport.mockReturnValue({ chapters: [{ id: 'c1' }] });
    const bare = { settings: {} } as unknown as Project;
    await expect(
      exportProject(bare, { format: 'fb2', outputDir: '/tmp', filename: 'book.fb2' })
    ).resolves.toBe('/tmp/book.fb2');
    const blocks = prepareProjectForExport.mock.calls.at(-1)?.[2] as unknown[];
    expect(blocks.length).toBeGreaterThan(0);
    expect(prepareProjectForExport.mock.calls.at(-1)?.[3]).toBe(true);
    expect(exportToFb2).toHaveBeenCalledWith(
      { chapters: [{ id: 'c1' }] },
      { outputDir: '/tmp', filename: 'book.fb2' }
    );
  });

  it('rejects an empty chapter list and an unknown format', async () => {
    prepareProjectForExport.mockReturnValue({ chapters: [] });
    await expect(exportProject(project, { format: 'epub' })).rejects.toThrow(
      'Нет переведенных глав для экспорта'
    );

    prepareProjectForExport.mockReturnValue({ chapters: [{ id: 'c1' }] });
    await expect(exportProject(project, { format: 'pdf' as 'epub' })).rejects.toThrow(
      'Неподдерживаемый формат: pdf'
    );
  });
});
