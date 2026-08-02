// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GlossaryEntry } from '../../types.js';

const mocks = vi.hoisted(() => ({
  getPublicationGlossary: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    getPublicationGlossary: (...args: unknown[]) => mocks.getPublicationGlossary(...args),
  },
}));

import { PublicationGlossaryModal } from './PublicationGlossaryModal.js';

const preloadedEntries: GlossaryEntry[] = [
  {
    id: 'g1',
    type: 'character',
    original: 'Alice',
    translated: 'Алиса',
  },
];

describe('PublicationGlossaryModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('does not render content when closed', () => {
    render(<PublicationGlossaryModal isOpen={false} onClose={vi.fn()} publicationId="pub-1" />);
    expect(screen.queryByText('glossary.title')).toBeNull();
  });

  it('lists preloaded glossary entries when open', () => {
    render(
      <PublicationGlossaryModal
        isOpen
        onClose={vi.fn()}
        publicationId="pub-1"
        preloadedEntries={preloadedEntries}
      />
    );

    expect(screen.getByText('glossary.title')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Алиса')).toBeTruthy();
  });

  it('fetches and lists glossary entries when not preloaded', async () => {
    mocks.getPublicationGlossary.mockResolvedValue([
      {
        id: 'g2',
        type: 'term',
        original: 'Mana',
        translated: 'Мана',
      },
    ]);

    render(<PublicationGlossaryModal isOpen onClose={vi.fn()} publicationId="pub-1" />);

    await waitFor(() => {
      expect(mocks.getPublicationGlossary).toHaveBeenCalledWith('pub-1');
      expect(screen.getByText('Mana')).toBeTruthy();
      expect(screen.getByText('Мана')).toBeTruthy();
    });
  });
});
