/**
 * Egeo's temple, drawn by the REAL registry (the sibling `costumeScope.test.tsx` stubs the registry to give a
 * palette theme a costume, so this half lives in its own file: `vi.mock` is per file). The real provider reads
 * `egeo` from the storage (`useThemeCostume` calls its own module's `useColorTheme`, which a mock of the module
 * would not reach); inside `CostumeScope` the page header draws the temple twice — 18px beside the phone's title, 22px
 * before the desktop label — and outside it nothing (the landing and the access pages wear the palette only).
 *
 * Seen red with `THEME_EMBLEMS.egeo` deleted.
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

  it('registers the temple as the fallback of every page', () => {
    expect(THEME_EMBLEMS.egeo?.fallback.shapes).toHaveLength(1);
    expect(THEME_EMBLEMS.egeo?.pages).toEqual({});
  });
});
