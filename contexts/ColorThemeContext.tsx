'use client';

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserPreferences, setUserPreferences } from '@/lib/services/userPreferencesService';
import {
  COLOR_THEME_ATTRIBUTE,
  COLOR_THEME_META,
  COLOR_THEME_STORAGE_KEY,
  COSTUME_ATTRIBUTE,
  DEFAULT_COLOR_THEME,
  isColorTheme,
  type ColorTheme,
  type ThemeCostume,
} from '@/lib/constants/colorTheme';

export type { ColorTheme };

// The key and the attribute live in `lib/constants/colorTheme.ts` (no 'use client'), because the
// root layout's pre-hydration script reads the same two strings from a Server Component.
const STORAGE_KEY = COLOR_THEME_STORAGE_KEY;

interface ColorThemeContextType {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: 'default',
  setColorTheme: () => {},
});

function applyThemeAttribute(theme: ColorTheme) {
  const root = document.documentElement;
  if (theme === DEFAULT_COLOR_THEME) {
    root.removeAttribute(COLOR_THEME_ATTRIBUTE);
  } else {
    root.setAttribute(COLOR_THEME_ATTRIBUTE, theme);
  }
  // The costume's gate, the same the <head> script sets (DESIGN.md → The Costume Rule).
  if (COLOR_THEME_META[theme].costume) {
    root.setAttribute(COSTUME_ATTRIBUTE, '');
  } else {
    root.removeAttribute(COSTUME_ATTRIBUTE);
  }
}

// ─── The theme as an external store ──────────────────────────────────────────
//
// localStorage is the source of truth on the client and does not exist on the server, so the
// theme is read through `useSyncExternalStore`: the server snapshot is 'default', the client
// snapshot the stored value, and the hydration split is declared in the signature instead of
// being restored by an effect that sets state (react-hooks/set-state-in-effect).

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStoredTheme(): ColorTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // The same acceptance as the pre-hydration script: a stale or hand-edited value is the default.
    return isColorTheme(stored) ? stored : DEFAULT_COLOR_THEME;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

function readServerTheme(): ColorTheme {
  return DEFAULT_COLOR_THEME;
}

/** Persists the theme and applies it to the document at once — before React re-renders. */
function writeStoredTheme(theme: ColorTheme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyThemeAttribute(theme);
  listeners.forEach((listener) => listener());
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const colorTheme = useSyncExternalStore(subscribe, readStoredTheme, readServerTheme);
  // Tracks the uid whose prefs have already been loaded — avoids re-fetching on rerender
  const syncedUid = useRef<string | null>(null);

  // Keep the document attribute in step with the store — this is what restores the stored
  // theme on the first client render, when no write has happened yet.
  useEffect(() => {
    applyThemeAttribute(colorTheme);
  }, [colorTheme]);

  // Sync from Firestore when user authenticates (once per uid)
  useEffect(() => {
    if (!uid || syncedUid.current === uid) return;
    syncedUid.current = uid;

    getUserPreferences(uid).then((prefs) => {
      // Writing the same value again is a no-op in every sink (storage, attribute, snapshot). A synced
      // name the registry does not know (chosen on a newer client, a theme rolled back) leaves the
      // stored theme alone — the acceptance `readStoredTheme` already has; without the guard
      // `COLOR_THEME_META[theme]` is undefined and the sync throws.
      if (isColorTheme(prefs.colorTheme)) writeStoredTheme(prefs.colorTheme);
    });
  }, [uid]);

  function setColorTheme(theme: ColorTheme) {
    writeStoredTheme(theme);
    if (user) {
      setUserPreferences(user.uid, { colorTheme: theme });
    }
  }

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  return useContext(ColorThemeContext);
}

/**
 * Where a costume may be worn: `true` inside `CostumeScope` (contexts/CostumeScopeContext.tsx, the dashboard shell)
 * and inside a `ResponsiveModal` opened there. The context lives HERE, in the module every page already loads, so
 * `PageHeader` and `ResponsiveModal` read it without a module of their own in the shared graph: through
 * `CostumeScopeContext.tsx` Turbopack split a new shared chunk, +0,8 KB gz on every route (2026-11-21, perf:budget).
 */
export const CostumeScopeContext = createContext(false);

export const useCostumeScope = (): boolean => useContext(CostumeScopeContext);

/** The active theme's costume where one may be worn, else `null`. */
export function useThemeCostume(): ThemeCostume | null {
  const inScope = useCostumeScope();
  const { colorTheme } = useColorTheme();
  return inScope ? COLOR_THEME_META[colorTheme].costume : null;
}
