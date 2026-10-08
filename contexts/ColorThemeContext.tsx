'use client';

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserPreferences, setUserPreferences } from '@/lib/services/userPreferencesService';
import {
  COLOR_THEME_ATTRIBUTE,
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  isColorTheme,
  type ColorTheme,
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
  if (theme === DEFAULT_COLOR_THEME) {
    document.documentElement.removeAttribute(COLOR_THEME_ATTRIBUTE);
  } else {
    document.documentElement.setAttribute(COLOR_THEME_ATTRIBUTE, theme);
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
      // Writing the same value again is a no-op in every sink (storage, attribute, snapshot).
      if (prefs.colorTheme) writeStoredTheme(prefs.colorTheme);
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
