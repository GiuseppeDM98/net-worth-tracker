/**
 * The resource bar of a costume theme (DESIGN.md → The Costume Rule, 2026-11-22): a `dl` named «Quadro rapido» with the
 * four figures of `selectResourceBar`, hidden below `desktop:`; only a theme whose costume says `resourceBar` draws it,
 * only inside the costume scope. The REAL provider reads the theme from the storage (`useThemeCostume` calls its own
 * module's `useColorTheme`, which a mock of the module would not reach — doc/guide/temi.md § Il costume).
 *
 * And the three tiles the bar repeats print the bar's text (The Lifted-Figure Rule): a negative total or cash with
 * the typographic minus, a year at zero as «0,00%» — the text of `formatStripFigure`, not Intl's hyphen.
 *
 * Seen red (2026-11-22) with `useThemeCostume` not read (the bar drawn for Egeo and for the default theme), with the
 * scope check dropped (drawn outside it), with `desktop:flex` taken off the `dl` (visible below 1440), with the hero,
 * the Sintesi rows and the year's chip back on `cachedFormatCurrencyEUR(value)` / `formatPercentage(Math.abs(…))`.
 */
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({
  getUserPreferences: vi.fn(async () => ({})),
  setUserPreferences: vi.fn(async () => undefined),
}));

import { ColorThemeProvider } from '@/contexts/ColorThemeContext';
import { CostumeScope } from '@/contexts/CostumeScopeContext';
import { ResourceBar } from '@/components/dashboard/overview/ResourceBar';
import { SintesiTile } from '@/components/dashboard/overview/SintesiTile';
import { VariationChip } from '@/components/dashboard/overview/PatrimonioTile';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import type { ResourceFigure } from '@/lib/utils/overviewSummary';
import type { DashboardOverviewPayload } from '@/types/dashboardOverview';

const FIGURES: ResourceFigure[] = [
  { label: 'Patrimonio', value: 250000, format: 'currency', decimals: 2 },
  { label: 'Liquidità', value: 25000, format: 'currency', decimals: 2 },
  { label: 'Risparmio', value: 900, format: 'currency' },
  { label: 'Da inizio anno', value: null, format: 'signed-percent', decimals: 2, reason: "nessuno snapshot da cui contare l'anno" },
];

const plain = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');

function renderBar(theme: string, wrap: (bar: ReactNode) => ReactNode = (bar) => <CostumeScope>{bar}</CostumeScope>) {
  localStorage.setItem('color-theme', theme);
  return render(<ColorThemeProvider>{wrap(<ResourceBar figures={FIGURES} />)}</ColorThemeProvider>);
}

beforeEach(() => {
  localStorage.clear();
});

describe('ResourceBar', () => {
  it('lists the four figures in a dl named «Quadro rapido», visible from desktop: only, in Orbita and in scope', () => {
    renderBar('orbita');
    const bar = document.querySelector('dl[aria-label="Quadro rapido"]')!;
    expect(bar).not.toBeNull();
    expect(bar.className).toContain('hidden');
    expect(bar.className).toContain('desktop:flex');
    expect([...bar.querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Patrimonio', 'Liquidità', 'Risparmio', 'Da inizio anno']);
    const values = [...bar.querySelectorAll('dd')].map((value) => plain(value.textContent));
    // The unit sits in its own span (a margin, no space character): the figures read as the tiles do, spaces aside.
    expect(values.slice(0, 3).map((value) => value.replace(/ /g, ''))).toEqual(['250.000,00€', '25.000,00€', '900€']);
    // A figure that cannot be measured prints its reason, never a zero.
    expect(values[3]).toBe("nessuno snapshot da cui contare l'anno");
  });

  it.each(['egeo', 'default', 'cyberpunk'])('draws nothing in %s: its costume has no bar', (theme) => {
    renderBar(theme);
    expect(document.querySelector('dl[aria-label="Quadro rapido"]')).toBeNull();
  });

  it('draws nothing outside the costume scope (the landing, the access pages)', () => {
    renderBar('orbita', (bar) => <div>{bar}</div>);
    expect(document.querySelector('dl[aria-label="Quadro rapido"]')).toBeNull();
  });

  it('draws nothing with no figure', () => {
    localStorage.setItem('color-theme', 'orbita');
    render(
      <ColorThemeProvider>
        <CostumeScope>
          <ResourceBar figures={[]} />
        </CostumeScope>
      </ColorThemeProvider>,
    );
    expect(document.querySelector('dl[aria-label="Quadro rapido"]')).toBeNull();
  });
});

describe('the tiles print the bar\'s text', () => {
  const metrics = (overrides: Partial<DashboardOverviewPayload['metrics']>): DashboardOverviewPayload['metrics'] => ({
    totalValue: 250000,
    liquidNetWorth: 0,
    illiquidNetWorth: 1000,
    cashNetWorth: 25000,
    liquidInvestmentsNetWorth: 0,
    netTotal: 250000,
    liquidNetTotal: 0,
    unrealizedGains: 0,
    estimatedTaxes: 0,
    liquidEstimatedTaxes: 0,
    portfolioTER: 0,
    annualPortfolioCost: 0,
    annualStampDuty: 0,
    ...overrides,
  });

  it('prints the hero of a negative value with the typographic minus', () => {
    render(<OverviewAnimatedCurrency value={-1200} animateOnMount={false} />);
    expect(plain(document.body.textContent)).toBe('−1200,00 €');
  });

  it("prints Sintesi's «Liquidità» row of a negative cash with the typographic minus", () => {
    render(<SintesiTile metrics={metrics({ cashNetWorth: -1200 })} hasCostBasisTracking={false} />);
    expect(plain(screen.getByText('Liquidità').nextElementSibling?.firstElementChild?.textContent ?? null)).toBe('−1200,00 €');
  });

  it("prints the year's chip at zero as «0,00%», without a sign", () => {
    render(<VariationChip value={0} percentage={0} caption="da inizio anno" />);
    expect(plain(document.body.textContent)).toContain('(0,00%)');
    expect(plain(document.body.textContent)).not.toContain('(+0,00%)');
  });

  it("prints the year's chip of a negative percentage with the typographic minus", () => {
    render(<VariationChip value={-300} percentage={-1.5} caption="da inizio anno" />);
    const chip = within(document.body);
    expect(plain(chip.getByText(/\(/).textContent)).toContain('(−1,50%)');
  });
});
