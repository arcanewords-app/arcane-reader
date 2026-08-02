// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ParagraphListSkeleton } from './ParagraphListSkeleton';

describe('ParagraphListSkeleton', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders skeleton layout', () => {
    const { container } = render(<ParagraphListSkeleton />);
    expect(container.querySelector('.text-panel-unified')).toBeTruthy();
    expect(container.querySelectorAll('.paragraph-list-skeleton__row').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});
