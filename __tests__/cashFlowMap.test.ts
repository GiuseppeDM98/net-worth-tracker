/**
 * cashFlowMap — l'indicizzazione per mese dei cash flow, unica per tutta la pipeline di Rendimenti.
 *
 * Il punto di questa suite non è la mappa in sé (tre righe), ma i due modi in cui le quattro copie
 * precedenti potevano perdere denaro in silenzio: due flussi nello stesso mese, e le due format
 * string separate per costruire e per interrogare la chiave.
 */
import { describe, it, expect } from 'vitest';
import { buildCashFlowMap, externalFlowOf, mergePensionFlows, mergePortfolioFlows, monthKey, monthKeyOf } from '@/lib/utils/cashFlowMap';
import type { CashFlowData, PensionBoundaryFlow, PortfolioBoundaryFlow } from '@/types/performance';

function cashFlow(year: number, month: number, netCashFlow: number, day = 1): CashFlowData {
  return {
    date: new Date(year, month - 1, day),
    income: netCashFlow > 0 ? netCashFlow : 0,
    expenses: netCashFlow < 0 ? Math.abs(netCashFlow) : 0,
    dividendIncome: 0,
    netCashFlow,
  };
}

describe('monthKey', () => {
  it('pads the month so keys sort and compare as strings', () => {
    expect(monthKey(2026, 1)).toBe('2026-01');
    expect(monthKey(2026, 12)).toBe('2026-12');
  });

  it('agrees with the key derived from a date', () => {
    // È l'invariante che conta: chi costruisce la mappa parte da una Date, chi la interroga dai
    // campi year/month di uno snapshot. Se le due formattazioni divergessero, la ricerca
    // fallirebbe restituendo 0 — indistinguibile da "nessun movimento questo mese".
    expect(monthKeyOf(new Date(2026, 0, 15))).toBe(monthKey(2026, 1));
    expect(monthKeyOf(new Date(2026, 11, 31))).toBe(monthKey(2026, 12));
  });
});

describe('buildCashFlowMap', () => {
  it('indexes one flow per month', () => {
    const map = buildCashFlowMap([cashFlow(2026, 1, 1000), cashFlow(2026, 2, -500)]);

    expect(map.get('2026-01')).toBe(1000);
    expect(map.get('2026-02')).toBe(-500);
    expect(map.get('2026-03')).toBeUndefined();
  });

  it('sums flows that fall in the same month instead of keeping the last', () => {
    // Le quattro copie facevano map.set: il secondo movimento cancellava il primo senza segnalarlo.
    // Oggi non può succedere (getCashFlowsFromExpenses aggrega a monte), ma se l'assunzione a monte
    // venisse meno l'errore sarebbe silenzioso e distribuito su TWR, volatilità, drawdown e grafico.
    const map = buildCashFlowMap([
      cashFlow(2026, 1, 1000, 5),
      cashFlow(2026, 1, 250, 20),
      cashFlow(2026, 1, -400, 28),
    ]);

    expect(map.get('2026-01')).toBe(850);
  });

  it('is empty for an empty input', () => {
    expect(buildCashFlowMap([]).size).toBe(0);
  });

  it('keeps months of different years apart', () => {
    const map = buildCashFlowMap([cashFlow(2025, 1, 100), cashFlow(2026, 1, 200)]);

    expect(map.get('2025-01')).toBe(100);
    expect(map.get('2026-01')).toBe(200);
  });
});

describe('externalFlowOf', () => {
  it('adds the pension channel to the cashflow savings, and reads an absent channel as 0', () => {
    expect(externalFlowOf(cashFlow(2026, 7, 1000))).toBe(1000);
    expect(externalFlowOf({ ...cashFlow(2026, 7, 1000), pensionFlow: 517 })).toBe(1517);
    expect(externalFlowOf({ ...cashFlow(2026, 7, -200), pensionFlow: -152 })).toBe(-352);
  });

  it('lets a measured boundary flow REPLACE the savings, a measured zero included, and a null fall back to them', () => {
    // The flows follow the base: what crossed its boundary, not what the cashflow saved.
    expect(externalFlowOf({ ...cashFlow(2026, 7, 1000), portfolioFlow: 4200 })).toBe(4200);
    expect(externalFlowOf({ ...cashFlow(2026, 7, 1000), portfolioFlow: 0 })).toBe(0);
    expect(externalFlowOf({ ...cashFlow(2026, 7, 1000), portfolioFlow: null })).toBe(1000);
    expect(externalFlowOf({ ...cashFlow(2026, 7, 1000), portfolioFlow: 4200, pensionFlow: 517 })).toBe(4717);
  });
});

