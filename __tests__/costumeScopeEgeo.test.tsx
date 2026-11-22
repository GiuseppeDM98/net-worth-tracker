/**
 * Egeo's temple, drawn by the REAL registry (the sibling `costumeScope.test.tsx` stubs the registry to give a
 * palette theme a costume, so this half lives in its own file: `vi.mock` is per file). The real provider reads
 * `egeo` from the storage (`useThemeCostume` calls its own module's `useColorTheme`, which a mock of the module
 * would not reach); inside `CostumeScope` the page header draws the temple twice — 18px beside the phone's title, 22px
 * before the desktop label — and outside it nothing (the landing and the access pages wear the palette only).
 *
 * Seen red with `THEME_EMBLEMS.egeo` deleted; the page cases (2026-11-22) with `pages: {}` for Egeo.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({
  getUserPreferences: vi.fn(async () => ({})),
  setUserPreferences: vi.fn(async () => undefined),
}));

import { ColorThemeProvider } from '@/contexts/ColorThemeContext';
import { CostumeScope } from '@/contexts/CostumeScopeContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { THEME_EMBLEMS } from '@/lib/constants/themeCostume';

beforeEach(() => {
  localStorage.setItem('color-theme', 'egeo');
});

const TEMPLE = 'M2 8 L11 2 L20 8 M4 8 V18 M8 8 V18 M14 8 V18 M18 8 V18 M2 20 H20';
const AMPHORA =
  'M8 2 H14 M9 2 V5 M13 2 V5 M9 5 C4 7 4 14 8 18 H14 C18 14 18 7 13 5 M9 20 H13 M10 18 V20 M12 18 V20 M9 3.5 C6 4 5.5 7 7 9 M13 3.5 C16 4 16.5 7 15 9';
const WAVES =
  'M2 9 C4 6 6 6 7 9 C8 12 10 12 11 9 C12 6 14 6 15 9 C16 12 18 12 20 9 M2 15 C4 12 6 12 7 15 C8 18 10 18 11 15 C12 12 14 12 15 15 C16 18 18 18 20 15';

describe('PageHeader in Egeo', () => {
  it('draws the temple at 18px beside the phone title and at 22px before the desktop label, inside the scope', () => {
    const { container } = render(
      <ColorThemeProvider>
        <CostumeScope>
          <PageHeader title="Novembre" label="Panoramica" />
        </CostumeScope>
      </ColorThemeProvider>,
    );
    const svgs = [...container.querySelectorAll('svg[aria-hidden="true"]')];
    expect(svgs.map((svg) => svg.getAttribute('width'))).toEqual(['18', '22']);
    for (const svg of svgs) {
      const paths = svg.querySelectorAll('path');
      expect(paths).toHaveLength(1);
      expect(paths[0].getAttribute('d')).toBe(TEMPLE);
    }
    // The 22px one sits right before the label's eyebrow, on the desktop row.
    expect(svgs[1].nextElementSibling?.textContent).toContain('Panoramica');
  });

  it('draws no svg outside the scope', () => {
    const { container } = render(
      <ColorThemeProvider>
        <PageHeader title="Novembre" label="Panoramica" />
      </ColorThemeProvider>,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('registers the temple as the fallback, and the amphora and the waves as two pages of their own', () => {
    expect(THEME_EMBLEMS.egeo?.fallback.shapes).toHaveLength(1);
    expect(Object.keys(THEME_EMBLEMS.egeo?.pages ?? {}).sort()).toEqual(['cashflow', 'patrimonio']);
  });

  // 2026-11-22: Patrimonio an amphora, Cashflow two waves; the Panoramica names its page and keeps the temple.
  it.each([
    { page: 'patrimonio', d: AMPHORA },
    { page: 'cashflow', d: WAVES },
    { page: 'panoramica', d: TEMPLE },
  ] as const)('draws the $page emblem at both sizes', ({ page, d }) => {
    const { container } = render(
      <ColorThemeProvider>
        <CostumeScope>
          <PageHeader title="Novembre" label="Pagina" emblem={page} />
        </CostumeScope>
      </ColorThemeProvider>,
    );
    const paths = [...container.querySelectorAll('svg[aria-hidden="true"] path')];
    expect(paths.map((path) => path.getAttribute('d'))).toEqual([d, d]);
  });
});
