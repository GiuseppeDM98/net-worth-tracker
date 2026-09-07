import { describe, it, expect } from 'vitest';
import {
  buildPensionValueSeries,
  computePensionReturn,
  isPensionReturnMeasurable,
  overlayLivePensionValue,
  resolvePensionReturnStart,
} from '@/lib/utils/pensionReturn';
import type { MonthlySnapshot } from '@/types/assets';
import type { ContributionSource, PensionContribution } from '@/types/pension';

function snapshotWithFund(
  year: number,
  month: number,
  fundValue: number | null,
  otherValue = 50_000
): MonthlySnapshot {
  const byAsset = [
    { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 1, price: otherValue, totalValue: otherValue },
    ...(fundValue === null
      ? []
      : [{ assetId: 'fund-1', ticker: '', name: 'Fondo', quantity: 1, price: fundValue, totalValue: fundValue }]),
  ];

  return {
    userId: 'user-1',
    year,
    month,
    totalNetWorth: otherValue + (fundValue ?? 0),
    liquidNetWorth: otherValue,
    illiquidNetWorth: fundValue ?? 0,
    byAssetClass: {},
    byAsset,
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28),
  } as MonthlySnapshot;
}

function contribution(
  year: number,
  month: number,
  amount: number,
  source: ContributionSource = 'voluntary',
  /** Quando il versamento è stato REGISTRATO (default: stesso mese della data). */
  recordedAt?: Date
): PensionContribution {
  return {
    id: `${year}-${month}-${source}-${recordedAt?.getTime() ?? 0}`,
    userId: 'user-1',
    assetId: 'fund-1',
    source,
    amount,
    date: new Date(year, month - 1, 15),
    taxYear: year,
    deductible: source !== 'tfr',
    createdAt: recordedAt ?? new Date(year, month - 1, 15),
  };
}

describe('buildPensionValueSeries', () => {
  it('sums the funds month by month, chronologically', () => {
    const series = buildPensionValueSeries(
      [snapshotWithFund(2026, 2, 11_000), snapshotWithFund(2026, 1, 10_000)],
      ['fund-1']
    );

    expect(series).toEqual([
      { year: 2026, month: 1, value: 10_000 },
      { year: 2026, month: 2, value: 11_000 },
    ]);
  });

  it('skips snapshots with no per-asset breakdown', () => {
    const legacy = { ...snapshotWithFund(2025, 5, 9_000), byAsset: [] } as MonthlySnapshot;

    const series = buildPensionValueSeries([legacy, snapshotWithFund(2026, 1, 10_000)], ['fund-1']);

    expect(series).toEqual([{ year: 2026, month: 1, value: 10_000 }]);
  });

  it('skips months where the fund is absent — it did not exist, it was not worth zero', () => {
    const series = buildPensionValueSeries(
      [snapshotWithFund(2025, 12, null), snapshotWithFund(2026, 1, 10_000)],
      ['fund-1']
    );

    expect(series).toEqual([{ year: 2026, month: 1, value: 10_000 }]);
  });

  it('returns nothing when there are no funds', () => {
    expect(buildPensionValueSeries([snapshotWithFund(2026, 1, 10_000)], [])).toEqual([]);
  });
});

