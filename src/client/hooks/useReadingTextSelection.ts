import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { getSelectionSnapshotInContainer } from '../utils/readingSelection';
import {
  SELECTION_DEBOUNCE_MS,
  mergeSelectionOnScroll,
  selectionStateFromSnapshot,
  shouldIgnoreDisabledSelection,
  type ReadingTextSelectionState,
} from './readingTextSelectionCore.js';

export type { ReadingTextSelectionState };

interface UseReadingTextSelectionOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /** Reset toolbar when chapter changes or overlays open */
  resetKey?: string | number;
}

export function useReadingTextSelection({
  enabled,
  containerRef,
  resetKey,
}: UseReadingTextSelectionOptions) {
  const [selectionState, setSelectionState] = useState<ReadingTextSelectionState | null>(null);
  const lastSelectionRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySnapshot = useCallback(
    (snapshot: ReturnType<typeof getSelectionSnapshotInContainer>) => {
      if (!snapshot) {
        setSelectionState(null);
        return;
      }
      lastSelectionRef.current = snapshot.text;
      setSelectionState(selectionStateFromSnapshot(snapshot));
    },
    []
  );

  const syncFromDom = useCallback(() => {
    const container = containerRef.current;
    if (shouldIgnoreDisabledSelection(enabled, !!container)) {
      setSelectionState(null);
      return;
    }
    applySnapshot(getSelectionSnapshotInContainer(container!));
  }, [applySnapshot, containerRef, enabled]);

  const clearSelection = useCallback(() => {
    lastSelectionRef.current = '';
    setSelectionState(null);
  }, []);

  useEffect(() => {
    clearSelection();
  }, [resetKey, clearSelection]);

  useEffect(() => {
    if (!enabled) {
      clearSelection();
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const scheduleSync = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        syncFromDom();
      }, SELECTION_DEBOUNCE_MS);
    };

    const handlePointerUp = () => {
      // Wait for selection to settle after pointer release.
      requestAnimationFrame(() => syncFromDom());
    };

    const handleSelectionChange = () => scheduleSync();

    const handleScroll = () => {
      const snapshot = getSelectionSnapshotInContainer(container);
      if (!snapshot) {
        setSelectionState(null);
        return;
      }
      setSelectionState((prev) => mergeSelectionOnScroll(prev, snapshot));
    };

    container.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleScroll);
      window.visualViewport.addEventListener('scroll', handleScroll);
    }

    return () => {
      container.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleScroll);
        window.visualViewport.removeEventListener('scroll', handleScroll);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [clearSelection, containerRef, enabled, syncFromDom]);

  const captureCurrentSelection = useCallback((): string | null => {
    const container = containerRef.current;
    if (!container) return lastSelectionRef.current || null;
    const snapshot = getSelectionSnapshotInContainer(container);
    if (snapshot) {
      lastSelectionRef.current = snapshot.text;
      return snapshot.text;
    }
    return lastSelectionRef.current || null;
  }, [containerRef]);

  return {
    selectionState,
    lastSelectionRef,
    captureCurrentSelection,
    clearSelection,
  };
}
