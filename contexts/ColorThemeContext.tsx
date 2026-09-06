'use client';

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserPreferences,
  setUserPreferences,
  ColorTheme,
} from '@/lib/services/userPreferencesService';

export type { ColorTheme };

const STORAGE_KEY = 'color-theme';

interface ColorThemeContextType {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: 'default',
  setColorTheme: () => {},
});

function applyThemeAttribute(theme: ColorTheme) {
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
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
    return (localStorage.getItem(STORAGE_KEY) ?? 'default') as ColorTheme;
  } catch {
    return 'default';
  }
}

function readServerTheme(): ColorTheme {
  return 'default';
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
