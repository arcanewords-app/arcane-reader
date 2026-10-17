import { useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * Returns true when `ref` content overflows by at least one line.
 * A smaller gap is the line-clamp measurement error, not a cut the user can see.
 * Re-measures when `active` becomes true.
 */
export function useIsTruncated(ref: RefObject<HTMLElement | null>, active: boolean): boolean {
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    if (!active) {
      setIsTruncated(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const parsedLine = parseFloat(style.lineHeight);
    const fontSize = parseFloat(style.fontSize);
    const lineHeight = Number.isFinite(parsedLine)
      ? parsedLine
      : (Number.isFinite(fontSize) ? fontSize : 16) * 1.4;
    setIsTruncated(el.scrollHeight - el.clientHeight >= lineHeight);
  }, [ref, active]);

  return isTruncated;
}
