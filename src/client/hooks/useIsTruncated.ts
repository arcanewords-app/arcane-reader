import { useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * Returns true when `ref` content overflows its visible box.
 * Re-measures when `active` becomes true.
 */
export function useIsTruncated(
  ref: RefObject<HTMLElement | null>,
  active: boolean
): boolean {
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    if (!active) {
      setIsTruncated(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [ref, active]);

  return isTruncated;
}
