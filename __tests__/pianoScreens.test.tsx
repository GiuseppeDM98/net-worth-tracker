/**
 * The plan path's screen bodies (components/allocation/piano/PianoScreens.tsx): «strumenti» — the rows with
 * today's weight, the sum off 100 in warning, «Ridistribuisci il resto», a model group as ONE row — and
 * «vendite» — «No» / «Sì», a ticked sale with its quantity, its month and the tax line in its four wordings, a
 * group's member without «tutte». The tax per euro is mocked at `candidateSaleTaxPerEuro` (its rules are
 * saleTax.test.ts's). Figures invented and round.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/utils/saleTax', () => ({
  candidateSaleTaxPerEuro: (assetId: string) =>
    assetId === 'etf-a'
      ? { kind: 'taxed', perEuro: 0.1 }
      : assetId === 'etf-b'
        ? { kind: 'exempt' }
        : assetId === 'etf-c'
          ? { kind: 'unknown', reason: 'rate' }
          : { kind: 'unknown', reason: 'cost-basis' },
}));

import type { Asset, AllocationResult } from '@/types/assets';
import { DEFAULT_REBALANCE_BAND } from '@/lib/utils/allocationUtils';
import type { PlanPathAnswers, PlanPathContext } from '@/lib/utils/planPath';
import { StrumentiScreen, VenditeScreen } from '@/components/allocation/piano/PianoScreens';

const TODAY = new Date('2026-11-20T12:00:00');
function asset(id: string, name: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id, userId: 'u1', ticker: id.toUpperCase(), name, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 100, lastPriceUpdate: TODAY, createdAt: TODAY, updatedAt: TODAY, ...overrides,
  };
}
const ASSETS = [
  asset('conto', 'Conto ornitorinco', { type: 'cash', assetClass: 'cash', quantity: 4000, currentPrice: 1 }),
  asset('etf-a', 'ETF ornitorinco', { quantity: 60 }),
  asset('etf-b', 'ETF fenicottero', { quantity: 40 }),
  asset('etf-c', 'ETF airone', { quantity: 10 }),
  asset('etf-d', 'ETF garzetta', { quantity: 10 }),
];
const DEPS = { valueOf: (a: Asset) => a.quantity * a.currentPrice, priceOf: (a: Asset) => a.currentPrice };
const context: PlanPathContext = {
  assets: ASSETS, targets: { equity: { targetPercentage: 100 } }, band: DEFAULT_REBALANCE_BAND, model: null, investmentAccountId: 'conto',
  openDraft: null, tradedAssetIds: null, holdings: [], reviewByIso: null,
  compare: () => ({ byAssetClass: {}, marketValue: 0 }) as unknown as AllocationResult, deps: DEPS, todayMonth: '2026-11',
};
function answers(overrides: Partial<PlanPathAnswers> = {}): PlanPathAnswers {
  return {
    start: 'today', monthlyInflowEur: 500, months: 12, sourceIds: ['conto'], reserveEur: null, wantsSales: true, sales: [],
    positions: [
      { id: 'p-a', label: 'ETF ornitorinco', targetPercentage: 50, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      { id: 'p-b', label: 'ETF fenicottero', targetPercentage: 40, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
    ],
    updateModel: null,
    ...overrides,
  };
}
const flat = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');

describe('StrumentiScreen (mutation: dispatch nothing from «Ridistribuisci il resto»)', () => {
  it('a row per position with today’s weight; the sum off 100 in warning; «Ridistribuisci il resto» dispatches', () => {
    const dispatch = vi.fn();
    render(<StrumentiScreen answers={answers()} dispatch={dispatch} context={context} onNewInstrument={() => {}} />);
    const list = screen.getByRole('list', { name: 'Strumenti del piano' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(flat(rows[0].textContent)).toContain('oggi 60,00%');
    expect(flat(rows[1].textContent)).toContain('oggi 40,00%');
    const sum = screen.getByText('Somma: 90,00%');
    expect(sum.className).toContain('text-warning-foreground');
    fireEvent.click(screen.getByRole('button', { name: 'Ridistribuisci il resto' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'redistribute' });
  });

  it('at 100 the sum is plain and «Ridistribuisci il resto» is disabled', () => {
    const positions = answers().positions.map((p, i) => ({ ...p, targetPercentage: i === 0 ? 60 : 40 }));
    render(<StrumentiScreen answers={answers({ positions })} dispatch={() => {}} context={context} onNewInstrument={() => {}} />);
    expect(screen.getByText('Somma: 100,00%').className).not.toContain('text-warning-foreground');
    expect((screen.getByRole('button', { name: 'Ridistribuisci il resto' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a model group is ONE row: its label, «compra» the instrument it buys', () => {
    const positions = [{ id: 'g', label: 'Azionario globale', targetPercentage: 100, memberAssetIds: ['etf-a', 'etf-b'], buyAssetId: 'etf-a' }];
    render(<StrumentiScreen answers={answers({ positions })} dispatch={() => {}} context={context} onNewInstrument={() => {}} />);
    const rows = within(screen.getByRole('list', { name: 'Strumenti del piano' })).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(flat(rows[0].textContent)).toContain('Azionario globale');
    expect(flat(rows[0].textContent)).toContain('compra ETF ornitorinco');
    expect(flat(rows[0].textContent)).toContain('oggi 100,00%');
  });

  it('a quota typed dispatches the quota action', () => {
    const dispatch = vi.fn();
    render(<StrumentiScreen answers={answers()} dispatch={dispatch} context={context} onNewInstrument={() => {}} />);
    fireEvent.change(screen.getByLabelText('ETF ornitorinco'), { target: { value: '60' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'quota', positionId: 'p-a', targetPercentage: 60 });
  });
});

describe('VenditeScreen (mutation: hide the month)', () => {
  it('«No» / «Sì, scelgo cosa»; «No» hides the instruments', () => {
    const dispatch = vi.fn();
    const { rerender } = render(<VenditeScreen answers={answers({ wantsSales: null })} dispatch={dispatch} context={context} />);
    expect(screen.getByRole('radio', { name: 'No' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Strumenti da vendere' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Sì, scelgo cosa' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'wantsSales', value: true, context });
    rerender(<VenditeScreen answers={answers({ wantsSales: false })} dispatch={dispatch} context={context} />);
    expect(screen.queryByRole('list', { name: 'Strumenti da vendere' })).toBeNull();
  });

  it('ticking dispatches a whole sale in month 1', () => {
    const dispatch = vi.fn();
    render(<VenditeScreen answers={answers()} dispatch={dispatch} context={context} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vendi ETF ornitorinco' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sale', sale: { assetId: 'etf-a', quantity: null, month: 1 }, context });
  });

  it('a ticked sale shows its quantity, its month and the tax line in its four wordings', () => {
    const sales = [
      { assetId: 'etf-a', quantity: 10, month: 3 },
      { assetId: 'etf-b', quantity: null, month: 1 },
      { assetId: 'etf-c', quantity: null, month: 1 },
      { assetId: 'etf-d', quantity: null, month: 1 },
    ];
    render(<VenditeScreen answers={answers({ sales })} dispatch={() => {}} context={context} />);
    const rows = within(screen.getByRole('list', { name: 'Strumenti da vendere' })).getAllByRole('listitem');
    const rowOf = (name: string) => rows.find((row) => row.textContent?.includes(name))!;
    expect((within(rowOf('ETF ornitorinco')).getByLabelText('Quante quote') as HTMLInputElement).value).toBe('10');
    expect(within(rowOf('ETF ornitorinco')).getByLabelText('In quale mese').textContent).toContain('febbraio 2027 (3º)');
    expect(flat(rowOf('ETF ornitorinco').textContent)).toContain('circa 1000 € · tasse stimate 100 €');
    expect(flat(rowOf('ETF fenicottero').textContent)).toContain('circa 4000 € · esente');
    expect(flat(rowOf('ETF airone').textContent)).toContain("circa 1000 € · tasse non stimabili: manca l'aliquota");
    expect(flat(rowOf('ETF garzetta').textContent)).toContain('circa 1000 € · tasse non stimabili: manca il costo fiscale');
    expect(within(rowOf('ETF fenicottero')).getByLabelText('Quante quote').getAttribute('placeholder')).toBe('tutte');
  });

  it('a group’s member has no «tutte» placeholder', () => {
    const positions = [{ id: 'g', label: 'Azionario globale', targetPercentage: 100, memberAssetIds: ['etf-a', 'etf-b'], buyAssetId: 'etf-a' }];
    render(<VenditeScreen answers={answers({ positions, sales: [{ assetId: 'etf-b', quantity: null, month: 1 }] })} dispatch={() => {}} context={context} />);
    const row = within(screen.getByRole('list', { name: 'Strumenti da vendere' })).getAllByRole('listitem').find((r) => r.textContent?.includes('ETF fenicottero'))!;
    expect(within(row).getByLabelText('Quante quote').getAttribute('placeholder')).toBeNull();
  });
});
