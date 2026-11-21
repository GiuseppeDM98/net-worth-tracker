'use client';

/**
 * Where a costume may be worn (DESIGN.md → The Costume Rule): the dashboard shell and its dialogs. The
 * boundary is a `data-costume-scope` attribute the gated rules of `app/globals.css` look for, and a
 * context the React parts read (an emblem draws nothing outside it). The landing and the access pages
 * render the same primitives outside any scope, so they keep the default costume
 * (doc/guide/temi.md § Il costume). The context and its two hooks live in `ColorThemeContext.tsx` (the
 * shared bundle's reason there) and are re-exported here, the contract's name.
 */
import type { ReactNode } from 'react';
import { CostumeScopeContext } from '@/contexts/ColorThemeContext';

export { useCostumeScope, useThemeCostume } from '@/contexts/ColorThemeContext';

/** The dashboard's costume boundary: a `display: contents` box, so no layout moves (temi.md § Il costume). */
export function CostumeScope({ children }: { children: ReactNode }) {
  return (
    <CostumeScopeContext.Provider value>
      <div data-costume-scope="" className="contents">
        {children}
      </div>
    </CostumeScopeContext.Provider>
  );
}