describe('overlayLivePensionValue', () => {
  it('replaces the current-month snapshot value with the live fund value', () => {
    const series = [
      { year: 2026, month: 7, value: 10_000 },
      { year: 2026, month: 8, value: 10_000 },
    ];

    const overlaid = overlayLivePensionValue(series, { year: 2026, month: 8, value: 10_200 });

    expect(overlaid).toEqual([
      { year: 2026, month: 7, value: 10_000 },
      { year: 2026, month: 8, value: 10_200 },
    ]);
    // Never mutates the input series.
    expect(series[1].value).toBe(10_000);
  });

  it('appends the current month when the cron has not written its snapshot yet', () => {
    const series = [{ year: 2026, month: 7, value: 10_000 }];

    const overlaid = overlayLivePensionValue(series, { year: 2026, month: 8, value: 10_200 });

    expect(overlaid).toEqual([
      { year: 2026, month: 7, value: 10_000 },
      { year: 2026, month: 8, value: 10_200 },
    ]);
  });

  it('leaves the series untouched when the live value is zero (no funds)', () => {
    const series = [{ year: 2026, month: 7, value: 10_000 }];

    expect(overlayLivePensionValue(series, { year: 2026, month: 8, value: 0 })).toEqual(series);
  });

  it('neutralizes a contribution recorded today against a stale snapshot', () => {
    // Snapshot chain 10 000 → 10 000; a 200 € contribution recorded in August raised
    // the ASSET immediately, but the August snapshot has not been rewritten yet.
    // Without the overlay the formula reads (10 000 − 200) / 10 000: a −2% phantom loss.
    const staleSeries = [
      { year: 2026, month: 7, value: 10_000 },
      { year: 2026, month: 8, value: 10_000 },
    ];
    const paidIn = [contribution(2026, 8, 200, 'tfr')];

    const stale = computePensionReturn(staleSeries, paidIn, '2026-07');
    expect(stale?.twr).toBeCloseTo(-2, 5);

    // Overlaying the live value (stale + the 200 just paid in) restores the truth: flat.
    const overlaid = overlayLivePensionValue(staleSeries, { year: 2026, month: 8, value: 10_200 });
    const result = computePensionReturn(overlaid, paidIn, '2026-07');
    expect(result?.twr).toBeCloseTo(0, 5);
    expect(result?.endValue).toBe(10_200);
  });
});

describe('resolvePensionReturnStart', () => {
  it('prefers the configured start month over the data', () => {
    expect(resolvePensionReturnStart([contribution(2024, 3, 500)], '2026-01')).toBe('2026-01');
  });

  it('falls back to the earliest recorded contribution', () => {
    const start = resolvePensionReturnStart([contribution(2026, 6, 383), contribution(2026, 2, 500)]);

    expect(start).toBe('2026-02');
  });

  it('returns null when nothing was ever recorded', () => {
    expect(resolvePensionReturnStart([])).toBeNull();
  });
});

