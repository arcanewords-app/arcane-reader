// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useStaticPageMeta.js', () => ({
  useStaticPageMeta: vi.fn(),
}));

import { TermsPage } from './TermsPage.js';

describe('TermsPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders without crash and shows title', () => {
    render(<TermsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveProperty('textContent', 'terms.title');
  });
});
