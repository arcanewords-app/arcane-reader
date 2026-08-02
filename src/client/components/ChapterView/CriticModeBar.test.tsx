// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChapterCriticReport } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts?.count != null ? `${key}:${opts.count}` : key,
  }),
}));

import { CriticModeBar } from './CriticModeBar.js';

function makeReport(overrides: Partial<ChapterCriticReport> = {}): ChapterCriticReport {
  return {
    strengths: 'Good pacing',
    summary: 'Overall solid translation.',
    issues: [],
    contentFingerprint: 'fp',
    paragraphCount: 10,
    model: 'gpt-test',
    tokensUsed: 100,
    durationMs: 500,
    createdAt: '2026-08-02T12:00:00.000Z',
    ...overrides,
  };
}

describe('CriticModeBar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('calls onRerun and onExit from action buttons', () => {
    const onExit = vi.fn();
    const onRerun = vi.fn();
    render(
      <CriticModeBar
        report={null}
        loading={false}
        isStale={false}
        generalIssuesCount={0}
        onExit={onExit}
        onRerun={onRerun}
      />
    );

    fireEvent.click(screen.getByText('critic.rerun'));
    fireEvent.click(screen.getByText('critic.exit'));
    expect(onRerun).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('disables action buttons while loading', () => {
    render(
      <CriticModeBar
        report={null}
        loading
        isStale={false}
        generalIssuesCount={0}
        onExit={vi.fn()}
        onRerun={vi.fn()}
      />
    );

    expect(screen.getByText('critic.rerun').closest('button')).toHaveProperty('disabled', true);
    expect(screen.getByText('critic.exit').closest('button')).toHaveProperty('disabled', true);
    expect(screen.getByText('critic.loading')).toBeTruthy();
  });

  it('shows stale banner when isStale is true', () => {
    render(
      <CriticModeBar
        report={makeReport()}
        loading={false}
        isStale
        generalIssuesCount={0}
        onExit={vi.fn()}
        onRerun={vi.fn()}
      />
    );
    expect(screen.getByRole('status').textContent).toContain('critic.staleBanner');
  });

  it('renders report summary and general issues count', () => {
    render(
      <CriticModeBar
        report={makeReport()}
        loading={false}
        isStale={false}
        generalIssuesCount={3}
        onExit={vi.fn()}
        onRerun={vi.fn()}
      />
    );

    expect(screen.getByText(/Good pacing/)).toBeTruthy();
    expect(screen.getByText(/Overall solid translation/)).toBeTruthy();
    expect(screen.getByText('critic.generalIssues:3')).toBeTruthy();
    expect(screen.getByText(/gpt-test/)).toBeTruthy();
  });
});
