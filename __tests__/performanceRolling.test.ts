/**
 * Finestre rolling 12M/36M.
 *
 * Le tre incoerenze che questa suite inchioda:
 *   1. il limite superiore della finestra era il **1° del mese** a mezzanotte, e il filtro delle
 *      spese (`date <= endDate`) buttava via l'intero ultimo mese di movimenti;
 *   2. il TWR annualizzava su `windowMonths + 1` mesi mentre il CAGR della stessa riga usava
 *      `windowMonths` → Sharpe rolling e CAGR rolling su basi temporali diverse;
 *   3. i cash flow partivano dal mese dello snapshot di partenza, il cui valore li contiene già;
 *   4. le finestre misuravano il capitale della BASE con i flussi del PATRIMONIO — il fix D1
 *      («i flussi seguono la base») era arrivato ai cinque periodi fissi e non qui, così ogni
 *      euro risparmiato fuori dal portafoglio veniva sottratto al rendimento del portafoglio.
 *
 * Le serie sono costruite in modo che la risposta giusta sia **zero**: un movimento perso o contato
 * due volte non può nascondersi dietro un arrotondamento.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock Firebase-dependent modules to prevent initialization errors in tests
vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
}));
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/assetAllocationService', () => ({}));

import { calculateRollingPeriods } from '@/lib/services/performanceService';
import { buildPortfolioCashFlows } from '@/lib/utils/portfolioFlows';
import { toPerformanceBaseSnapshots } from '@/lib/utils/performanceBase';
import type { MonthlySnapshot } from '@/types/assets';
import type { Expense, ExpenseType } from '@/types/expenses';
import type { CashFlowData } from '@/types/performance';

const USER = 'user-1';
const RISK_FREE = 2.5;
const WINDOW = 12;

function snapshot(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return { year, month, totalNetWorth, isDummy: false } as MonthlySnapshot;
}

/** `count` mesi consecutivi dal (year, month) dato, con i valori forniti in ordine. */
function series(year: number, month: number, values: number[]): MonthlySnapshot[] {
  return values.map((value, k) => {
    const date = new Date(year, month - 1 + k, 1);
    return snapshot(date.getFullYear(), date.getMonth() + 1, value);
  });
}

