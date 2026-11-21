/**
 * Impostazioni › Aspetto's colour swatches (2026-11-21): one per theme of the registry, and each
 * preview row is the theme's own block applied to a `div` (`[data-theme]`, `.dark[data-theme]`)
 * painted with `bg-background` / `bg-primary` / `bg-accent` — so a preview cannot drift from
 * `app/globals.css`, the way the hand-copied oklch literals had (three dark grounds, two «accents»
 * that were `--secondary`). Seen red with a `style={{ background }}` put back on one row.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from '@/components/ui/tabs';
import { COLOR_THEME_META, COLOR_THEMES } from '@/lib/constants/colorTheme';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({
  getUserPreferences: vi.fn(async () => ({})),
  setUserPreferences: vi.fn(async () => undefined),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

import { AspettoTab } from '@/components/settings/tabs/AspettoTab';

function renderTab() {
  return render(
    <Tabs value="aspetto">
      <AspettoTab />
    </Tabs>,
  );
}

describe('AspettoTab — the colour swatches', () => {
  it('should offer one button per theme, named by its position', () => {
    renderTab();
    COLOR_THEMES.forEach((theme, index) => {
      const name = `Colore ${index + 1} di ${COLOR_THEMES.length}: ${COLOR_THEME_META[theme].name}`;
      expect(screen.getByRole('button', { name })).toBeTruthy();
    });
  });

  it('should preview each theme with its own blocks, light row then dark row, and no inline colour', () => {
    renderTab();
    COLOR_THEMES.forEach((theme, index) => {
      const button = screen.getByRole('button', { name: new RegExp(`^Colore ${index + 1} di `) });
      const rows = button.querySelectorAll(`[data-theme="${theme}"]`);
      expect(rows, theme).toHaveLength(2);
      expect(rows[0].classList.contains('dark'), `${theme} light row`).toBe(false);
      expect(rows[1].classList.contains('dark'), `${theme} dark row`).toBe(true);
      expect(button.querySelectorAll('[style]'), `${theme}: an inline style`).toHaveLength(0);
    });
  });

  it('should carry no colour literal in its source', () => {
    const source = readFileSync(resolve(__dirname, '../components/settings/tabs/AspettoTab.tsx'), 'utf8');
    expect(source).not.toContain('oklch(');
  });
});
