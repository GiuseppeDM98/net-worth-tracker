/**
 * Orbita's planet, drawn by the REAL registry (the sibling `costumeScope.test.tsx` stubs it; `vi.mock` is per file,
 * and `costumeScopeEgeo.test.tsx` is the same arrangement for the temple). The real provider reads `orbita` from the
 * storage; inside `CostumeScope` the page header draws the planet twice — 18px beside the phone's title, 22px
 * before the desktop label — each a circle (r 5) and a ring (an ellipse rx 10, ry 3.6, rotated −24° about its
 * centre); outside the scope nothing.
 *
 * Seen red (2026-11-22) with `THEME_EMBLEMS.orbita` deleted.
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
  localStorage.setItem('color-theme', 'orbita');
});

describe('PageHeader in Orbita', () => {
  it('draws the planet at 18px beside the phone title and at 22px before the desktop label, inside the scope', () => {
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
      const circles = svg.querySelectorAll('circle');
      const ellipses = svg.querySelectorAll('ellipse');
      expect(circles).toHaveLength(1);
      expect(circles[0].getAttribute('r')).toBe('5');
      expect(ellipses).toHaveLength(1);
      expect(ellipses[0].getAttribute('rx')).toBe('10');
      expect(ellipses[0].getAttribute('ry')).toBe('3.6');
      expect(ellipses[0].getAttribute('transform')).toBe('rotate(-24 11 11)');
    }
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

  // 2026-11-22: Egeo draws a page's own art on Patrimonio; Orbita keeps the planet there too.
  it('draws the planet on Patrimonio', () => {
    const { container } = render(
      <ColorThemeProvider>
        <CostumeScope>
          <PageHeader title="Novembre" label="Patrimonio" emblem="patrimonio" />
        </CostumeScope>
      </ColorThemeProvider>,
    );
    const circles = [...container.querySelectorAll('svg[aria-hidden="true"] circle')];
    expect(circles.map((circle) => circle.getAttribute('r'))).toEqual(['5', '5']);
  });

  it('registers the planet as the fallback of every page', () => {
    expect(THEME_EMBLEMS.orbita?.fallback.shapes).toHaveLength(2);
    expect(THEME_EMBLEMS.orbita?.pages).toEqual({});
  });
});
