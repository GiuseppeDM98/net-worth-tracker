/**
 * The operating plan's reconcile (lib/utils/operatingPlan.ts, 2026-11-19): the fifteen rules that
 * turn what the «Piano» stage wrote into a plan the app can create — the quotas back to 100, the
 * money-market fund never bought, the «da tenere» never sold, the quantities held, the limits of
 * «Criteri del modello» — each correction said in one sentence; idempotent. Invented instruments,
 * round figures.
 */

import { describe, expect, it } from 'vitest';
import {
  operatingPlanOf,
  reconcileOperatingPlan,
  type OperatingPlanFacts,
  type OperatingPlanInstrument,
  type RawOperatingPlan,
} from '@/lib/utils/operatingPlan';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';

type Held = OperatingPlanFacts['held'][string];

function instrument(ref: string, kind: OperatingPlanInstrument['kind'], name: string): OperatingPlanInstrument {
  return { ref, kind, name, assetClass: kind === 'cashFund' ? 'cash' : 'equity', ...(kind === 'new' ? {} : { assetId: `asset-${ref}` }) };
}

function held(overrides: Partial<Held> = {}): Held {
  return { quantity: 100, priceEur: 10, valueEur: 1000, keep: false, tax: { kind: 'taxed', perEuro: 0.1 }, ...overrides };
}

/** Three held ETFs, a money-market fund and a new instrument from the report. */
function facts(overrides: Partial<Record<string, Partial<Held>>> = {}): OperatingPlanFacts {
  return {
    instruments: [
      instrument('S1', 'held', 'ETF ornitorinco'),
      instrument('S2', 'held', 'ETF fenicottero'),
      instrument('S3', 'held', 'ETF pellicano'),
      instrument('N1', 'new', 'ETF airone'),
      instrument('M1', 'cashFund', 'Fondo lontra'),
    ],
    held: {
      S1: held(overrides.S1),
      S2: held(overrides.S2),
      S3: held(overrides.S3),
      M1: held({ quantity: 300, priceEur: 10, valueEur: 3000, tax: { kind: 'exempt' }, ...overrides.M1 }),
    },
  };
}

type RawRow = RawOperatingPlan['rows'][number];
const buy = (ref: string, targetPercentage: number): RawRow => ({ ref, action: 'buy', targetPercentage, reason: 'perché sì' });
const hold = (ref: string): RawRow => ({ ref, action: 'hold', targetPercentage: 0, reason: 'basta così' });
const sell = (ref: string, extra: Partial<RawRow> = {}): RawRow => ({ ref, action: 'sell', targetPercentage: 0, reason: 'esce', ...extra });

function raw(rows: RawRow[], extra: Partial<RawOperatingPlan> = {}): RawOperatingPlan {
  return { summary: 'Un piano.', monthlyInflowEur: 500, months: 12, rows, reviewReason: 'A metà strada.', departures: [], ...extra };
}

const rowOf = (plan: { rows: { ref: string }[] }, ref: string) => plan.rows.find((row) => row.ref === ref) as ReturnType<typeof reconcileOperatingPlan>['rows'][number] | undefined;

describe('reconcileOperatingPlan — the quotas and the money-market fund', () => {
  it('scales quotas that sum to 110 back to 100 in proportion, the missing cent to the largest, and says so', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 50), buy('S2', 30), buy('S3', 30)]), facts());
    expect(plan.rows.map((row) => row.targetPercentage)).toEqual([45.46, 27.27, 27.27]);
    expect(plan.corrections).toEqual(['Le quote sommavano a 110%: riportate a 100 in proporzione.']);
    expect(plan.usable).toBe(true);
  });

  it('leaves quotas that sum to 100 untouched, with no sentence', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 60), buy('S2', 40), hold('S3')]), facts());
    expect(plan.rows.map((row) => [row.ref, row.action, row.targetPercentage])).toEqual([['S1', 'buy', 60], ['S2', 'buy', 40], ['S3', 'hold', 0]]);
    expect(plan.corrections).toEqual([]);
  });

  it('never buys a money-market fund: a buy at 10 becomes a hold at 0', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 60), buy('S2', 30), hold('S3'), buy('M1', 10)]), facts());
    expect(rowOf(plan, 'M1')).toMatchObject({ action: 'hold', targetPercentage: 0 });
    expect(plan.rows.filter((row) => row.action === 'buy').map((row) => [row.ref, row.targetPercentage])).toEqual([['S1', 66.67], ['S2', 33.33]]);
    expect(plan.corrections[0]).toBe('Fondo lontra è un fondo monetario: il piano non lo compra.');
  });
});

