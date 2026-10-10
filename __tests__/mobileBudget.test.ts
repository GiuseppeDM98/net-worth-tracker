/**
 * The first-screen budget (`lib/utils/mobileBudget.ts`): every metric in its direction with zero
 * tolerance, the three-state closed-row ratchet, the widening that needs a NEW `raisedBy`, and a
 * `--tighten` that only ever tightens, to the exact measure.
 */
import { describe, it, expect } from 'vitest';
import {
  compareCensusToBudget,
  tightenBudget,
  tightenRefusal,
  type CensusRow,
  type CensusRun,
  type MobileBudget,
  type MobileBudgetEntry,
  type MobileMetrics,
  type MobileViewport,
} from '@/lib/utils/mobileBudget';

const METRICS: MobileMetrics = {
  screens: 3.84,
  tilesAboveFold: 1,
  tilesFullyAboveFold: 0,
  figuresAboveFold: 16,
  figuresOutsideVerdict: 4,
  firstClosedRowAbovePill: null,
  overflowX: false,
};

function makeBudget(entry: Partial<MobileBudgetEntry> = {}, viewport: MobileViewport = '390'): MobileBudget {
  return {
    measuredAt: '2026-10-10',
    account: 'census@example.com',
    tolerance: {},
    informational: { '768': ['figuresOutsideVerdict', 'firstClosedRowAbovePill'] },
    surfaces: {
      panoramica: { path: '/dashboard', target: true },
      impostazioni: { path: '/dashboard/settings', target: false },
    },
    budget: { panoramica: { [viewport]: { ...METRICS, ...entry } } },
  };
}

function row(metrics: Partial<MobileMetrics> = {}, viewport: MobileViewport = '390', surface = 'panoramica'): CensusRow {
  return { surface, viewport, status: 'ok', metrics: { ...METRICS, ...metrics } };
}

