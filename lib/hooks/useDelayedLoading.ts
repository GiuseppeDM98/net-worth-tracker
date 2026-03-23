import { useEffect, useState } from 'react';

/**
 * Returns true only after `loading` has been true for longer than `delayMs`.
 *
 * Prevents "flash of skeleton" on fast data fetches: if the data arrives
 * before the delay expires the skeleton is never shown at all.
 *
 * Usage:
 *   const showSkeleton = useDelayedLoading(loading);          // 150ms default
 *   const showSkeleton = useDelayedLoading(loading, 300);     // custom delay
 *
 *   if (showSkeleton) return <MySkeleton />;
 */
export function useDelayedLoading(loading: boolean, delayMs = 150): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [loading, delayMs]);

  return show;
}