describe('reconcileOperatingPlan — the sales', () => {
  it('removes the sale of an instrument the answers keep', () => {
    const plan = reconcileOperatingPlan(raw([sell('S1', { sellQuantity: 50 }), buy('S2', 50), buy('S3', 50)]), facts({ S1: { keep: true } }));
    const row = rowOf(plan, 'S1');
    expect(row).toMatchObject({ action: 'hold', targetPercentage: 0 });
    expect(row?.sellQuantity).toBeUndefined();
    expect(row?.sellMonth).toBeUndefined();
    expect(plan.corrections).toContain('Hai indicato di tenere ETF ornitorinco: la vendita non entra nel piano.');
  });

  it('sells every share when the plan asks more than are held, and says so', () => {
    const plan = reconcileOperatingPlan(raw([sell('S1', { sellQuantity: 40 }), buy('S2', 50), buy('S3', 50)]), facts({ S1: { quantity: 38, valueEur: 380 } }));
    const row = rowOf(plan, 'S1');
    expect(row?.action).toBe('sell');
    expect(row?.sellQuantity).toBeUndefined();
    expect(plan.corrections).toContain('Il Consulente indicava 40 quote di ETF ornitorinco: il piano ne vende 38, quelle che possiedi.');
  });

  it('removes a sale of 0 shares silently', () => {
    const plan = reconcileOperatingPlan(raw([sell('S1', { sellQuantity: 0 }), buy('S2', 50), buy('S3', 50)]), facts());
    expect(rowOf(plan, 'S1')).toMatchObject({ action: 'hold', targetPercentage: 0 });
    expect(rowOf(plan, 'S1')?.sellQuantity).toBeUndefined();
    expect(plan.corrections).toEqual([]);
  });

  it('carries a partial sale at quota 0: the rest stays where it is', () => {
    const plan = reconcileOperatingPlan(raw([sell('S1', { sellQuantity: 50, targetPercentage: 20 }), buy('S2', 50), buy('S3', 50)]), facts());
    expect(rowOf(plan, 'S1')).toMatchObject({ action: 'sell', targetPercentage: 0, sellQuantity: 50 });
  });

  it('brings a sale fixed after the last month back to the last month', () => {
    const plan = reconcileOperatingPlan(raw([sell('S1', { sellMonth: 14 }), buy('S2', 50), buy('S3', 50)]), facts());
    expect(rowOf(plan, 'S1')?.sellMonth).toBe(12);
    expect(plan.corrections).toContain('La vendita di ETF ornitorinco era fissata fuori dal piano: va al mese 12.');
  });
});

describe('reconcileOperatingPlan — the rows the plan forgets or invents', () => {
  it('gives a forgotten held instrument a hold row at 0 and names it', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 50), buy('S3', 50)]), facts());
    expect(rowOf(plan, 'S2')).toEqual({ ref: 'S2', action: 'hold', targetPercentage: 0, reason: '' });
    expect(plan.corrections).toEqual(["ETF fenicottero: il piano non lo cita. Resta dov'è e il piano non lo compra."]);
  });

  it('names two forgotten instruments in one plural sentence', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 100)]), facts());
    expect(plan.corrections).toEqual(['ETF fenicottero e ETF pellicano: il piano non li cita. Restano dove sono e il piano non li compra.']);
  });

  it('drops a key the facts do not know, and a second row for a key, with one sentence', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 50), buy('S1', 20), buy('S2', 50), hold('S3'), buy('X9', 10)]), facts());
    expect(plan.rows.map((row) => row.ref)).toEqual(['S1', 'S2', 'S3']);
    expect(plan.corrections).toEqual(['Il piano citava uno strumento che non è fra i tuoi né fra quelli del report: la riga non entra.']);
  });

  it('drops a new instrument bought at 0, and one the plan holds or sells', () => {
    const atZero = reconcileOperatingPlan(raw([buy('S1', 50), buy('S2', 50), hold('S3'), buy('N1', 0)]), facts());
    expect(rowOf(atZero, 'N1')).toBeUndefined();
    const held = reconcileOperatingPlan(raw([buy('S1', 50), buy('S2', 50), hold('S3'), hold('N1')]), facts());
    expect(rowOf(held, 'N1')).toBeUndefined();
  });

  it('keeps the rows in the order of the facts, S then N then M', () => {
    const plan = reconcileOperatingPlan(raw([sell('M1'), buy('N1', 20), hold('S3'), buy('S2', 40), buy('S1', 40)]), facts());
    expect(plan.rows.map((row) => row.ref)).toEqual(['S1', 'S2', 'S3', 'N1', 'M1']);
  });
});

