import { describe, it, expect } from 'vitest';
import { buildTwrIndex, computeDrawdownSeries, findMaxDrawdown } from '@/lib/utils/drawdownSeries';
import type { MonthlySnapshot } from '@/types/assets';
import type { CashFlowData } from '@/types/performance';

/** Snapshot minimo: al drawdown servono solo anno, mese e patrimonio. */
function snapshot(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return {
    userId: 'user-1',
    year,
    month,
    totalNetWorth,
    liquidNetWorth: totalNetWorth,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28),
  } as MonthlySnapshot;
}

function cashFlow(year: number, month: number, netCashFlow: number): CashFlowData {
  return {
    date: new Date(year, month - 1, 1),
    income: netCashFlow > 0 ? netCashFlow : 0,
    expenses: netCashFlow < 0 ? -netCashFlow : 0,
    dividendIncome: 0,
    netCashFlow,
  };
}

/** Costruisce una serie di mesi consecutivi del 2025 a partire da gennaio. */
function monthlySeries(values: number[]): MonthlySnapshot[] {
  return values.map((value, i) => snapshot(2025, i + 1, value));
}

describe('buildTwrIndex', () => {
  it('starts at 100 and compounds the monthly returns', () => {
    // +10%, poi −50% → 100 → 110 → 55
    const index = buildTwrIndex(monthlySeries([1000, 1100, 550]), []);

    expect(index[0].value).toBe(100);
    expect(index[1].value).toBeCloseTo(110, 10);
    expect(index[2].value).toBeCloseTo(55, 10);
  });

  it('neutralises a contribution: money paid in is not a return', () => {
    // Il patrimonio raddoppia, ma 1.000 € sono versamenti → rendimento zero.
    const index = buildTwrIndex(monthlySeries([1000, 2000]), [cashFlow(2025, 2, 1000)]);

    expect(index[1].value).toBeCloseTo(100, 10);
  });

  it('neutralises a withdrawal the same way', () => {
    const index = buildTwrIndex(monthlySeries([1000, 500]), [cashFlow(2025, 2, -500)]);

    expect(index[1].value).toBeCloseTo(100, 10);
  });

  it('holds the index steady across a month whose starting net worth is zero', () => {
    // Rendimento indefinito (divisione per zero): l'indice non si azzera, resta dov'era.
    const index = buildTwrIndex(monthlySeries([1000, 0, 800]), []);

    expect(index[1].value).toBe(0);
    expect(index[2].value).toBe(0);
  });

  it('returns an empty series for no snapshots', () => {
    expect(buildTwrIndex([], [])).toEqual([]);
  });

  it('is immune to the size of the accumulated capital, unlike the additive adjustment', () => {
    // Stessa identica sequenza di rendimenti (+10%, −20%), ma con 100.000 € di versamenti in mezzo.
    // Il vecchio metodo `patrimonio − cashflow cumulativo` avrebbe prodotto percentuali diverse
    // perché la base si restringe; l'indice geometrico no.
    const withoutContributions = buildTwrIndex(monthlySeries([1000, 1100, 880]), []);
    const withContributions = buildTwrIndex(monthlySeries([1000, 101_100, 80_880]), [
      cashFlow(2025, 2, 100_000),
    ]);

    expect(findMaxDrawdown(withContributions).value).toBeCloseTo(
      findMaxDrawdown(withoutContributions).value,
      8
    );
  });
});

describe('computeDrawdownSeries', () => {
  it('reports 0 at every new high and the distance from the peak otherwise', () => {
    const index = buildTwrIndex(monthlySeries([1000, 1100, 990, 1200]), []);

    const drawdowns = computeDrawdownSeries(index);

    expect(drawdowns[0]).toBe(0); // punto di partenza
    expect(drawdowns[1]).toBe(0); // nuovo massimo
    expect(drawdowns[2]).toBeCloseTo(-10, 10); // 990 contro un picco di 1100
    expect(drawdowns[3]).toBe(0); // nuovo massimo, torna in superficie
  });

  it('never returns a positive value', () => {
    const index = buildTwrIndex(monthlySeries([1000, 1500, 2000]), []);

    expect(computeDrawdownSeries(index).every((value) => value <= 0)).toBe(true);
  });
});

describe('findMaxDrawdown', () => {
  it('finds the deepest fall, its peak, its trough and its recovery', () => {
    //        gen   feb    mar   apr   mag    giu
    // idx:   100   120     90   100   130    130
    const index = buildTwrIndex(monthlySeries([1000, 1200, 900, 1000, 1300, 1300]), []);

    const result = findMaxDrawdown(index);

    expect(result.value).toBeCloseTo(-25, 10); // 900 contro 1200
    expect(result.peakIndex).toBe(1);
    expect(result.troughIndex).toBe(2);
    expect(result.recoveryIndex).toBe(4);
  });

  it('leaves recoveryIndex null while the portfolio is still underwater', () => {
    const index = buildTwrIndex(monthlySeries([1000, 1200, 900, 1000]), []);

    const result = findMaxDrawdown(index);

    expect(result.troughIndex).toBe(2);
    expect(result.recoveryIndex).toBeNull();
  });

  it('reports no drawdown for a series that only rises', () => {
    const result = findMaxDrawdown(buildTwrIndex(monthlySeries([1000, 1100, 1200]), []));

    expect(result).toEqual({ value: 0, peakIndex: 0, troughIndex: 0, recoveryIndex: null });
  });

  it('reports no drawdown for a single-point series', () => {
    expect(findMaxDrawdown(buildTwrIndex(monthlySeries([1000]), [])).value).toBe(0);
  });

  it('keeps the deepest fall when a shallower one comes later', () => {
    // −25% a marzo, poi solo −8% ad agosto: vince il primo.
    const index = buildTwrIndex(monthlySeries([1000, 1200, 900, 1300, 1400, 1288]), []);

    const result = findMaxDrawdown(index);

    expect(result.value).toBeCloseTo(-25, 10);
    expect(result.troughIndex).toBe(2);
  });

  it('does not read a contribution-driven dip as a drawdown', () => {
    // Il patrimonio scende da 1.000 a 600 perché sono stati prelevati 400 €: rendimento piatto.
    const index = buildTwrIndex(monthlySeries([1000, 600]), [cashFlow(2025, 2, -400)]);

    expect(findMaxDrawdown(index).value).toBeCloseTo(0, 10);
  });
});

describe('buildTwrIndex con una base non positiva', () => {
  function nw(year: number, month: number, totalNetWorth: number) {
    return {
      userId: 'user-1', year, month, totalNetWorth,
      liquidNetWorth: totalNetWorth, illiquidNetWorth: 0,
      byAssetClass: {}, byAsset: [], assetAllocation: {},
      createdAt: new Date(year, month - 1, 28),
    } as never;
  }

  it('tiene l\'indice fermo invece di ribaltarne il segno', () => {
    const index = buildTwrIndex([nw(2026, 1, 1000), nw(2026, 2, -500), nw(2026, 3, 1200)], []);

    expect(index.every((point) => Number.isFinite(point.value))).toBe(true);
    expect(index[2].value).toBe(index[1].value);
  });
});