describe('compareCensusToBudget — each metric in its direction', () => {
  it('is green when the measure equals the budget', () => {
    const verdict = compareCensusToBudget([row()], makeBudget());

    expect(verdict.ok).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it('is green when every metric is BETTER than the budget', () => {
    const better = row({ screens: 2, tilesAboveFold: 3, tilesFullyAboveFold: 1, figuresAboveFold: 5, figuresOutsideVerdict: 1 });

    expect(compareCensusToBudget([better], makeBudget()).ok).toBe(true);
  });

  it('fails a ceiling exceeded by the smallest step, with surface and metric', () => {
    const verdict = compareCensusToBudget([row({ screens: 3.85 })], makeBudget());

    expect(verdict.ok).toBe(false);
    expect(verdict.violations).toEqual([
      { kind: 'over-ceiling', surface: 'panoramica', viewport: '390', metric: 'screens', measured: 3.85, limit: 3.84 },
    ]);
  });

  it('fails a figure count one above its ceiling: zero tolerance', () => {
    const verdict = compareCensusToBudget([row({ figuresOutsideVerdict: 5 })], makeBudget());

    expect(verdict.violations.map((v) => [v.kind, v.metric])).toEqual([['over-ceiling', 'figuresOutsideVerdict']]);
  });

  it('fails a floor missed', () => {
    const verdict = compareCensusToBudget([row({ tilesAboveFold: 0 })], makeBudget());

    expect(verdict.violations).toEqual([
      { kind: 'under-floor', surface: 'panoramica', viewport: '390', metric: 'tilesAboveFold', measured: 0, limit: 1 },
    ]);
  });

  it('honours an explicit tolerance when the budget declares one', () => {
    const budget = { ...makeBudget(), tolerance: { screens: 0.05 } };

    expect(compareCensusToBudget([row({ screens: 3.88 })], budget).ok).toBe(true);
    expect(compareCensusToBudget([row({ screens: 3.9 })], budget).ok).toBe(false);
  });

  it('fails a horizontal overflow whatever the budget says', () => {
    const verdict = compareCensusToBudget([row({ overflowX: true })], makeBudget({ overflowX: true }));

    expect(verdict.violations.map((v) => v.kind)).toEqual(['overflow-x']);
  });
});

describe('compareCensusToBudget — the closed-row ratchet', () => {
  it('fails a closed row the budget has not registered yet («riga chiusa non registrata»)', () => {
    const verdict = compareCensusToBudget([row({ firstClosedRowAbovePill: true })], makeBudget());

    expect(verdict.violations).toEqual([
      { kind: 'closed-row-unregistered', surface: 'panoramica', viewport: '390', metric: 'firstClosedRowAbovePill', measured: true },
    ]);
  });

  it('fails a registered true that comes back false', () => {
    const verdict = compareCensusToBudget([row({ firstClosedRowAbovePill: false })], makeBudget({ firstClosedRowAbovePill: true }));

    expect(verdict.violations.map((v) => v.kind)).toEqual(['closed-row-regressed']);
  });

  it('fails a registered value whose closed rows are gone (null)', () => {
    const budget = makeBudget({ firstClosedRowAbovePill: false, raisedBy: 'MOB-07: LA tessera senza curva' });

    expect(compareCensusToBudget([row({ firstClosedRowAbovePill: null })], budget).violations.map((v) => v.kind)).toEqual(['closed-row-regressed']);
  });

  it('accepts true where the exception false was registered', () => {
    const budget = makeBudget({ firstClosedRowAbovePill: false, raisedBy: 'MOB-07: LA tessera senza curva' });

    expect(compareCensusToBudget([row({ firstClosedRowAbovePill: true })], budget).ok).toBe(true);
  });

  it('refuses a false registered without raisedBy', () => {
    const verdict = compareCensusToBudget([row({ firstClosedRowAbovePill: false })], makeBudget({ firstClosedRowAbovePill: false }));

    expect(verdict.violations.map((v) => v.kind)).toEqual(['closed-row-false-without-reason']);
  });
});

describe('compareCensusToBudget — surfaces that cannot be measured', () => {
  it.each(['missing', 'unsettled'] as const)('fails a %s surface with its name', (status) => {
    const verdict = compareCensusToBudget([{ surface: 'panoramica', viewport: '390', status, metrics: null }], makeBudget());

    expect(verdict.ok).toBe(false);
    expect(verdict.violations).toEqual([{ kind: status, surface: 'panoramica', viewport: '390', metric: null }]);
  });

  it('fails a budget entry the run did not measure: a subset run is never green', () => {
    expect(compareCensusToBudget([], makeBudget()).violations.map((v) => v.kind)).toEqual(['not-measured']);
  });

  it('fails a measured surface with no budget entry', () => {
    const verdict = compareCensusToBudget([row(), row({}, '390', 'storico')], makeBudget());

    expect(verdict.violations).toEqual([{ kind: 'no-budget', surface: 'storico', viewport: '390', metric: null }]);
  });
});

describe('compareCensusToBudget — informational metrics', () => {
  it('prints an informational breach without failing', () => {
    const budget = makeBudget({}, '768');
    const verdict = compareCensusToBudget([row({ figuresOutsideVerdict: 40, firstClosedRowAbovePill: true }, '768')], budget);

    expect(verdict.ok).toBe(true);
    expect(verdict.violations).toEqual([]);
    expect(verdict.informational.map((v) => v.metric)).toEqual(['figuresOutsideVerdict', 'firstClosedRowAbovePill']);
  });

  it('still enforces the other metrics at that viewport', () => {
    const verdict = compareCensusToBudget([row({ screens: 9 }, '768')], makeBudget({}, '768'));

    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.metric)).toEqual(['screens']);
  });
});

describe('compareCensusToBudget — widening against HEAD', () => {
  it('accepts a widening that carries a new raisedBy', () => {
    const previous = makeBudget();
    const widened = makeBudget({ screens: 3.9, raisedBy: 'MOB-02: pill a 44 px' });

    expect(compareCensusToBudget([row({ screens: 3.9 })], widened, previous).ok).toBe(true);
  });

  it('fails a widening without raisedBy, even when the measure fits it', () => {
    const verdict = compareCensusToBudget([row({ screens: 3.9 })], makeBudget({ screens: 3.9 }), makeBudget());

    expect(verdict.violations).toEqual([{ kind: 'widened-without-reason', surface: 'panoramica', viewport: '390', metric: 'screens' }]);
  });

  it('fails a widening that reuses the previous raise\'s reason', () => {
    const previous = makeBudget({ screens: 3.9, raisedBy: 'MOB-02: pill a 44 px' });
    const verdict = compareCensusToBudget([row({ screens: 4 })], makeBudget({ screens: 4, raisedBy: 'MOB-02: pill a 44 px' }), previous);

    expect(verdict.violations.map((v) => v.kind)).toEqual(['reason-reused']);
  });

  it('treats a lowered floor as a widening too', () => {
    const verdict = compareCensusToBudget([row({ tilesAboveFold: 0 })], makeBudget({ tilesAboveFold: 0 }), makeBudget());

    expect(verdict.violations.map((v) => [v.kind, v.metric])).toEqual([['widened-without-reason', 'tilesAboveFold']]);
  });

  it('needs nothing for a tightening', () => {
    expect(compareCensusToBudget([row({ screens: 3 })], makeBudget({ screens: 3 }), makeBudget()).ok).toBe(true);
  });
});

