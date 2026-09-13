// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ProjectActionsMenu } from './ProjectActionsMenu.js';

function renderMenu(overrides: Partial<Parameters<typeof ProjectActionsMenu>[0]> = {}) {
  const onRename = vi.fn();
  const onClone = vi.fn();
  const onDelete = vi.fn();
  render(
    <ProjectActionsMenu
      atProjectLimit={false}
      projectLimit={10}
      projectCount={2}
      hasChapters
      onRename={onRename}
      onClone={onClone}
      onCopyChapters={vi.fn()}
      onBulkDeleteChapters={vi.fn()}
      onDelete={onDelete}
      {...overrides}
    />
  );
  return { onRename, onClone, onDelete };
}

describe('ProjectActionsMenu', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('keeps the dropdown closed until the menu button is clicked', () => {
    renderMenu();
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByLabelText('projectInfo.projectMenu'));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByText('projectInfo.renameProject')).toBeTruthy();
  });

  it('runs rename and closes the menu', () => {
    const { onRename } = renderMenu();
    fireEvent.click(screen.getByLabelText('projectInfo.projectMenu'));
    fireEvent.click(screen.getByText('projectInfo.renameProject'));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('disables clone when the project limit is reached', () => {
    renderMenu({ atProjectLimit: true, projectCount: 10, projectLimit: 10 });
    fireEvent.click(screen.getByLabelText('projectInfo.projectMenu'));
    expect(
      (screen.getByText('projectInfo.cloneProject').closest('button') as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