describe('computePensionReturn', () => {
  const series = (values: [number, number, number][]) =>
    values.map(([year, month, value]) => ({ year, month, value }));

  it('reads a contribution-only month as zero return', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
      ]),
      [contribution(2026, 2, 1_000)],
      '2026-01'
    );

    expect(result!.twr).toBeCloseTo(0, 10);
    expect(result!.marketGain).toBeCloseTo(0, 10);
    expect(result!.valueGrowth).toBe(1_000);
  });

  it('reads pure market growth as return', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_500],
      ]),
      [],
      '2026-01'
    );

    expect(result!.twr).toBeCloseTo(5, 10);
    expect(result!.marketGain).toBe(500);
  });

  it('keeps the employer contribution out of the TWR but inside the personal return', () => {
    // 10.000 € → 11.000 €, di cui 1.000 € regalati dal datore: mercato fermo, ma il capitale
    // proprio (10.000 €) ha comunque prodotto un beneficio del 10%.
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
      ]),
      [contribution(2026, 2, 1_000, 'employer')],
      '2026-01'
    );

    expect(result!.twr).toBeCloseTo(0, 10);
    expect(result!.contributions.employer).toBe(1_000);
    expect(result!.personalReturn).toBeCloseTo(10, 10);
  });

  it('counts TFR as own capital, not as a benefit', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
      ]),
      [contribution(2026, 2, 1_000, 'tfr')],
      '2026-01'
    );

    // Denominatore 10.000 + 1.000 di TFR, numeratore zero: nessun beneficio, solo capitale spostato.
    expect(result!.personalReturn).toBeCloseTo(0, 10);
    expect(result!.contributions.tfr).toBe(1_000);
  });

  it('ignores contributions dated in the opening month — already inside its value', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_000],
      ]),
      [contribution(2026, 1, 5_000)],
      '2026-01'
    );

    expect(result!.contributions.total).toBe(0);
    expect(result!.twr).toBeCloseTo(0, 10);
  });

  it('starts at the configured month, ignoring earlier history', () => {
    const result = computePensionReturn(
      series([
        [2025, 11, 20_000],
        [2026, 1, 25_000],
        [2026, 2, 26_000],
      ]),
      [],
      '2026-01'
    );

    expect(result!.windowStart).toBe('2026-01');
    expect(result!.startValue).toBe(25_000);
    expect(result!.monthsCovered).toBe(1);
  });

  it('suppresses annualisation below three months of coverage', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_500],
      ]),
      [],
      '2026-01'
    );

    expect(result!.annualizedTwr).toBeNull();
    expect(result!.isCoverageSuspicious).toBe(false);
  });

  it('annualises once there are at least three months', () => {
    // +1% al mese per 4 mesi → circa +12,7% annualizzato.
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_100],
        [2026, 3, 10_201],
        [2026, 4, 10_303.01],
        [2026, 5, 10_406.04],
      ]),
      [],
      '2026-01'
    );

    expect(result!.monthsCovered).toBe(4);
    expect(result!.annualizedTwr).toBeCloseTo(12.68, 1);
  });

  it('flags an implausible return as missing contributions, not a brilliant fund', () => {
    // Lo scenario reale: il fondo cresce del 30% in 8 mesi con un solo versamento registrato.
    const result = computePensionReturn(
      series([
        [2025, 11, 23_597],
        [2026, 1, 24_758],
        [2026, 3, 27_827],
        [2026, 5, 29_841],
        [2026, 7, 31_031],
      ]),
      [contribution(2026, 6, 383, 'tfr')],
      '2025-11'
    );

    expect(result!.annualizedTwr).toBeGreaterThan(20);
    expect(result!.isCoverageSuspicious).toBe(true);
  });

  it('attributes a back-dated contribution to the month its value actually moved', () => {
    // Il caso reale: TFR datato 30/06 ma registrato il 24/07. Lo snapshot di giugno era già
    // congelato, quindi i 382,86 € compaiono nel valore di luglio. Attribuirli a giugno li
    // farebbe sparire dai versamenti del periodo e la crescita di luglio verrebbe letta come
    // guadagno di mercato.
    const result = computePensionReturn(
      series([
        [2026, 6, 30_648.53],
        [2026, 7, 31_031.39],
      ]),
      [contribution(2026, 6, 382.86, 'tfr', new Date(2026, 6, 24))],
      '2026-06'
    );

    expect(result!.contributions.tfr).toBeCloseTo(382.86, 2);
    expect(result!.marketGain).toBeCloseTo(0, 2);
    expect(result!.twr).toBeCloseTo(0, 6);
  });

  it('still ignores a contribution recorded inside the opening month', () => {
    // Registrato a gennaio con data gennaio: il valore di apertura lo contiene già.
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_000],
      ]),
      [contribution(2026, 1, 5_000, 'voluntary', new Date(2026, 0, 20))],
      '2026-01'
    );

    expect(result!.contributions.total).toBe(0);
    expect(result!.twr).toBeCloseTo(0, 10);
  });

  it('falls back to the accounting date when createdAt is missing', () => {
    const legacy = {
      ...contribution(2026, 2, 1_000),
      createdAt: undefined,
    } as unknown as PensionContribution;

    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
      ]),
      [legacy],
      '2026-01'
    );

    expect(result!.contributions.total).toBe(1_000);
    expect(result!.twr).toBeCloseTo(0, 10);
  });

  it('returns null when the window holds fewer than two months', () => {
    expect(computePensionReturn(series([[2026, 1, 10_000]]), [], '2026-01')).toBeNull();
    expect(computePensionReturn(series([[2025, 1, 10_000]]), [], '2026-01')).toBeNull();
  });
});