describe('compareCensusToBudget — the First-Screen Rule column', () => {
  it('reads «not yet» at 390 while there is no closed row, and names why', () => {
    const [target] = compareCensusToBudget([row()], makeBudget()).targets;

    expect(target.status).toBe('not-yet');
    expect(target.detail).toContain('nessuna riga chiusa');
  });

  it('reads «met» at 390 with five figures and the closed row above the pill', () => {
    const budget = makeBudget({ figuresOutsideVerdict: 5, firstClosedRowAbovePill: true });
    const [target] = compareCensusToBudget([row({ figuresOutsideVerdict: 5, firstClosedRowAbovePill: true })], budget).targets;

    expect(target.status).toBe('met');
  });

  it('prints «—» for a surface without verdict', () => {
    const budget = { ...makeBudget(), budget: { impostazioni: { '390': METRICS } } };
    const [target] = compareCensusToBudget([row({}, '390', 'impostazioni')], budget).targets;

    expect(target.status).toBe('none');
  });
});

describe('tightenBudget', () => {
  const run = (results: CensusRow[]): CensusRun => ({ email: 'census@example.com', at: '2026-10-11T09:00:00.000Z', results });

  it('writes the exact measure where it is better', () => {
    const next = tightenBudget(run([row({ screens: 3.5, tilesAboveFold: 2, figuresOutsideVerdict: 3 })]), makeBudget());

    expect(next.budget.panoramica['390']).toMatchObject({ screens: 3.5, tilesAboveFold: 2, figuresOutsideVerdict: 3 });
    expect(next.measuredAt).toBe('2026-10-11');
  });

  it('never widens: a worse measure leaves the budget as it was', () => {
    const budget = makeBudget();
    const next = tightenBudget(run([row({ screens: 5, tilesAboveFold: 0, figuresAboveFold: 30, overflowX: true })]), budget);

    expect(next.budget.panoramica['390']).toEqual(budget.budget.panoramica['390']);
    expect(next.measuredAt).toBe('2026-10-10');
  });

  it('registers a closed row as true, never as false', () => {
    expect(tightenBudget(run([row({ firstClosedRowAbovePill: true })]), makeBudget()).budget.panoramica['390']?.firstClosedRowAbovePill).toBe(true);
    expect(tightenBudget(run([row({ firstClosedRowAbovePill: false })]), makeBudget()).budget.panoramica['390']?.firstClosedRowAbovePill).toBe(null);
  });

  it('keeps the raisedBy of an entry', () => {
    const budget = makeBudget({ screens: 3.9, raisedBy: 'MOB-02: pill a 44 px' });

    expect(tightenBudget(run([row({ screens: 3.85 })]), budget).budget.panoramica['390']?.raisedBy).toBe('MOB-02: pill a 44 px');
  });

  it('creates the entry of a surface the budget does not have yet', () => {
    const next = tightenBudget(run([row({}, '390', 'storico')]), makeBudget());

    expect(next.budget.storico['390']).toEqual(METRICS);
  });
});

describe('tightenRefusal', () => {
  it('refuses a run that is not the census fixture\'s', () => {
    expect(tightenRefusal({ email: 'mirror@example.com', at: '', results: [row()] })).toContain('census@example.com');
  });

  it('refuses a run with a missing or unsettled surface, naming it', () => {
    const results: CensusRow[] = [row(), { surface: 'cashflow-divisione', viewport: '390', status: 'missing', metrics: null }];

    expect(tightenRefusal({ email: 'census@example.com', at: '', results })).toContain('cashflow-divisione@390 (missing)');
  });

  it('lets a clean census run through', () => {
    expect(tightenRefusal({ email: 'census@example.com', at: '', results: [row()] })).toBeNull();
  });
});
