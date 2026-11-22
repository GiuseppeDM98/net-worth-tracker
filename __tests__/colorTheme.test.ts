/**
 * The colour theme constants and the pre-hydration script `app/layout.tsx` inlines in <head>
 * (since 2026-09-28): the script is a string, so it is run here in a bare VM with a fake `localStorage` and
 * `document` — what it does before any module loads is what these cases pin. Since 2026-11-21 it also
 * puts `data-costume` on <html> for a costume theme (DESIGN.md → The Costume Rule): seen red with the
 * script's second `indexOf` dropped; the shipped-script cases read the registry (a theme's costume is null or not).
 */
import { describe, it, expect, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  COLOR_THEMES,
  COLOR_THEME_ATTRIBUTE,
  COLOR_THEME_META,
  COSTUME_ATTRIBUTE,
  buildColorThemeInitScript,
  COLOR_THEME_INIT_SCRIPT,
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  isColorTheme,
} from '@/lib/constants/colorTheme';

/** Runs the inline script against a storage that answers `stored`, and returns what it set. */
function runInitScript(stored: string | null | (() => never), script: string = COLOR_THEME_INIT_SCRIPT) {
  const setAttribute = vi.fn();
  const localStorage = {
    getItem: vi.fn((key: string) => {
      if (typeof stored === 'function') stored();
      return key === COLOR_THEME_STORAGE_KEY ? stored : null;
    }),
  };
  runInNewContext(script, { localStorage, document: { documentElement: { setAttribute } } });
  return { setAttribute, getItem: localStorage.getItem };
}

describe('colour theme constants', () => {
  it('should accept every listed theme and nothing else', () => {
    for (const theme of COLOR_THEMES) expect(isColorTheme(theme)).toBe(true);
    expect(isColorTheme('sepia')).toBe(false);
    expect(isColorTheme(null)).toBe(false);
    expect(COLOR_THEMES).toContain(DEFAULT_COLOR_THEME);
  });
});

describe('COLOR_THEME_INIT_SCRIPT', () => {
  it('should put a stored non-default theme on the root element', () => {
    const { setAttribute } = runInitScript('cyberpunk');

    expect(setAttribute).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, 'cyberpunk');
  });

  it('should set nothing for the default theme, which is the :root block', () => {
    expect(runInitScript(DEFAULT_COLOR_THEME).setAttribute).not.toHaveBeenCalled();
  });

  it('should set nothing when nothing is stored', () => {
    expect(runInitScript(null).setAttribute).not.toHaveBeenCalled();
  });

  it('should refuse a stored value that is not a theme name', () => {
    expect(runInitScript('sepia').setAttribute).not.toHaveBeenCalled();
    expect(runInitScript('cyberpunk;x').setAttribute).not.toHaveBeenCalled();
  });

  it('should read its own key only', () => {
    const { getItem } = runInitScript('cyberpunk');

    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenCalledWith(COLOR_THEME_STORAGE_KEY);
  });

  it('should swallow a storage that throws instead of failing the page', () => {
    const throwing = () => {
      throw new Error('SecurityError');
    };

    expect(() => runInitScript(throwing)).not.toThrow();
  });
});

describe('buildColorThemeInitScript', () => {
  const script = buildColorThemeInitScript(['a', 'b'], ['b']);

  it('should put the costume attribute beside the theme for a costume theme', () => {
    const { setAttribute } = runInitScript('b', script);

    expect(setAttribute).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, 'b');
    expect(setAttribute).toHaveBeenCalledWith(COSTUME_ATTRIBUTE, '');
  });

  it('should put only the theme on <html> for a palette theme', () => {
    const { setAttribute } = runInitScript('a', script);

    expect(setAttribute).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, 'a');
    expect(setAttribute).not.toHaveBeenCalledWith(COSTUME_ATTRIBUTE, expect.anything());
  });

  it('should never set the costume attribute in the shipped script for a theme whose costume is null', () => {
    for (const theme of COLOR_THEMES.filter((name) => COLOR_THEME_META[name].costume === null)) {
      expect(runInitScript(theme).setAttribute).not.toHaveBeenCalledWith(COSTUME_ATTRIBUTE, expect.anything());
    }
  });

  it('should set the theme and the costume for egeo, and only the theme for cyberpunk', () => {
    const egeo = runInitScript('egeo').setAttribute;
    expect(egeo).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, 'egeo');
    expect(egeo).toHaveBeenCalledWith(COSTUME_ATTRIBUTE, '');

    const cyberpunk = runInitScript('cyberpunk').setAttribute;
    expect(cyberpunk).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, 'cyberpunk');
    expect(cyberpunk).not.toHaveBeenCalledWith(COSTUME_ATTRIBUTE, expect.anything());
  });

  // Seen red on 2026-11-22 with `orbita`'s `costume` set to `null` in the registry.
  it('should set the theme and the costume for orbita', () => {
    const orbita = runInitScript('orbita').setAttribute;
    expect(orbita).toHaveBeenCalledWith(COLOR_THEME_ATTRIBUTE, 'orbita');
    expect(orbita).toHaveBeenCalledWith(COSTUME_ATTRIBUTE, '');
  });
});