/** Movimento a metà mese: il giorno 15 è ciò che un limite a mezzanotte del 1° perdeva. */
function expense(year: number, month: number, type: ExpenseType, amount: number): Expense {
  return {
    id: `exp-${year}-${month}-${type}-${amount}`,
    userId: USER,
    type,
    categoryId: 'cat-salary',
    categoryName: 'Stipendio',
    amount,
    currency: 'EUR',
    date: new Date(year, month - 1, 15),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Expense;
}

function rolling(snapshots: MonthlySnapshot[], expenses: Expense[] = [], windowMonths = WINDOW) {
  return calculateRollingPeriods(USER, snapshots, windowMonths, RISK_FREE, undefined, expenses);
}

/** Come `rolling`, ma con i flussi per asset: è ciò che il service passa quando la base esclude. */
function rollingWithFlows(
  snapshots: MonthlySnapshot[],
  expenses: Expense[],
  portfolioFlows: CashFlowData[],
  windowMonths = WINDOW,
) {
  return calculateRollingPeriods(USER, snapshots, windowMonths, RISK_FREE, undefined, expenses, portfolioFlows);
}

type Position = { assetId: string; quantity: number; price: number };

/** Uno snapshot col dettaglio per strumento: è il `byAsset` a rendere un mese MISURABILE. */
function positioned(year: number, month: number, positions: Position[]): MonthlySnapshot {
  return {
    year,
    month,
    totalNetWorth: positions.reduce((sum, p) => sum + p.quantity * p.price, 0),
    illiquidNetWorth: 0,
    isDummy: false,
    byAsset: positions.map((p) => ({
      assetId: p.assetId,
      ticker: p.assetId.toUpperCase(),
      name: p.assetId,
      quantity: p.quantity,
      price: p.price,
      totalValue: p.quantity * p.price,
    })),
  } as MonthlySnapshot;
}

/** Uno snapshot inserito a mano: nessun `byAsset`, quindi nessuna coppia misurabile. */
function handEntered(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return { year, month, totalNetWorth, illiquidNetWorth: 0, isDummy: false } as MonthlySnapshot;
}

describe('calculateRollingPeriods — finestra', () => {
  const flat = series(2025, 1, Array(13).fill(100000)); // gen 2025 → gen 2026, patrimonio fermo

  it('produce una finestra per ogni snapshot oltre il primo blocco', async () => {
    const result = await rolling(series(2025, 1, Array(15).fill(100000)));
    expect(result.length).toBe(15 - WINDOW);
  });

  it('non produce nulla se lo storico non copre la finestra', async () => {
    expect(await rolling(series(2025, 1, Array(WINDOW).fill(100000)))).toEqual([]);
  });

  it('le due date delimitano esattamente windowMonths mesi misurati', async () => {
    const [window] = await rolling(flat);

    // Valutazione di partenza: gen 2025 → primo mese misurato feb 2025, ultimo gen 2026.
    expect(window.periodStartDate).toEqual(new Date(2025, 1, 1));
    expect(window.periodEndDate).toEqual(new Date(2026, 0, 31, 23, 59, 59, 999));

    const months =
      (window.periodEndDate.getFullYear() - window.periodStartDate.getFullYear()) * 12 +
      (window.periodEndDate.getMonth() - window.periodStartDate.getMonth()) +
      1;
    expect(months).toBe(WINDOW);
  });
});

describe('calculateRollingPeriods — cash flow', () => {
  it('include i movimenti dell ULTIMO mese della finestra (A4.1)', async () => {
    // Patrimonio fermo a 100.000 per un anno, poi 110.000 nell ultimo mese — ma solo perché sono
    // stati versati 10.000. Rendimento vero: zero.
    const snapshots = series(2025, 1, [...Array(12).fill(100000), 110000]);
    const contribution = [expense(2026, 1, 'income', 10000)];

    const [window] = await rolling(snapshots, contribution);

    // Con il limite a mezzanotte del 1° gennaio il versamento spariva e il CAGR diceva +10%.
    expect(window.cagr).toBeCloseTo(0, 6);
  });

  it('esclude i movimenti del mese della valutazione di partenza (A4.3)', async () => {
    // I 5.000 di gennaio sono già dentro il patrimonio di fine gennaio, cioè dentro il valore da
    // cui la finestra parte: ricontarli li sottrarrebbe due volte.
    const snapshots = series(2025, 1, Array(13).fill(100000));
    const januaryIncome = [expense(2025, 1, 'income', 5000)];

    const [window] = await rolling(snapshots, januaryIncome);

    // Se entrassero, il CAGR leggerebbe 100.000 / 105.000 − 1 = −4,76%.
    expect(window.cagr).toBeCloseTo(0, 6);
  });

  it('neutralizza un versamento a metà finestra', async () => {
    const snapshots = series(2025, 1, [
      ...Array(6).fill(100000),
      ...Array(7).fill(120000), // il salto è tutto versamento
    ]);
    const contribution = [expense(2025, 7, 'income', 20000)];

    const [window] = await rolling(snapshots, contribution);

    expect(window.cagr).toBeCloseTo(0, 6);
    expect(window.volatility!).toBeCloseTo(0, 6);
  });
});

describe('calculateRollingPeriods — annualizzazione', () => {
  it('TWR e CAGR annualizzano sugli STESSI mesi (A4.2)', async () => {
    // Crescita esatta dell 1% al mese: su 12 mesi misurati entrambi devono dare 1,01¹² − 1.
    const values = Array.from({ length: 13 }, (_, k) => 100000 * Math.pow(1.01, k));
    const expected = (Math.pow(1.01, 12) - 1) * 100;

    const [window] = await rolling(series(2025, 1, values));

    // Con zero cash flow il CAGR È il TWR: stesso rapporto, stessa finestra. Lo Sharpe qui non si
    // asserisce — i rendimenti identici danno una volatilità di ~1e-14 invece che 0 esatto (rumore
    // in virgola mobile), la guardia `volatility === 0` non scatta e il rapporto esplode. È un
    // artefatto solo sintetico (nessun portafoglio reale è così regolare), ma è la stessa famiglia
    // di casi degeneri che la fase 5 deve chiudere richiedendo abbastanza osservazioni.
    expect(window.cagr).toBeCloseTo(expected, 6);
    expect(window.volatility!).toBeCloseTo(0, 6);
  });

  it('lo Sharpe rolling usa il TWR annualizzato sulla finestra, non su un mese in più', async () => {
    // Un mese negativo dà volatilità non nulla, così lo Sharpe esiste e si può ricostruire a mano:
    // (TWR − risk free) / volatilità, con TWR annualizzato su 12 mesi.
    const values = [
      100000, 101000, 102010, 103030, 104060, 105101,
      99000, 100000, 101000, 102010, 103030, 104060, 105101,
    ];
    const [window] = await rolling(series(2025, 1, values));

    const linked = values[12] / values[0]; // nessun cash flow → il concatenamento è il rapporto
    const twr = (Math.pow(linked, 12 / WINDOW) - 1) * 100;

    expect(window.sharpeRatio!).toBeCloseTo((twr - RISK_FREE) / window.volatility!, 6);
    // Con l annualizzazione su 13 mesi lo Sharpe usciva più basso: stessa finestra, due basi.
    expect(window.cagr).toBeCloseTo(twr, 6);
  });

  it('funziona identicamente sulla finestra a 36 mesi', async () => {
    const values = Array.from({ length: 37 }, (_, k) => 100000 * Math.pow(1.01, k));
    const [window] = await rolling(series(2023, 1, values), [], 36);

    expect(window.periodStartDate).toEqual(new Date(2023, 1, 1));
    expect(window.cagr).toBeCloseTo((Math.pow(1.01, 12) - 1) * 100, 6);
  });
});

describe('calculateRollingPeriods — i flussi seguono la base', () => {
  const ETF = 'etf';
  const CASA = 'casa';

  /** La pipeline vera in due righe: gli snapshot proiettati sulla base, e i flussi per asset. */
  function baseAware(raw: MonthlySnapshot[], excluded: string[]) {
    const projected = toPerformanceBaseSnapshots(raw, excluded);
    return { projected, flows: buildPortfolioCashFlows(projected, excluded) };
  }

  it('non legge come versamento nel portafoglio il risparmio finito in un asset escluso', async () => {
    // ETF fermo a 100.000 per tredici mesi: il portafoglio non ha reso niente e non ha ricevuto
    // niente. La casa, fuori base, sale di 10.000 a gennaio — pagati con i 10.000 che il Cashflow
    // registra come entrata. Il rendimento vero del portafoglio è zero.
    const raw = Array.from({ length: 13 }, (_, k) => {
      const date = new Date(2025, k, 1);
      return positioned(date.getFullYear(), date.getMonth() + 1, [
        { assetId: ETF, quantity: 100, price: 1000 },
        { assetId: CASA, quantity: 1, price: k === 12 ? 210000 : 200000 },
      ]);
    });
    const cashflow = [expense(2026, 1, 'income', 10000)];
    const { projected, flows } = baseAware(raw, [CASA]);

    const [conFlussi] = await rollingWithFlows(projected, cashflow, flows);
    expect(conFlussi.cagr!).toBeCloseTo(0, 6);

    // La lettura di prima del fix: capitale del portafoglio, flussi del patrimonio. I 10.000 non
    // sono mai entrati nell'ETF, eppure venivano sottratti dal suo rendimento.
    const [senzaFlussi] = await rolling(projected, cashflow);
    expect(senzaFlussi.cagr!).toBeCloseTo((100000 / 110000 - 1) * 100, 6);
  });

  it('ricade sul Cashflow nei mesi non misurabili, uno per uno', async () => {
    // Gennaio-marzo 2025 sono inseriti a mano: nessun `byAsset`, nessuna coppia misurabile. Il
    // versamento di 20.000 di marzo esiste solo nel Cashflow e deve sopravvivere. Da aprile il
    // dettaglio c'è, e i mesi misurati valgono zero.
    const raw = [
      handEntered(2025, 1, 300000),
      handEntered(2025, 2, 300000),
      handEntered(2025, 3, 320000),
      ...Array.from({ length: 10 }, (_, k) => {
        const date = new Date(2025, 3 + k, 1);
        return positioned(date.getFullYear(), date.getMonth() + 1, [
          { assetId: ETF, quantity: 120, price: 1000 },
          { assetId: CASA, quantity: 1, price: 200000 },
        ]);
      }),
    ];
    const cashflow = [expense(2025, 3, 'income', 20000)];
    const { projected, flows } = baseAware(raw, [CASA]);

    // Il backfill E₀ = 200.000 riporta i mesi senza dettaglio sulla stessa base degli altri.
    expect(projected.slice(0, 3).map((s) => s.totalNetWorth)).toEqual([100000, 100000, 120000]);
    // Misurabili solo da maggio: serve il `byAsset` di ENTRAMBI i mesi della coppia.
    expect(flows.map((f) => f.date.getMonth() + 1)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 1]);
    expect(flows.every((f) => f.netCashFlow === 0)).toBe(true);

    const [window] = await rollingWithFlows(projected, cashflow, flows);

    // 120.000 partendo da 100.000 con 20.000 versati fa zero. Se il fallback fosse per PERIODO
    // invece che per mese il versamento sparirebbe, e la finestra leggerebbe +20%.
    expect(window.cagr!).toBeCloseTo(0, 6);
  });

  it('un CAGR non misurabile è `null`, non uno zero', async () => {
    // Il portafoglio nasce a gennaio: la valutazione di partenza è zero, e da zero non esiste un
    // tasso di crescita. Scriverlo 0% direbbe «quell'anno non ha reso», che è un'altra frase —
    // ed è quello che `cagr || 0` faceva.
    const [window] = await rolling(series(2025, 1, [0, ...Array(12).fill(100000)]));

    expect(window.cagr).toBeNull();
  });
});
