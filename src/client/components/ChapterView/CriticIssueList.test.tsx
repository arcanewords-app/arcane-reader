// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import type { EvaluationIssue } from '../../types';
import { CriticIssueList } from './CriticIssueList';

const sampleIssues: EvaluationIssue[] = [
  {
    paragraphIndex: 2,
    dimension: 'accuracy',
    severity: 'MAJOR',
    description: 'Term mistranslated in paragraph 3.',
  },
  {
    paragraphIndex: 5,
    dimension: 'fluency',
    severity: 'MINOR',
    description: 'Awkward phrasing.',
  },
];

describe('CriticIssueList', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders empty state when there are no issues', () => {
    render(<CriticIssueList issues={[]} />);
    expect(screen.getByText('critic.noIssues')).toBeTruthy();
  });

  it('renders issues from props', () => {
    render(<CriticIssueList issues={sampleIssues} />);
    expect(screen.getByText('Term mistranslated in paragraph 3.')).toBeTruthy();
    expect(screen.getByText('Awkward phrasing.')).toBeTruthy();
    expect(screen.getByText('critic.severity.MAJOR')).toBeTruthy();
    expect(screen.getByText('critic.dimension.accuracy')).toBeTruthy();
    expect(document.querySelectorAll('.critic-issue-item').length).toBe(2);
  });
});
