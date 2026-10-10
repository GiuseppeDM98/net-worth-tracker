/**
 * Tests for lib/utils/mortgageSummary.ts — Patrimonio's «Mutuo» tile: the interest and principal
 * of the instalments SETTLED in the year, the interest since the link, the next instalment split
 * on today's debt, and the end of the French amortisation.
 *
 * Reference: 66.127,09 € at 0,7% with an instalment of 557,30 € → 38,57 € of interest and
 * 518,73 € of principal in the first month, the figures of the owner's bank plan (2026-09-25).
 */

import { describe, expect, it } from 'vitest';

import { interestPaidOf, isSettled, projectPayoff, summarizeMortgage, type MortgageRow } from '@/lib/utils/mortgageSummary';

const NOW = new Date(2026, 9, 5, 12);
const HOME = { id: 'mutuo-casa', name: 'Mutuo Casa', debt: 65_608.36, debtInterestRate: 0.7, financedAssetName: 'Casa' };

const settled = (id: string, date: Date, principal: number, interest?: number): MortgageRow => ({
  id,
  date,
  amount: -557.3,
  debtPrincipalRepaid: principal,
  debtInterestPaid: interest,
});
const pending = (id: string, date: Date): MortgageRow => ({ id, date, amount: -557.3, balancePending: true });

describe('isSettled and interestPaidOf', () => {
  it('should read a row as settled only once it stored what it repaid', () => {
    expect(isSettled({ debtPrincipalRepaid: 518.73 })).toBe(true);
    expect(isSettled({ balancePending: true })).toBe(false);
    expect(isSettled({})).toBe(false);
  });

  it('should take the stored interest, and fall back to instalment − principal on an older row', () => {
    expect(interestPaidOf({ amount: -557.3, debtPrincipalRepaid: 518.73, debtInterestPaid: 38.57 })).toBe(38.57);
    expect(interestPaidOf({ amount: -557.3, debtPrincipalRepaid: 518.73 })).toBe(38.57);
  });
});

