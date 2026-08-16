import { describe, expect, it } from 'vitest';
import {
  computeDesiredScrollTop,
  computeReadableTop,
  computeScrollCorrectionDelta,
  findFirstVisibleParagraphIndex,
  shouldApplyScrollCorrection,
  shouldSkipInitialParagraphRestore,
  shouldSkipRouteForSameUrl,
  shouldSkipScrollToTopOnChapterChange,
  shouldSyncParagraphUrl,
} from './readingScrollRestore.js';

describe('readingScrollRestore', () => {
  it('computeScrollCorrectionDelta and threshold', () => {
    const delta = computeScrollCorrectionDelta({ top: 120 }, { top: 40 }, 20);
    expect(delta).toBe(60);
    expect(shouldApplyScrollCorrection(6)).toBe(true);
    expect(shouldApplyScrollCorrection(5)).toBe(false);
    expect(shouldApplyScrollCorrection(-6)).toBe(true);
  });

  it('findFirstVisibleParagraphIndex picks first below readable top', () => {
    expect(
      findFirstVisibleParagraphIndex(
        [
          { bottom: 90, paragraphIndex: 0 },
          { bottom: 150, paragraphIndex: 1 },
          { bottom: 200, paragraphIndex: 2 },
        ],
        100
      )
    ).toBe(1);
    expect(findFirstVisibleParagraphIndex([{ bottom: 50, paragraphIndex: 0 }], 100)).toBe(-1);
  });

  it('computeReadableTop and computeDesiredScrollTop clamp', () => {
    expect(computeReadableTop(10, 80)).toBe(90);
    expect(
      computeDesiredScrollTop({
        scrollTopBefore: 0,
        targetTop: 500,
        containerTop: 100,
        headerHeight: 80,
        scrollHeight: 2000,
        clientHeight: 800,
      })
    ).toBe(320);
    expect(
      computeDesiredScrollTop({
        scrollTopBefore: 0,
        targetTop: 5000,
        containerTop: 0,
        headerHeight: 0,
        scrollHeight: 1000,
        clientHeight: 800,
      })
    ).toBe(200);
    expect(
      computeDesiredScrollTop({
        scrollTopBefore: 0,
        targetTop: -100,
        containerTop: 0,
        headerHeight: 0,
        scrollHeight: 1000,
        clientHeight: 800,
      })
    ).toBe(0);
  });

  it('skip guards for scroll-to-top and initial restore', () => {
    expect(
      shouldSkipScrollToTopOnChapterChange({
        currentChapterId: 'c1',
        initialChapterId: 'c1',
        initialParagraphIndex: 3,
      })
    ).toBe(true);
    expect(
      shouldSkipScrollToTopOnChapterChange({
        currentChapterId: 'c1',
        initialChapterId: 'c1',
        initialParagraphIndex: 0,
      })
    ).toBe(false);

    expect(
      shouldSkipInitialParagraphRestore({
        isPublicationMode: true,
        initialParagraphIndex: 2,
        currentChapterId: 'c1',
        initialChapterId: 'c1',
        hasAppliedInitialScroll: false,
      })
    ).toBe(false);
    expect(
      shouldSkipInitialParagraphRestore({
        isPublicationMode: false,
        initialParagraphIndex: 2,
        currentChapterId: 'c1',
        initialChapterId: 'c1',
        hasAppliedInitialScroll: false,
      })
    ).toBe(true);
    expect(
      shouldSkipInitialParagraphRestore({
        isPublicationMode: true,
        initialParagraphIndex: 2,
        currentChapterId: 'c1',
        initialChapterId: 'c1',
        hasAppliedInitialScroll: true,
      })
    ).toBe(true);
  });

  it('paragraph URL sync guards', () => {
    expect(
      shouldSyncParagraphUrl({
        isPublicationMode: true,
        paragraphIndex: 2,
        lastSyncedParagraphIndex: 1,
      })
    ).toBe(true);
    expect(
      shouldSyncParagraphUrl({
        isPublicationMode: true,
        paragraphIndex: 2,
        lastSyncedParagraphIndex: 2,
      })
    ).toBe(false);
    expect(
      shouldSyncParagraphUrl({
        isPublicationMode: false,
        paragraphIndex: 2,
        lastSyncedParagraphIndex: 0,
      })
    ).toBe(false);
    expect(shouldSkipRouteForSameUrl('/a', '/a')).toBe(true);
    expect(shouldSkipRouteForSameUrl('/a', '/b')).toBe(false);
  });
});
