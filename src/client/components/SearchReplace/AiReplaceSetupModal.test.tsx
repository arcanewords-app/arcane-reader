// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSearchMatch } from '../../types';

const checkBeforeTranslate = vi.fn((_estimated: number, onProceed: () => void) => {
  onProceed();
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'searchReplace.aiReplaceSelectedCount' && opts) {
        return `selected:${opts.count}:${opts.find}`;
      }
      return key;
    },
  }),
}));

vi.mock('../../hooks/useTokenLimitCheck.js', () => ({
  useTokenLimitCheck: () => ({
    checkBeforeTranslate,
    warningState: { isOpen: false, estimatedTokens: 0 },
    closeWarning: vi.fn(),
    confirmAndProceed: vi.fn(),
  }),
}));

vi.mock('../../contexts/TokenUsageContext.js', () => ({
  useTokenUsageContext: () => ({
    usage: { tokensUsed: 100, tokensLimit: 5000 },
  }),
}));

vi.mock('../../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    role: 'author_plus',
    isAtLeast: () => true,
  }),
}));

vi.mock('../TokenUsage/TokenLimitWarning.js', () => ({
  TokenLimitWarning: () => <div data-testid="token-limit-warning" />,
}));

vi.mock('../../api/client.js', () => ({
  api: {
    aiReplaceInProject: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

import { api } from '../../api/client.js';
import { AiReplaceSetupModal } from './AiReplaceSetupModal.js';

const matches: ProjectSearchMatch[] = [
  {
    chapterId: 'ch1',
    paragraphId: 'para1',
    paragraphIndex: 0,
    chapterNumber: 1,
    fullText: 'Hello world',
    snippet: 'Hello',
  },
];

describe('AiReplaceSetupModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders preset and detail fields when open', () => {
    render(
      <AiReplaceSetupModal
        isOpen
        onClose={vi.fn()}
        projectId="proj-1"
        find="foo"
        replaceHint="bar"
        selectedMatches={matches}
        onPreview={vi.fn()}
      />
    );

    expect(screen.getByText('selected:1:foo')).toBeTruthy();
    expect(document.getElementById('ai-replace-preset')).toBeTruthy();
    expect(document.getElementById('ai-replace-detail')).toBeTruthy();
    expect(screen.getByText('searchReplace.aiReplaceTargetForm')).toBeTruthy();
  });

  it('runs ai replace through token gate and calls onPreview', async () => {
    const onPreview = vi.fn();
    const onClose = vi.fn();
    vi.mocked(api.aiReplaceInProject).mockResolvedValue({
      items: [
        {
          paragraphId: 'para1',
          paragraphIndex: 0,
          chapterId: 'ch1',
          chapterNumber: 1,
          before: 'Hello world',
          after: 'Hi world',
        },
      ],
    });

    render(
      <AiReplaceSetupModal
        isOpen
        onClose={onClose}
        projectId="proj-1"
        find="foo"
        replaceHint=""
        selectedMatches={matches}
        onPreview={onPreview}
      />
    );

    const detail = document.getElementById('ai-replace-detail') as HTMLTextAreaElement;
    fireEvent.input(detail, { target: { value: 'Keep tone formal' } });
    fireEvent.click(screen.getByText('searchReplace.aiReplaceRun'));

    await waitFor(() => {
      expect(checkBeforeTranslate).toHaveBeenCalled();
      expect(api.aiReplaceInProject).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({
          find: 'foo',
          detail: 'Keep tone formal',
          paragraphs: [{ chapterId: 'ch1', paragraphId: 'para1' }],
        })
      );
      expect(onPreview).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