describe('reconcileOperatingPlan — the limits of «Criteri del modello»', () => {
  it('lowers a quota above its maximum and gives the difference to the others', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 40), buy('S2', 60), hold('S3')]), facts({ S1: { maxPct: 15 } }));
    expect(plan.rows.filter((row) => row.action === 'buy').map((row) => row.targetPercentage)).toEqual([15, 85]);
    expect(plan.corrections).toEqual(['ETF ornitorinco: quota portata dal 40% al 15%, il limite dei tuoi Criteri del modello.']);
  });

  it('scales BEFORE the limits, so a second reconcile leaves the limited quota where it is', () => {
    const facts15 = facts({ S1: { maxPct: 15 } });
    const once = reconcileOperatingPlan(raw([buy('S1', 36), buy('S2', 54), hold('S3')]), facts15);
    expect(once.rows.filter((row) => row.action === 'buy').map((row) => row.targetPercentage)).toEqual([15, 85]);
    const twice = reconcileOperatingPlan(once, facts15);
    expect(rowOf(twice, 'S1')?.targetPercentage).toBe(15);
    expect(twice.corrections).toEqual([]);
  });

  it('is unusable when the limits cannot reach 100', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 50), buy('S2', 50), hold('S3')]), facts({ S1: { maxPct: 40 }, S2: { maxPct: 40 } }));
    expect(plan.usable).toBe(false);
    expect(plan.corrections.at(-1)).toBe('I limiti dei tuoi Criteri del modello non lasciano arrivare al 100%: il piano non può diventare un piano di accumulo.');
  });

  it('never raises a hold to its minimum', () => {
    const plan = reconcileOperatingPlan(raw([buy('S1', 50), buy('S2', 50), hold('S3')]), facts({ S3: { minPct: 10 } }));
    expect(rowOf(plan, 'S3')).toMatchObject({ action: 'hold', targetPercentage: 0 });
  });

  it('is unusable when nothing is bought', () => {
    const plan = reconcileOperatingPlan(raw([hold('S1'), hold('S2'), hold('S3')]), facts());
    expect(plan.usable).toBe(false);
    expect(plan.corrections).toEqual(['Il piano non compra niente: non può diventare un piano di accumulo.']);
  });
});

describe('reconcileOperatingPlan — idempotence and the sales’ figures', () => {
  it('adds no sentence and changes nothing on a second pass', () => {
    const first = reconcileOperatingPlan(
      raw([buy('S1', 50), buy('N1', 30), sell('S2', { sellQuantity: 120, sellMonth: 20 }), buy('M1', 30), buy('X9', 5)], { months: 90, reviewMonth: 70, monthlyInflowEur: -5 }),
      facts({ S1: { maxPct: 50 } })
    );
    expect(first.corrections.length).toBeGreaterThan(3);
    const second = reconcileOperatingPlan(first, facts({ S1: { maxPct: 50 } }));
    expect(second.corrections).toEqual([]);
    expect({ ...second, corrections: first.corrections }).toEqual(first);
    expect(first.months).toBe(60);
    expect(first.monthlyInflowEur).toBe(0);
    expect(first.reviewMonth).toBeUndefined();
  });

  it('prices every sale on the quantity it really sells, with the tax taxed, exempt or not estimable', () => {
    const plan = reconcileOperatingPlan(
      raw([sell('S1', { sellQuantity: 40 }), sell('S2', { sellQuantity: 50 }), sell('S3'), buy('N1', 100), sell('M1')]),
      facts({ S1: { quantity: 38, valueEur: 380 }, S2: { tax: { kind: 'exempt' } }, S3: { tax: { kind: 'unknown', reason: 'rate' } } })
    );
    expect(rowOf(plan, 'S1')).toMatchObject({ estimatedProceedsEur: 380, estimatedTaxEur: 38 });
    expect(rowOf(plan, 'S2')).toMatchObject({ estimatedProceedsEur: 500, estimatedTaxEur: 0 });
    expect(rowOf(plan, 'S3')).toMatchObject({ estimatedProceedsEur: 1000, estimatedTaxEur: null, taxUnknownReason: 'rate' });
    expect(rowOf(plan, 'M1')).toMatchObject({ estimatedProceedsEur: 3000, estimatedTaxEur: 0 });
  });
});

describe('operatingPlanOf', () => {
  const finishedAt = new Date('2026-11-19T11:00:00.000Z');
  const plan = reconcileOperatingPlan(raw([buy('S1', 100), hold('S2'), hold('S3')]), facts());
  const doc = (overrides: Partial<NonNullable<AllocationAdviceDocument['operatingPlan']>> = {}, reportAt = finishedAt) =>
    ({
      report: { markdown: '', proposal: null, model: 'm', finishedAt: reportAt },
      operatingPlan: { status: 'ready', plan, error: null, model: 'm', startedAt: finishedAt, finishedAt, reportFinishedAt: finishedAt, ...overrides },
    }) as Pick<AllocationAdviceDocument, 'operatingPlan' | 'report'>;

  it('is the plan of this report when ready and usable', () => {
    expect(operatingPlanOf(doc())).toBe(plan);
  });

  it('is null for a plan written on another report, a failed or running one, an unusable one, or none', () => {
    expect(operatingPlanOf(doc({}, new Date('2026-11-20T11:00:00.000Z')))).toBeNull();
    expect(operatingPlanOf(doc({ status: 'failed', plan: null }))).toBeNull();
    expect(operatingPlanOf(doc({ status: 'running', plan: null }))).toBeNull();
    expect(operatingPlanOf(doc({ plan: { ...plan, usable: false } }))).toBeNull();
    expect(operatingPlanOf({ report: null, operatingPlan: null })).toBeNull();
    expect(operatingPlanOf(null)).toBeNull();
  });
});
