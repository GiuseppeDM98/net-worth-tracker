'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [colorTheme, setColorThemeState] = useState<ColorTheme>('default');
  // Tracks the uid whose prefs have already been loaded — avoids re-fetching on rerender
  const syncedUid = useRef<string | null>(null);

  // Restore from localStorage on first client render
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) ?? 'default') as ColorTheme;
    setColorThemeState(stored);
    applyThemeAttribute(stored);
  }, []);

  // Sync from Firestore when user authenticates (once per uid)
  useEffect(() => {
    if (!user || syncedUid.current === user.uid) return;
    syncedUid.current = user.uid;

    getUserPreferences(user.uid).then((prefs) => {
      if (prefs.colorTheme && prefs.colorTheme !== colorTheme) {
        setColorThemeState(prefs.colorTheme);
        localStorage.setItem(STORAGE_KEY, prefs.colorTheme);
        applyThemeAttribute(prefs.colorTheme);
      }
    });
  }, [user?.uid]);

  function setColorTheme(theme: ColorTheme) {
    setColorThemeState(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    applyThemeAttribute(theme);
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
