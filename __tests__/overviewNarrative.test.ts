/**
 * Tests for lib/utils/overviewNarrative.ts — the pure layer behind the Panoramica's
 * verdict headline and the one-line readings under each tile. No React, no Firebase:
 * the module only needs chartService's it-IT percentage formatter, whose Firebase chain
 * is mocked away exactly like __tests__/dashboardOverviewUtils.test.ts does.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  buildOverviewVerdict,
  describeCashflow,
  describeComposition,
  describeCosts,
  describeGoal,
  describeLiquidity,
  narrativeToText,
  projectMonthEndSpending,
  type Narrative,
  type OverviewVerdictInput,
} from '@/lib/utils/overviewNarrative';

// Intl 'it-IT' separates the amount from "€" with a no-break space and leaves four-digit
// amounts ungrouped (CLDR minimumGroupingDigits = 2, see AGENTS.md → Italian Localization):
// expectations below are written the way the screen really prints them, with the nbsp
// flattened to a plain space for readability.
const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');

const AUGUST: OverviewVerdictInput = {
  month: 8,
  totalValue: 412380.52,
  monthlyVariation: { value: 4120.18, percentage: 1.01 },
  yearlyVariation: { value: 31560, percentage: 8.29 },
  isNewATH: true,
  savingsRate: 40,
  marketEffect: 3980,
  topMover: { assetClass: 'equity', delta: 3480 },
};

describe('buildOverviewVerdict — headline and tone', () => {
  it('should call a growing month with healthy savings a good month', () => {
    const verdict = buildOverviewVerdict(AUGUST);
    expect(verdict.headline).toBe('Agosto sta andando bene.');
    expect(verdict.tone).toBe('positive');
  });

  it('should warn when the net worth grows but spending exceeds income', () => {
    const verdict = buildOverviewVerdict({ ...AUGUST, savingsRate: -12 });
    expect(verdict.headline).toBe('Agosto cresce, ma le spese superano le entrate.');
    expect(verdict.tone).toBe('warning');
  });

  it('should blame the market for a falling month when the market effect is negative', () => {
    const verdict = buildOverviewVerdict({
      ...AUGUST,
      monthlyVariation: { value: -2100, percentage: -0.5 },
      marketEffect: -2600,
      topMover: { assetClass: 'equity', delta: -2400 },
    });
    expect(verdict.headline).toBe('Agosto è in calo: il mercato ha pesato.');
    expect(verdict.tone).toBe('negative');
  });

  it('should NOT blame the market when the net worth fell while the market gained', () => {
    // Flows (spending, withdrawals) explain the drop — saying "il mercato" would be a lie.
    const verdict = buildOverviewVerdict({
      ...AUGUST,
      monthlyVariation: { value: -2100, percentage: -0.5 },
      marketEffect: 900,
      topMover: { assetClass: 'equity', delta: 900 },
    });
    expect(verdict.headline).toBe('Agosto è in calo, nonostante il mercato.');
    expect(verdict.tone).toBe('warning');
  });

  it('should stay neutral and factual without a prior snapshot to compare against', () => {
    const verdict = buildOverviewVerdict({
      ...AUGUST,
      monthlyVariation: null,
      yearlyVariation: null,
      isNewATH: false,
      marketEffect: null,
      topMover: null,
    });
    expect(verdict.headline).toBe('Il tuo patrimonio ad agosto.');
    expect(verdict.tone).toBe('neutral');
  });

  it('should use the apostrophe form for vowel months', () => {
    expect(buildOverviewVerdict({ ...AUGUST, month: 10 }).headline).toBe('Ottobre sta andando bene.');
    expect(
      buildOverviewVerdict({ ...AUGUST, month: 4, monthlyVariation: null, marketEffect: null, topMover: null })
        .headline,
    ).toBe('Il tuo patrimonio ad aprile.');
    expect(
      buildOverviewVerdict({ ...AUGUST, month: 5, monthlyVariation: null, marketEffect: null, topMover: null })
        .headline,
    ).toBe('Il tuo patrimonio a maggio.');
  });
});

describe('buildOverviewVerdict — sentence', () => {
  it('should state value, monthly and yearly change, the record, savings and the market driver', () => {
    const text = plain(buildOverviewVerdict(AUGUST).sentence);
    expect(text).toBe(
      'Il patrimonio vale 412.380,52 €: +4120,18 € (+1,01%) su luglio, +8,29% da inizio anno, nuovo massimo storico. ' +
        'Hai messo da parte il 40% delle entrate e le azioni hanno fatto il grosso del lavoro (+3480 €).',
    );
  });

  it('should mark figures as mono with their sign so the UI can colour them', () => {
    const segments = buildOverviewVerdict(AUGUST).sentence;
    const monthly = segments.find((s) => s.text.startsWith('+4120,18'));
    expect(monthly).toMatchObject({ mono: true, sign: 'positive' });
    const value = segments.find((s) => s.text.startsWith('412.380,52'));
    expect(value).toMatchObject({ mono: true });
    expect(value?.sign).toBeUndefined();
  });

  it('should say a class weighed on the month when its market effect is negative', () => {
    const text = plain(
      buildOverviewVerdict({
        ...AUGUST,
        monthlyVariation: { value: -2100, percentage: -0.5 },
        marketEffect: -2600,
        topMover: { assetClass: 'crypto', delta: -2400 },
      }).sentence,
    );
    expect(text).toContain('−2100,00 € (−0,50%) su luglio');
    expect(text).toContain('le criptovalute hanno pesato (−2400 €)');
  });

  it('should conjugate singular classes', () => {
    const text = plain(
      buildOverviewVerdict({ ...AUGUST, topMover: { assetClass: 'trendFollowing', delta: 800 } }).sentence,
    );
    expect(text).toContain('il trend following ha fatto il grosso del lavoro (+800 €)');
  });

  it('should drop the record and the driver when they do not apply, and roll December back to the previous year', () => {
    const text = plain(
      buildOverviewVerdict({
        ...AUGUST,
        month: 1,
        isNewATH: false,
        marketEffect: null,
        topMover: null,
      }).sentence,
    );
    expect(text).toBe(
      'Il patrimonio vale 412.380,52 €: +4120,18 € (+1,01%) su dicembre, +8,29% da inizio anno. ' +
        'Hai messo da parte il 40% delle entrate.',
    );
  });

  it('should capitalise the driver when there is no savings clause before it', () => {
    const text = plain(buildOverviewVerdict({ ...AUGUST, savingsRate: null }).sentence);
    expect(text).toContain('. Le azioni hanno fatto il grosso del lavoro (+3480 €).');
  });
});

describe('tile readings', () => {
  it('describeLiquidity should state the liquid share and amount', () => {
    expect(plain(describeLiquidity(38200, 262180, 412380.52)!)).toBe(
      'Il 72,8% è liquidabile: 300.380 €.',
    );
    expect(describeLiquidity(0, 0, 0)).toBeNull();
  });

  it('describeCashflow should read savings and the expense trend against the previous month', () => {
    expect(plain(describeCashflow(40, -6.4, 8)!)).toBe(
      'Messo da parte il 40%; spese in calo del 6,4% su luglio.',
    );
    expect(plain(describeCashflow(12.4, 3, 8)!)).toBe(
      'Messo da parte il 12%; spese in aumento del 3,0% su luglio.',
    );
    expect(plain(describeCashflow(-8, 0, 8)!)).toBe('Speso più di quanto è entrato.');
    expect(describeCashflow(null, 0, 8)).toBeNull();
  });

  it('describeComposition should name the dominant class and the smallest one', () => {
    const classes = [
      { assetClass: 'equity', percentage: 52.4 },
      { assetClass: 'bonds', percentage: 18.1 },
      { assetClass: 'crypto', percentage: 2.7 },
    ];
    expect(plain(describeComposition(classes)!)).toBe(
      'Più della metà in azioni; criptovalute al 2,7%.',
    );
    expect(
      narrativeToText(
        describeComposition([
          { assetClass: 'bonds', percentage: 45 },
          { assetClass: 'equity', percentage: 40 },
          { assetClass: 'cash', percentage: 15 },
        ])!,
      ),
    ).toBe('Obbligazioni al 45,0%; liquidità al 15,0%.');
    expect(describeComposition([])).toBeNull();
    expect(plain(describeComposition([{ assetClass: 'equity', percentage: 100 }])!)).toBe(
      'Tutto in azioni.',
    );
  });

  it('describeComposition should articulate the preposition on the figure AS PRINTED', () => {
    // Found at the browser collaudo of 2026-08-30: a hard-coded «al » printed «carry al 0,1%».
    // A class rounding to zero takes «allo», a vowel-initial number name takes «all'».
    expect(
      plain(
        describeComposition([
          { assetClass: 'equity', percentage: 45 },
          { assetClass: 'carry', percentage: 0.06 },
        ])!,
      ),
    ).toBe("Azioni al 45,0%; carry allo 0,1%.");
    expect(
      plain(
        describeComposition([
          { assetClass: 'bonds', percentage: 8.5 },
          { assetClass: 'trendFollowing', percentage: 11.2 },
        ])!,
      ),
    ).toBe("Trend following all'11,2%; obbligazioni all'8,5%.");
  });

  it('describeCosts should convert the annual cost into a monthly weight and a share of the portfolio', () => {
    expect(plain(describeCosts(1034, 412380.52)!)).toBe('Pesa 86 € al mese, lo 0,25% del patrimonio.');
    expect(plain(describeCosts(1034, 0)!)).toBe('Pesa 86 € al mese.');
    expect(describeCosts(0, 412380.52)).toBeNull();
  });

  it('describeGoal should state what is still missing', () => {
    expect(plain(describeGoal(38000, 100000)!)).toBe('Mancano 62.000 €.');
    expect(plain(describeGoal(100000, 100000)!)).toBe('Obiettivo raggiunto.');
  });
});

describe('projectMonthEndSpending', () => {
  it('should extrapolate the spending so far linearly to the end of the month', () => {
    expect(projectMonthEndSpending(4372, 22, 31)).toBeCloseTo(6160.55, 1);
  });

  it('should equal the spending so far on the last day of the month', () => {
    expect(projectMonthEndSpending(4372, 31, 31)).toBe(4372);
  });

  it('should return null when the month has not started or the calendar is malformed', () => {
    expect(projectMonthEndSpending(100, 0, 31)).toBeNull();
    expect(projectMonthEndSpending(100, 5, 0)).toBeNull();
  });
});
