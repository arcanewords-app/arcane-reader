import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

const SCROLL_THRESHOLD = 50;
const SCROLL_UP_THRESHOLD = 50;
const EDGE_THRESHOLD = 100;

export interface UseReadingChromeOptions {
  contentRef: RefObject<HTMLDivElement | null>;
  chaptersLength: number;
  currentChapterIndex: number;
  onHideSettings?: () => void;
}

export function useReadingChrome({
  contentRef,
  chaptersLength,
  currentChapterIndex,
  onHideSettings,
}: UseReadingChromeOptions) {
  const [menuVisible, setMenuVisible] = useState(true);
  const [isNearTop, setIsNearTop] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(80);
  const [footerHeight, setFooterHeight] = useState(80);

  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollAccumRef = useRef(0);
  const scrollUpAccumRef = useRef(0);

  const measureChrome = useCallback(() => {
    const headerEl = headerRef.current;
    const footerEl = footerRef.current;
    if (headerEl) setHeaderHeight(Math.ceil(headerEl.getBoundingClientRect().height));
    if (footerEl) setFooterHeight(Math.ceil(footerEl.getBoundingClientRect().height));
  }, []);

  useLayoutEffect(() => {
    if (chaptersLength === 0) return;
    measureChrome();
  }, [chaptersLength, measureChrome]);

  useEffect(() => {
    const headerEl = headerRef.current;
    const footerEl = footerRef.current;
    if (!headerEl || !footerEl || chaptersLength === 0) return;

    const ro = new ResizeObserver(() => measureChrome());
    ro.observe(headerEl);
    ro.observe(footerEl);
    return () => ro.disconnect();
  }, [chaptersLength, measureChrome]);

  const resetOnChapterChange = useCallback(() => {
    lastScrollTopRef.current = 0;
    scrollAccumRef.current = 0;
    scrollUpAccumRef.current = 0;
    setMenuVisible(true);
    setIsNearTop(true);
    setIsNearBottom(false);
  }, []);

  // Hide menu on scroll down, show on scroll up
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let rafId: number;

    const handleScroll = () => {
      rafId = requestAnimationFrame(() => {
        const scrollTop = el.scrollTop;
        const delta = scrollTop - lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;

        const nearTop = scrollTop <= EDGE_THRESHOLD;
        const nearBottom =
          el.scrollHeight <= el.clientHeight ||
          scrollTop + el.clientHeight >= el.scrollHeight - EDGE_THRESHOLD;
        setIsNearTop(nearTop);
        setIsNearBottom(nearBottom);

        if (delta > 0) {
          scrollUpAccumRef.current = 0;
          scrollAccumRef.current += delta;
          if (scrollAccumRef.current > SCROLL_THRESHOLD) {
            setMenuVisible(false);
            onHideSettings?.();
            scrollAccumRef.current = 0;
          }
        } else if (delta < 0) {
          scrollAccumRef.current = 0;
          scrollUpAccumRef.current += Math.abs(delta);
          if (scrollUpAccumRef.current > SCROLL_UP_THRESHOLD) {
            setMenuVisible(true);
            scrollUpAccumRef.current = 0;
          }
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [contentRef, currentChapterIndex, chaptersLength, onHideSettings]);

  const headerVisible = menuVisible || isNearTop;
  const footerVisible = menuVisible || isNearBottom;

  return {
    headerRef,
    footerRef,
    menuVisible,
    isNearTop,
    isNearBottom,
    headerHeight,
    footerHeight,
    headerVisible,
    footerVisible,
    resetOnChapterChange,
  };
}
