// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../ui', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

import { ReadingSelectionToolbar } from './ReadingSelectionToolbar.js';

describe('ReadingSelectionToolbar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when actions are empty', () => {
    const rect = new DOMRect(10, 20, 100, 20);
    render(<ReadingSelectionToolbar rect={rect} actions={[]} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('renders toolbar actions and invokes onClick', () => {
    const onClick = vi.fn();
    const rect = new DOMRect(10, 20, 100, 20);
    render(
      <ReadingSelectionToolbar
        rect={rect}
        actions={[
          {
            id: 'copy',
            icon: 'content_copy',
            labelKey: 'readingMode.copy',
            onClick,
          },
        ]}
      />
    );

    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toBeTruthy();
    const btn = screen.getByLabelText('readingMode.copy');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
