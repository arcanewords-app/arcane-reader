// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Barrel `../ui` may pull Badge (i18n); mock so Vite does not load React from react-i18next.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { PublicationRatingStars } from './PublicationRatingStars.js';

describe('PublicationRatingStars', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders star icons for avg=4', () => {
    const { container } = render(<PublicationRatingStars avg={4} />);
    const icons = container.querySelectorAll('.ui-icon');
    expect(icons.length).toBe(5);
    expect(icons[0]?.textContent).toBe('star');
    expect(icons[3]?.textContent).toBe('star');
    expect(icons[4]?.textContent).toBe('star_border');
    expect(container.firstChild).toMatchSnapshot();
  });
});