describe('computePensionReturn — hasNoMovement', () => {
  const series = (values: [number, number, number][]) =>
    values.map(([year, month, value]) => ({ year, month, value }));

  it('flags a window where nothing has happened yet', () => {
    // Lo scenario reale: la finestra parte a luglio, i versamenti di giugno erano già dentro il
    // valore di apertura (registrati a luglio) e da allora il valore non è stato riaggiornato.
    // Ogni riga della scomposizione vale zero e il TWR è 0 per assenza di dati, non per risultato.
    const result = computePensionReturn(
      series([
        [2026, 7, 31_031.39],
        [2026, 8, 31_031.39],
      ]),
      [contribution(2026, 6, 382.86, 'tfr', new Date(2026, 6, 24))],
      '2026-07'
    );

    expect(result!.contributions.total).toBe(0);
    expect(result!.valueGrowth).toBe(0);
    expect(result!.twr).toBeCloseTo(0, 10);
    expect(result!.hasNoMovement).toBe(true);
  });

  it('does NOT flag a flat value that had contributions in the window', () => {
    // Valore fermo NONOSTANTE 500 € versati: il mercato ha perso esattamente quanto è entrato.
    // È un'informazione, non un'assenza — la scomposizione va mostrata.
    const result = computePensionReturn(
      series([
        [2026, 7, 10_000],
        [2026, 8, 10_000],
      ]),
      [contribution(2026, 8, 500, 'voluntary')],
      '2026-07'
    );

    expect(result!.hasNoMovement).toBe(false);
    expect(result!.marketGain).toBe(-500);
  });

  it('does NOT flag a window whose value moved', () => {
    const result = computePensionReturn(
      series([
        [2026, 7, 10_000],
        [2026, 8, 10_120],
      ]),
      [],
      '2026-07'
    );

    expect(result!.hasNoMovement).toBe(false);
  });

  it('treats a sub-cent residual as no movement', () => {
    // Un residuo in virgola mobile non deve trasformare una finestra ferma in una che ha reso.
    const result = computePensionReturn(
      series([
        [2026, 7, 31_031.39],
        [2026, 8, 31_031.393],
      ]),
      [],
      '2026-07'
    );

    expect(result!.hasNoMovement).toBe(true);
  });
});

/**
 * Il predicato che decide se la pagina può mostrare NUMERI invece di una spiegazione.
 *
 * È il contratto che tiene insieme la card di riepilogo e il blocco «Da dove viene la crescita»:
 * finché erano due espressioni separate sono divergite, e la scomposizione stampava «Guadagno di
 * mercato» in grassetto sotto un avviso che diceva che quella differenza NON è guadagno di mercato.
 * Il componente non è testabile qui (nessun renderer), il predicato sì — ed è dove stava il bug.
 */
describe('isPensionReturnMeasurable', () => {
  const series = (values: [number, number, number][]) =>
    values.map(([year, month, value]) => ({ year, month, value }));

  it('ammette una finestra normale: la scomposizione va mostrata', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_120],
        [2026, 3, 10_260],
        [2026, 4, 10_400],
      ]),
      [],
      '2026-01'
    );

    expect(result!.isCoverageSuspicious).toBe(false);
    expect(result!.hasNoMovement).toBe(false);
    expect(isPensionReturnMeasurable(result!)).toBe(true);
  });

  it('nega una finestra con copertura sospetta — la scomposizione va OMESSA', () => {
    // Crescita del 30% in tre mesi senza un solo versamento registrato: sono versamenti mancanti,
    // non mercato. `marketGain` esiste ed è un numero, ma non è un guadagno di mercato: mostrarlo
    // accanto all'avviso che lo nega è la contraddizione che questo predicato impedisce.
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
        [2026, 3, 12_000],
        [2026, 4, 13_000],
      ]),
      [],
      '2026-01'
    );

    expect(result!.isCoverageSuspicious).toBe(true);
    expect(result!.marketGain).toBe(3_000);
    expect(isPensionReturnMeasurable(result!)).toBe(false);
  });

  it('nega una finestra ferma — ogni riga varrebbe zero', () => {
    const result = computePensionReturn(
      series([
        [2026, 7, 29_800],
        [2026, 8, 29_800],
      ]),
      [],
      '2026-07'
    );

    expect(result!.hasNoMovement).toBe(true);
    expect(isPensionReturnMeasurable(result!)).toBe(false);
  });
});