describe('mergePortfolioFlows', () => {
  const measured = (month: string, amount: number): PortfolioBoundaryFlow => ({ month, amount, source: 'quantities' });
  const window = { start: new Date(2026, 0, 1), end: new Date(2026, 8, 30, 23, 59, 59) };

  it('sets the flow on the month the cashflow already has, leaving netCashFlow untouched, and creates a zero row for one it does not', () => {
    const merged = mergePortfolioFlows([cashFlow(2026, 7, 500)], [measured('2026-07', 4200), measured('2026-08', 0)], window.start, window.end);

    expect(merged.map((cf) => [cf.date.getMonth() + 1, cf.netCashFlow, cf.portfolioFlow])).toEqual([
      [7, 500, 4200],
      [8, 0, 0],
    ]);
  });

  it('leaves a month without a measured flow WITHOUT the field, so the fallback to the savings survives to the formula', () => {
    const merged = mergePortfolioFlows([cashFlow(2026, 6, 300), cashFlow(2026, 7, 500)], [measured('2026-07', 4200)], window.start, window.end);

    expect(merged[0].portfolioFlow).toBeUndefined();
    expect(externalFlowOf(merged[0])).toBe(300);
    expect(externalFlowOf(merged[1])).toBe(4200);
  });

  it('keeps flows outside the window out, and returns the input as is when none falls inside', () => {
    const input = [cashFlow(2026, 7, 500)];
    expect(mergePortfolioFlows(input, [measured('2025-12', 9)], window.start, window.end)).toBe(input);
    expect(mergePortfolioFlows(input, [measured('2026-07', 1), measured('2026-10', 9)], window.start, window.end)).toHaveLength(1);
  });
});

describe('buildCashFlowMap with the pension channel', () => {
  it('indexes the external flow, so a TFR credited in a month with no expenses is neutralised too', () => {
    // The whole point of the second channel: every formula reads the map, so a pension flow it
    // does not know about would be read as return by TWR, volatility, drawdown and the chart at once.
    const map = buildCashFlowMap([
      { ...cashFlow(2026, 7, 300), pensionFlow: 1204 },
      { date: new Date(2026, 7, 1), income: 0, expenses: 0, dividendIncome: 0, netCashFlow: 0, pensionFlow: 10 },
    ]);

    expect(map.get('2026-07')).toBe(1504);
    expect(map.get('2026-08')).toBe(10);
  });
});

describe('mergePensionFlows', () => {
  const flow = (month: string, amount: number, kind: PensionBoundaryFlow['kind'] = 'contribution'): PensionBoundaryFlow => ({ month, amount, kind });
  const window = { start: new Date(2026, 0, 1), end: new Date(2026, 8, 30, 23, 59, 59) };

  it('adds a flow to the month the cashflow already has, leaving netCashFlow untouched', () => {
    const merged = mergePensionFlows([cashFlow(2026, 7, 300)], [flow('2026-07', 1204)], window.start, window.end);

    expect(merged).toHaveLength(1);
    expect(merged[0].netCashFlow).toBe(300);
    expect(merged[0].income).toBe(300);
    expect(merged[0].pensionFlow).toBe(1204);
  });

  it('creates a zero row for a month the cashflow does not know, in date order', () => {
    const merged = mergePensionFlows([cashFlow(2026, 9, 100)], [flow('2026-08', 10)], window.start, window.end);

    expect(merged.map((cf) => monthKeyOf(cf.date))).toEqual(['2026-08', '2026-09']);
    expect(merged[0]).toMatchObject({ income: 0, expenses: 0, dividendIncome: 0, netCashFlow: 0, pensionFlow: 10 });
  });

  it('sums several flows of one month (an entry and a contribution) and keeps flows outside the window out', () => {
    const merged = mergePensionFlows(
      [],
      [flow('2025-12', 999), flow('2026-07', 31852, 'entry'), flow('2026-07', -152, 'withdrawal'), flow('2026-10', 500)],
      window.start,
      window.end
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].pensionFlow).toBe(31700);
  });

  it('returns the input series as is when no flow falls in the window, and never mutates it', () => {
    const series = [cashFlow(2026, 3, 100)];
    const merged = mergePensionFlows(series, [flow('2026-07', 1204)], new Date(2026, 0, 1), new Date(2026, 4, 31));
    expect(merged).toBe(series);

    const withFlow = mergePensionFlows(series, [flow('2026-03', 50)], window.start, window.end);
    expect(withFlow[0].pensionFlow).toBe(50);
    expect(series[0].pensionFlow).toBeUndefined();
  });

  it('includes the months of both window ends', () => {
    const merged = mergePensionFlows([], [flow('2026-01', 1), flow('2026-09', 2)], window.start, window.end);
    expect(merged.map((cf) => cf.pensionFlow)).toEqual([1, 2]);
  });
});
