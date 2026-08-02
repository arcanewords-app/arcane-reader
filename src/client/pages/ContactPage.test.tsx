// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useStaticPageMeta.js', () => ({
  useStaticPageMeta: vi.fn(),
}));

import { ContactPage } from './ContactPage.js';

describe('ContactPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders without crash and shows title', () => {
    render(<ContactPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'contact.title'
    );
    expect(screen.getByText('contact.desc')).toBeTruthy();
    expect(screen.getByText('contact.topics')).toBeTruthy();
  });
});