describe('summarizeMortgage', () => {
  it('should name the loan, the property it finances and its kind', () => {
    const mortgage = summarizeMortgage(HOME, [settled('a', new Date(2026, 8, 28, 12), 518.73, 38.57)], NOW);
    expect(mortgage).toMatchObject({ loanId: 'mutuo-casa', loanName: 'Mutuo Casa', propertyName: 'Casa', kind: 'mortgage' });
    const personal = summarizeMortgage({ ...HOME, id: 'auto', name: 'Prestito auto', financedAssetName: null }, [], NOW);
    expect(personal).toMatchObject({ loanId: 'auto', loanName: 'Prestito auto', propertyName: null, kind: 'loan' });
  });

  it('should keep a payoff out of the rhythm the end is projected on', () => {
    // A 4.000 € early repayment settled in September is principal in the year's figures, but the
    // plan still runs on the 557,30 € instalment, not on the one-off.
    const rows: MortgageRow[] = [
      settled('a', new Date(2026, 7, 28, 12), 518.73, 38.57),
      { ...settled('payoff', new Date(2026, 8, 15, 12), 4000, 0), amount: -4000, isDebtPayoff: true },
      pending('b', new Date(2026, 9, 28, 12)),
    ];
    const mortgage = summarizeMortgage(HOME, rows, NOW);
    expect(mortgage.yearPrincipal).toBe(4518.73);
    expect(mortgage.next?.amount).toBe(557.3);
    expect(mortgage.payoff?.kind).toBe('date');
    const withoutPayoff = summarizeMortgage(HOME, [rows[0], rows[2]], NOW);
    expect(mortgage.payoff).toEqual(withoutPayoff.payoff);
  });

  it('should sum the year\'s settled instalments and split the next one on today\'s debt', () => {
    const summary = summarizeMortgage(HOME, [settled('sep', new Date(2026, 8, 28, 12), 518.73, 38.57), pending('oct', new Date(2026, 9, 28, 12))], NOW);
    expect(summary).toMatchObject({ year: 2026, yearInterest: 38.57, yearPrincipal: 518.73, yearInstalments: 1, totalInterest: 38.57, debt: 65_608.36 });
    expect(summary.trackedSince).toEqual(new Date(2026, 8, 28, 12));
    // 65.608,36 × 0,7% / 12 = 38,27 → 519,03 of principal.
    expect(summary.next).toMatchObject({ amount: 557.3, interest: 38.27, principal: 519.03 });
  });

  it('should keep last year\'s interest out of the year and in the total', () => {
    const summary = summarizeMortgage(HOME, [settled('dec', new Date(2025, 11, 28, 12), 510, 47.3), settled('sep', new Date(2026, 8, 28, 12), 518.73, 38.57)], NOW);
    expect(summary.yearInterest).toBe(38.57);
    expect(summary.totalInterest).toBe(85.87);
    expect(summary.trackedSince).toEqual(new Date(2025, 11, 28, 12));
  });

  it('should list every measured year, newest first, the first one partial from the link', () => {
    const summary = summarizeMortgage(
      HOME,
      [
        settled('sep', new Date(2026, 8, 28, 12), 518.73, 38.57),
        settled('oct', new Date(2026, 9, 28, 12), 519.03, 38.27),
        settled('jan', new Date(2027, 0, 28, 12), 520.9, 36.4),
      ],
      new Date(2027, 1, 5, 12)
    );
    expect(summary.byYear).toEqual([
      { year: 2027, interest: 36.4, principal: 520.9, instalments: 1, partialFrom: null },
      { year: 2026, interest: 76.84, principal: 1037.76, instalments: 2, partialFrom: new Date(2026, 8, 28, 12) },
    ]);
  });

  it('should not call a first year partial when it starts in January', () => {
    const summary = summarizeMortgage(HOME, [settled('jan', new Date(2026, 0, 28, 12), 500, 40)], NOW);
    expect(summary.byYear[0].partialFrom).toBeNull();
  });

  it('should have nothing for the year before the first settled instalment, and still project', () => {
    const summary = summarizeMortgage(HOME, [pending('oct', new Date(2026, 9, 28, 12))], NOW);
    expect(summary).toMatchObject({ yearInstalments: 0, yearInterest: 0, totalInterest: 0, trackedSince: null });
    expect(summary.payoff?.kind).toBe('date');
  });

  it('should project on the last paid instalment once none is linked ahead', () => {
    const summary = summarizeMortgage(HOME, [settled('dec', new Date(2026, 11, 28, 12), 519.9, 37.4)], new Date(2027, 0, 5, 12));
    expect(summary.next).toBeNull();
    expect(summary.payoff).toMatchObject({ kind: 'date' });
    // The first instalment still to pay is the month after the last one.
    if (summary.payoff?.kind === 'date') expect(summary.payoff.date.getFullYear()).toBeGreaterThanOrEqual(2027);
  });
});

describe('projectPayoff — the French amortisation', () => {
  it('should find the months that repay the debt, the last one partial', () => {
    // 66.127,09 € at 0,7% repaid by 557,30 € a month: n = −ln(1 − D·r/P) / ln(1 + r) = 122,998 → 123
    // instalments, the first on 28/09/2026 and the last 122 months later.
    const payoff = projectPayoff(66_127.09, 557.3, 0.7, new Date(2026, 8, 28, 12));
    expect(payoff).toEqual({ kind: 'date', months: 123, date: new Date(2036, 10, 28, 12) });
  });

  it('should land on an exact plan without an extra month', () => {
    // 1200 € at 0% repaid by 100 € a month: exactly 12 instalments, the last in 11 months' time.
    expect(projectPayoff(1200, 100, 0, new Date(2026, 0, 31, 12))).toEqual({ kind: 'date', months: 12, date: new Date(2026, 11, 31, 12) });
  });

  it('should clamp the day to a shorter month', () => {
    const payoff = projectPayoff(200, 100, 0, new Date(2026, 0, 31, 12));
    expect(payoff).toEqual({ kind: 'date', months: 2, date: new Date(2026, 1, 28, 12) });
  });

  it('should say never when the instalment does not cover the interest, and repaid on no debt', () => {
    expect(projectPayoff(200_000, 500, 3.6, new Date(2026, 0, 1))).toEqual({ kind: 'never' });
    expect(projectPayoff(0, 500, 3.6, new Date(2026, 0, 1))).toEqual({ kind: 'repaid' });
  });
});
