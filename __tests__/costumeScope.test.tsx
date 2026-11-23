/**
 * The costume is worn only in scope (DESIGN.md → The Costume Rule, 2026-11-21): `useThemeCostume`
 * answers the active theme's costume inside `CostumeScope` and `null` outside it; an emblem is drawn
 * only in scope; the provider puts `data-costume` on <html> for a costume theme and takes it off for a
 * palette one; the header band is in the header AND in its skeleton (the prerendered first paint holds
 * it); a synced theme name the registry does not know changes nothing. The registry is stubbed to give
 * `cyberpunk` a costume and an emblem — no theme has one yet.
 *
 * Seen red on 2026-11-21 with the svg rendered unconditionally, with the removal branch of
 * `applyThemeAttribute` dropped, with the band taken off the skeleton, and with the `isColorTheme`
 * guard dropped from the Firestore sync.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferences = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'user-1' } }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({
  getUserPreferences: vi.fn(async () => preferences.value),
  setUserPreferences: vi.fn(async () => undefined),
}));
vi.mock('@/lib/constants/colorTheme', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/constants/colorTheme')>();
  return {
    ...original,
    COLOR_THEME_META: { ...original.COLOR_THEME_META, cyberpunk: { ...original.COLOR_THEME_META.cyberpunk, costume: { resourceBar: false } } },
  };
});
vi.mock('@/lib/constants/themeCostume', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/constants/themeCostume')>();
  const art = { viewBox: '0 0 24 24', shapes: [{ kind: 'circle', cx: 12, cy: 12, r: 8, tone: 'ornament', strokeWidth: 1.5 }] } as const;
  const emblems = { cyberpunk: { fallback: art, pages: {} } };
  return {
    ...original,
    THEME_EMBLEMS: emblems,
    resolveEmblem: (theme: Parameters<typeof original.resolveEmblem>[0], page: Parameters<typeof original.resolveEmblem>[1], inScope: boolean) =>
      original.resolveEmblem(theme, page, inScope, emblems),
  };
});

import { ColorThemeProvider, useColorTheme } from '@/contexts/ColorThemeContext';
import { CostumeScope, useThemeCostume } from '@/contexts/CostumeScopeContext';
import { ThemeEmblemLead } from '@/components/ui/theme-costume';
import { PageHeader, PageHeaderSkeleton } from '@/components/layout/PageHeader';

function CostumeProbe() {
  const costume = useThemeCostume();
  return <span data-testid="costume">{costume ? 'costume' : 'none'}</span>;
}

/** Two buttons that choose a theme, the way Aspetto's swatches do. */
function ThemeButtons() {
  const { setColorTheme } = useColorTheme();
  return (
    <>
      <button type="button" onClick={() => setColorTheme('cyberpunk')}>cyberpunk</button>
      <button type="button" onClick={() => setColorTheme('default')}>default</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-costume');
  preferences.value = {};
});

describe('useThemeCostume and the emblem', () => {
  it('should answer null outside the scope and the costume inside it', () => {
    localStorage.setItem('color-theme', 'cyberpunk');
    render(
      <ColorThemeProvider>
        <CostumeProbe />
        <CostumeScope>
          <CostumeProbe />
        </CostumeScope>
      </ColorThemeProvider>,
    );
    expect(screen.getAllByTestId('costume').map((node) => node.textContent)).toEqual(['none', 'costume']);
  });

  it('should render the scope as a display: contents box', () => {
    const { container } = render(<CostumeScope><p>x</p></CostumeScope>);
    const scope = container.querySelector('[data-costume-scope]');
    expect(scope?.className).toBe('contents');
  });

  it('should return only its child out of scope, and the emblem beside it in scope', () => {
    localStorage.setItem('color-theme', 'cyberpunk');
    const { container } = render(
      <ColorThemeProvider>
        <div data-testid="out">
          <ThemeEmblemLead size={18}><h1>Fuori</h1></ThemeEmblemLead>
        </div>
        <CostumeScope>
          <div data-testid="in">
            <ThemeEmblemLead size={18}><h1>Dentro</h1></ThemeEmblemLead>
          </div>
        </CostumeScope>
      </ColorThemeProvider>,
    );
    const out = screen.getByTestId('out');
    expect(out.children).toHaveLength(1);
    expect(out.firstElementChild?.tagName).toBe('H1');
    expect(screen.getByTestId('in').querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('the costume attribute on <html>', () => {
  it('should be set for a costume theme and removed for a palette theme', () => {
    render(
      <ColorThemeProvider>
        <ThemeButtons />
      </ColorThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'cyberpunk' }));
    expect(document.documentElement.hasAttribute('data-costume')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'default' }));
    expect(document.documentElement.hasAttribute('data-costume')).toBe(false);
  });

  it('should leave the stored theme alone when the account syncs a name the registry does not know', async () => {
    preferences.value = { colorTheme: 'sepia' };
    const { getUserPreferences } = await import('@/lib/services/userPreferencesService');
    render(<ColorThemeProvider><span /></ColorThemeProvider>);
    await waitFor(() => expect(getUserPreferences).toHaveBeenCalled());
    await act(async () => {});
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('color-theme')).toBeNull();
  });
});

describe('the header band', () => {
  it('should close PageHeader and its skeleton, hidden from the reader', () => {
    for (const ui of [<PageHeader key="header" title="Storico" label="Storico" />, <PageHeaderSkeleton key="skeleton" />]) {
      const { container, unmount } = render(ui);
      const wrapper = container.firstElementChild!;
      expect(wrapper.querySelectorAll('.costume-header-band')).toHaveLength(1);
      expect(wrapper.lastElementChild?.matches('.costume-header-band[aria-hidden="true"]')).toBe(true);
      unmount();
    }
  });
});
