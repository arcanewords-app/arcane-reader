import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { computeChromeFromScroll, computeChromeVisibility } from './readingChrome.js';

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
  const menuVisibleRef = useRef(true);

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
    menuVisibleRef.current = true;
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

        const next = computeChromeFromScroll({
          scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          delta,
          scrollAccum: scrollAccumRef.current,
          scrollUpAccum: scrollUpAccumRef.current,
          menuVisible: menuVisibleRef.current,
        });

        scrollAccumRef.current = next.scrollAccum;
        scrollUpAccumRef.current = next.scrollUpAccum;
        setIsNearTop(next.isNearTop);
        setIsNearBottom(next.isNearBottom);

        if (next.menuVisible !== menuVisibleRef.current) {
          menuVisibleRef.current = next.menuVisible;
          setMenuVisible(next.menuVisible);
        }
        if (next.didHideMenu) {
          onHideSettings?.();
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [contentRef, currentChapterIndex, chaptersLength, onHideSettings]);

  const { headerVisible, footerVisible } = computeChromeVisibility({
    menuVisible,
    isNearTop,
    isNearBottom,
  });

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
