import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ColorTheme } from '@/lib/constants/colorTheme';

// Storybook-only stub — same public API as the real ColorThemeContext
// but with no Firebase / AuthContext dependencies.

export type { ColorTheme };

interface ColorThemeContextType {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: 'default',
  setColorTheme: () => {},
});

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>('default');

  function setColorTheme(theme: ColorTheme) {
    setColorThemeState(theme);
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
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
