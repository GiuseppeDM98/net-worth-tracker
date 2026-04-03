'use client';

import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  // Initialize with the real value immediately instead of false.
  // The classic useState(false) pattern (SSR-safe default) causes an extra re-render
  // on mobile when the effect corrects false → true, which competes with rAF-based
  // animations running at mount time. Safe to read window here because all callers
  // are 'use client' components rendered only after login.
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
