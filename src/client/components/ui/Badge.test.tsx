// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { CountBadge, StatusBadge } from './Badge.js';

describe('Badge', () => {
  afterEach(() => {
    cleanup();
  });

  it('matches snapshot for CountBadge', () => {
    const { container } = render(<CountBadge count={12} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for StatusBadge completed', () => {
    const { container } = render(<StatusBadge status="completed" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
