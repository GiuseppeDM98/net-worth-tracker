/**
 * The Dettaglio's month tooltip («Risparmio e mercato per mese»): the same month reads the same
 * three parts of «altre» as the Driver tile (2026-11-12). Invented, round figures.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { DriverMonthTooltip } from '@/components/history/StoricoDettaglio';

const nbsp = (text: string | null) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ');
const ROW = { year: 2026, month: 6, period: 'giu 26', taxBar: 0, netWorthGrowth: 1200, netSavings: 1000, market: 0, taxes: 0, debtRepaid: 0, pensionContributions: 0, other: 200, otherPension: 0, otherHoldings: 200, otherAccounts: 0, isMarketMeasured: true };

describe('DriverMonthTooltip', () => {
  // D4
  it('should print only the non-zero parts of «altre», with the ledger\'s labels', () => {
    const { container } = render(<DriverMonthTooltip active payload={[{ payload: ROW }]} />);
    const text = nbsp(container.textContent);
    expect(text).toContain('Quantità fuori dal registro+200 €');
    expect(text).not.toContain('Altre variazioni');
    expect(text).not.toContain('Fondo pensione non tracciato');
    expect(text).not.toContain('Saldi dei conti');
  });

  it('should print the three when all are non-zero', () => {
    const { container } = render(<DriverMonthTooltip active payload={[{ payload: { ...ROW, other: 600, otherPension: 100, otherAccounts: 300 } }]} />);
    const text = nbsp(container.textContent);
    for (const label of ['Fondo pensione non tracciato', 'Quantità fuori dal registro', 'Saldi dei conti']) expect(text).toContain(label);
  });
});
