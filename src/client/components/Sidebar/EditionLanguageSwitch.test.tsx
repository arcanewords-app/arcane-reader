// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentChildren } from 'preact';
import { EditionLanguageSwitch } from './EditionLanguageSwitch';
import { GlossaryEditionStub } from '../Glossary/GlossaryEditionStub';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../ui', () => ({
  Modal: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title: string;
    children: ComponentChildren;
  }) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
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

  it('opens a glossary stub without inputs', () => {
    render(<GlossaryEditionStub open language="be" onClose={() => undefined} />);
    expect(screen.getByText('edition.glossaryStubTitle')).toBeTruthy();
    expect(screen.getByText('edition.glossaryStubBody')).toBeTruthy();
    expect(document.querySelector('input, textarea')).toBeNull();
  });
});
