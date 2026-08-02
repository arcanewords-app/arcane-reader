// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { CatalogFilterToolbar } from './CatalogFilterToolbar.js';

const defaultProps = {
  targetLanguage: '',
  onTargetLanguageChange: vi.fn(),
  languageCodes: ['ru', 'en'],
  completeOnly: false,
  onCompleteOnlyChange: vi.fn(),
  showCompleteFilter: true,
  orderAsc: false,
  onOrderAscChange: vi.fn(),
  sortByRating: false,
  onSortByRatingChange: vi.fn(),
};

describe('CatalogFilterToolbar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders toolbar', () => {
    render(<CatalogFilterToolbar {...defaultProps} />);
    expect(screen.getByRole('toolbar')).toBeTruthy();
  });

  it('calls onTargetLanguageChange when language chip is clicked', () => {
    const onTargetLanguageChange = vi.fn();
    render(
      <CatalogFilterToolbar {...defaultProps} onTargetLanguageChange={onTargetLanguageChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'language.ru' }));
    expect(onTargetLanguageChange).toHaveBeenCalledWith('ru');
  });

  it('toggles complete filter chip when showCompleteFilter is true', () => {
    const onCompleteOnlyChange = vi.fn();
    render(
      <CatalogFilterToolbar
        {...defaultProps}
        completeOnly={false}
        onCompleteOnlyChange={onCompleteOnlyChange}
        showCompleteFilter
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'home.filterCompleteOnlyAria' }));
    expect(onCompleteOnlyChange).toHaveBeenCalledWith(true);
  });

  it('hides complete filter chip when showCompleteFilter is false', () => {
    render(<CatalogFilterToolbar {...defaultProps} showCompleteFilter={false} />);
    expect(screen.queryByRole('button', { name: 'home.filterCompleteOnlyAria' })).toBeNull();
  });
});
