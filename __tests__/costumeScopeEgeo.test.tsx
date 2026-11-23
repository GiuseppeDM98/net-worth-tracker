/**
 * Egeo's temple, drawn by the REAL registry (the sibling `costumeScope.test.tsx` stubs the registry to give a
 * palette theme a costume, so this half lives in its own file: `vi.mock` is per file). The real provider reads
 * `egeo` from the storage (`useThemeCostume` calls its own module's `useColorTheme`, which a mock of the module
 * would not reach); inside `CostumeScope` the page header draws the temple twice — 18px beside the phone's title, 22px
 * before the desktop label — and outside it nothing (the landing and the access pages wear the palette only).
 *
 * Seen red with `THEME_EMBLEMS.egeo` deleted; the page cases (2026-11-22) with `pages: {}` for Egeo; the nine
 * pages of 2026-11-23 with the flame given the lamp's path.
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
import { THEME_EMBLEMS, type EmblemPage } from '@/lib/constants/themeCostume';

beforeEach(() => {
  localStorage.setItem('color-theme', 'egeo');
});

const TEMPLE = 'M2 8 L11 2 L20 8 M4 8 V18 M8 8 V18 M14 8 V18 M18 8 V18 M2 20 H20';
const AMPHORA =
  'M8 2 H14 M9 2 V5 M13 2 V5 M9 5 C4 7 4 14 8 18 H14 C18 14 18 7 13 5 M9 20 H13 M10 18 V20 M12 18 V20 M9 3.5 C6 4 5.5 7 7 9 M13 3.5 C16 4 16.5 7 15 9';
const WAVES =
  'M2 9 C4 6 6 6 7 9 C8 12 10 12 11 9 C12 6 14 6 15 9 C16 12 18 12 20 9 M2 15 C4 12 6 12 7 15 C8 18 10 18 11 15 C12 12 14 12 15 15 C16 18 18 18 20 15';

// 2026-11-23: one mark per page. Each a single path at 22 × 22, but Previdenza's shield: two circles.
const PAGE_PATHS: Partial<Record<EmblemPage, string>> = {
  analisi: 'M11 3 V19 M7 19 H15 M4 6 H18 M4 6 L2 12 H6 Z M18 6 L16 12 H20 Z',
  rendimenti: 'M6 19 C9 15 11 10 12 3 M9 15 C7 15 5 13 5 11 C7 11 9 13 9 15 M11 10 C9 9 8 7 9 5 C11 6 11 8 11 10',
  storico: 'M5 4 H15 C17 4 17 7 15 7 H5 M5 4 C3 4 3 7 5 7 M7 7 V18 M13 7 V18 M5 18 H15 C17 18 17 21 15 21 H5 C3 21 3 18 5 18',
  allocazione: 'M3 19 V3 H19 V15 H7 V7 H15 V11 H11',
  fire: 'M11 3 C14 7 16 10 14 13 C16 12 17 14 16 16 C15 19 7 19 6 16 C5 13 8 9 11 3 M9 20 H13',
  'hall-of-fame': 'M7 19 C2 15 2 7 7 3 M15 19 C20 15 20 7 15 3 M5 15 L3 14 M4 11 L2 10 M5 7 L3 6 M17 15 L19 14 M18 11 L20 10 M17 7 L19 6',
  assistente: 'M3 12 H14 C16 12 18 11 20 9 C19 13 17 17 11 17 C7 17 4 15 3 12 Z M11 12 C11 10 12 9 11 7',
  impostazioni: 'M6 4 H16 M6 4 C4 4 4 7 6 7 M16 4 C18 4 18 7 16 7 M6 7 H16 M8 7 V18 M11 7 V18 M14 7 V18 M6 18 H16 M5 20 H17',
};

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

  it('registers the temple as the fallback, and a mark of its own for eleven pages', () => {
    expect(THEME_EMBLEMS.egeo?.fallback.shapes).toHaveLength(1);
    expect(Object.keys(THEME_EMBLEMS.egeo?.pages ?? {}).sort()).toEqual([
      'allocazione', 'analisi', 'assistente', 'cashflow', 'fire', 'hall-of-fame', 'impostazioni', 'patrimonio', 'previdenza', 'rendimenti', 'storico',
    ]);
  });

  it.each(Object.entries(PAGE_PATHS) as Array<[EmblemPage, string]>)('draws the %s mark at both sizes', (page, d) => {
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

  it('draws Previdenza’s shield as two circles on one centre, at both sizes', () => {
    const { container } = render(
      <ColorThemeProvider>
        <CostumeScope>
          <PageHeader title="Novembre" label="Previdenza" emblem="previdenza" />
        </CostumeScope>
      </ColorThemeProvider>,
    );
    const svgs = [...container.querySelectorAll('svg[aria-hidden="true"]')];
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(svg.querySelectorAll('path')).toHaveLength(0);
      expect([...svg.querySelectorAll('circle')].map((circle) => ['cx', 'cy', 'r'].map((name) => circle.getAttribute(name)).join(' '))).toEqual([
        '11 11 8',
        '11 11 3',
      ]);
    }
  });

  it('draws twelve arts, no two alike, each an ornament stroked at 1,6 on a 22 × 22 box', () => {
    const arts = [THEME_EMBLEMS.egeo!.fallback, ...Object.values(THEME_EMBLEMS.egeo!.pages)];
    expect(arts).toHaveLength(12);
    expect(new Set(arts.map((art) => JSON.stringify(art.shapes))).size).toBe(12);
    for (const art of arts) {
      expect(art.viewBox).toBe('0 0 22 22');
      for (const shape of art.shapes) {
        expect(shape.tone).toBe('ornament');
        expect(shape.strokeWidth).toBe(1.6);
      }
    }
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
