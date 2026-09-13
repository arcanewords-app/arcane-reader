// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Paragraph } from '../../types.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./CriticIssueList', () => ({
  CriticIssueList: () => null,
}));

vi.mock('../../utils/text-blocks', () => ({
  renderTextWithBlocks: (text: string) => text,
}));

import { ParagraphList } from './ParagraphList.js';

const paragraphs: Paragraph[] = [
  { id: 'p1', index: 0, originalText: 'Once upon a time', translatedText: 'Жили-были', status: 'translated' },
  { id: 'p2', index: 1, originalText: 'The end', translatedText: '', status: 'pending' },
];

describe('ParagraphList', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders original and translated paragraph text', () => {
    render(<ParagraphList paragraphs={paragraphs} onSave={vi.fn()} />);
    expect(screen.getByText('Once upon a time')).toBeTruthy();
    expect(screen.getByText('The end')).toBeTruthy();
    expect(screen.getByText('Жили-были')).toBeTruthy();
  });

  it('toggles selection on empty paragraphs', () => {
    const onToggleParagraphSelection = vi.fn();
    render(
      <ParagraphList
        paragraphs={paragraphs}
        onSave={vi.fn()}
        emptyParagraphIds={['p2']}
        selectedParagraphIds={[]}
        onToggleParagraphSelection={onToggleParagraphSelection}
      />
    );
    fireEvent.click(screen.getByLabelText('paragraphList.selectParagraph'));
    expect(onToggleParagraphSelection).toHaveBeenCalledWith('p2');
  });

  it('hides original column in translation-only display', () => {
    render(
      <ParagraphList paragraphs={paragraphs} onSave={vi.fn()} isTranslationOnlyDisplay />
    );
    expect(screen.queryByText('Once upon a time')).toBeNull();
    expect(screen.getByText('Жили-были')).toBeTruthy();
  });
});
