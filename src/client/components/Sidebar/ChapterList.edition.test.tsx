// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: unknown }) => children,
  PointerSensor: class PointerSensor {},
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: unknown }) => children,
  arrayMove: (items: unknown[]) => items,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: () => null,
}));

vi.mock('@dnd-kit/modifiers', () => ({
  restrictToVerticalAxis: () => undefined,
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../contexts/SystemStatusContext', () => ({
  useSystemStatus: () => ({ supabase: 'ok' }),
}));

vi.mock('./useChapterUploadQueue.js', () => ({
  useChapterUploadQueue: () => ({
    items: [],
    enqueue: vi.fn(),
    cancel: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('./UploadQueueModal.js', () => ({
  UploadQueueModal: () => null,
}));

import { ChapterList } from './ChapterList';

const chapters = [
  {
    id: 'ch-1',
    projectId: 'p1',
    number: 1,
    title: 'One',
    status: 'pending' as const,
    hasTranslation: false,
    translationMeta: {
      tokensUsed: 0,
      duration: 0,
      model: 'test',
      translatedAt: '2026-01-01',
      lastAnalysisAt: '2026-01-01',
    },
  },
];

afterEach(() => cleanup());

describe('ChapterList edition mode', () => {
  it('hides the analyzed filter for a second language', () => {
    render(
      <ChapterList
        chapters={chapters}
        selectedId={null}
        projectId="p1"
        editionMode
        onSelect={() => undefined}
        onUpload={vi.fn()}
      />
    );
    expect(screen.queryByText('chapterList.filterAnalyzed')).toBeNull();
    expect(screen.getByText('chapterList.filterPending')).toBeTruthy();
  });
});