describe('computePensionReturn — isCoverageContradictory', () => {
  const series = (values: [number, number, number][]) =>
    values.map(([year, month, value]) => ({ year, month, value }));

  /**
   * Il caso del 2026-08-31, ridotto ai suoi numeri e riscritto su importi tondi: cinque mesi di
   * versamenti registrati tutti lo stesso giorno, quindi attribuiti da `valueEffectMonth` a un
   * mese solo. La finestra legge +50%, +33% e +25% di "mercato" (che erano versamenti) e poi
   * sottrae 2.250 € da un mese che ne vale 2.270: TWR −97,33%, stampato come misura finché la
   * guardia guardava solo verso l'alto.
   */
  const backfilledAllInAugust = [
    contribution(2026, 4, 400, 'tfr', new Date(2026, 7, 28)),
    contribution(2026, 4, 350, 'employer', new Date(2026, 7, 28)),
    contribution(2026, 5, 200, 'tfr', new Date(2026, 7, 28)),
    contribution(2026, 5, 175, 'employer', new Date(2026, 7, 28)),
    contribution(2026, 6, 200, 'tfr', new Date(2026, 7, 28)),
    contribution(2026, 6, 175, 'employer', new Date(2026, 7, 28)),
    contribution(2026, 7, 200, 'tfr', new Date(2026, 7, 31)),
    contribution(2026, 7, 175, 'employer', new Date(2026, 7, 28)),
    contribution(2026, 8, 200, 'tfr', new Date(2026, 7, 31)),
    contribution(2026, 8, 175, 'employer', new Date(2026, 7, 31)),
  ];

  const backfilledWindow = series([
    [2026, 4, 750],
    [2026, 5, 1125],
    [2026, 6, 1500],
    [2026, 7, 1875],
    [2026, 8, 2270],
  ]);

  it('non spaccia per misura un TWR che i versamenti hanno prodotto', () => {
    const result = computePensionReturn(backfilledWindow, backfilledAllInAugust, '2026-04')!;

    expect(result.twr).toBeCloseTo(-97.33, 1);
    expect(result.isCoverageContradictory).toBe(true);
    expect(isPensionReturnMeasurable(result)).toBe(false);
  });

  it('normalizza a null l’annualizzato che uscirebbe NaN da un indice negativo', () => {
    // Un mese in più e lo snapshot di agosto congelato sotto i versamenti che gli sono attribuiti:
    // l'indice diventa negativo e `Math.pow(negativo, 12/5)` è NaN. Un NaN a valle passa ogni
    // confronto senza far scattare nulla (`NaN > 20` è false) e finisce a schermo come «NaN%».
    const result = computePensionReturn(
      series([
        [2026, 4, 750],
        [2026, 5, 1125],
        [2026, 6, 1500],
        [2026, 7, 1875],
        [2026, 8, 1860],
        [2026, 9, 2300],
      ]),
      backfilledAllInAugust,
      '2026-04'
    )!;

    expect(result.twr).toBeLessThan(-100);
    expect(result.annualizedTwr).toBeNull();
    expect(Number.isNaN(result.annualizedTwr as number)).toBe(false);
    expect(result.isCoverageContradictory).toBe(true);
    expect(isPensionReturnMeasurable(result)).toBe(false);
  });

  it('con la finestra aperta ad agosto la stessa storia torna misurabile', () => {
    // I dieci versamenti hanno mese-effetto 2026-08 = `firstKey`, quindi escono come "già dentro
    // il valore di apertura" — ed è vero. È il rimedio senza modifiche al codice.
    const result = computePensionReturn(
      series([
        [2026, 8, 2270],
        [2026, 9, 2670],
      ]),
      [...backfilledAllInAugust, contribution(2026, 9, 375, 'tfr', new Date(2026, 8, 30))],
      '2026-08'
    )!;

    expect(result.contributions.total).toBeCloseTo(375, 2);
    expect(result.twr).toBeCloseTo(1.1, 1);
    expect(result.isCoverageContradictory).toBe(false);
    expect(isPensionReturnMeasurable(result)).toBe(true);
  });

  it('NON si mangia un ribasso di mercato vero — la guardia sta all’impossibile, non all’implausibile', () => {
    // −25% in un anno è il 2022 di un comparto azionario: sgradevole, non contraddittorio.
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 9_400],
        [2026, 3, 8_900],
        [2026, 4, 8_200],
        [2026, 5, 7_500],
      ]),
      [],
      '2026-01'
    )!;

    expect(result.twr).toBeCloseTo(-25, 0);
    expect(result.isCoverageContradictory).toBe(false);
    expect(result.isCoverageSuspicious).toBe(false);
    expect(isPensionReturnMeasurable(result)).toBe(true);
  });
});
