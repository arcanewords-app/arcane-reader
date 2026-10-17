// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditionLanguageSwitch } from './EditionLanguageSwitch';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

afterEach(() => cleanup());

describe('edition language switch', () => {
  it('renders a chip and calls onSelect', () => {
    const onSelect = vi.fn();
    render(
      <EditionLanguageSwitch
        primaryLanguage="ru"
        editionLanguages={['be']}
        activeLanguage="be"
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'language.ru' }));
    expect(onSelect).toHaveBeenCalledWith('ru');
    expect(screen.getByRole('button', { name: 'language.be' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });
});
