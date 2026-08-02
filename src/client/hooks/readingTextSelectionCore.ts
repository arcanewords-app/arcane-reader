/**
 * Pure helpers for reading-mode text selection toolbar state.
 */

import type { ReadingSelectionSnapshot } from '../utils/readingSelection.js';

export const SELECTION_DEBOUNCE_MS = 100;

export interface ReadingTextSelectionState {
  text: string;
  rect: DOMRect;
  wasTruncated: boolean;
}

export function selectionStateFromSnapshot(
  snapshot: ReadingSelectionSnapshot
): ReadingTextSelectionState {
  return {
    text: snapshot.text,
    rect: snapshot.rect,
    wasTruncated: snapshot.wasTruncated,
  };
}

export function mergeSelectionOnScroll(
  prev: ReadingTextSelectionState | null,
  snapshot: ReadingSelectionSnapshot
): ReadingTextSelectionState {
  if (prev) {
    return {
      ...prev,
      rect: snapshot.rect,
      wasTruncated: snapshot.wasTruncated,
    };
  }
  return selectionStateFromSnapshot(snapshot);
}

export function shouldIgnoreDisabledSelection(enabled: boolean, hasContainer: boolean): boolean {
  return !enabled || !hasContainer;
}
