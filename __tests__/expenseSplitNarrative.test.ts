import { describe, it, expect, vi } from 'vitest';

// chartService's it-IT formatters carry the Firebase chain with them — mocked exactly as
// __tests__/cashflowNarrative.test.ts does, so the module under test stays pure.
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
  buildSplitVerdict,
  describeBasisRemedy,
  describeCommonSpending,
  describeMemberBalance,
  describeMemberCalendar,
  describeMissingBasis,
  describeSalaryConsumed,
  describeSplitAside,
  describeSplitBasis,
} from '@/lib/utils/expenseSplitNarrative';
import type { ExpenseSplitSummary, MemberBalance, SplitBasis } from '@/lib/utils/expenseSplitSummary';
import { narrativeToText } from '@/lib/utils/narrative';
import type { Narrative } from '@/lib/utils/narrative';
import type { Period } from '@/lib/utils/period';

/**
 * it-IT puts a NO-BREAK SPACE before € and leaves four-digit amounts ungrouped, so expectations
 * are written the way the screen prints them and only the nbsp is flattened.
 */
const plain = (narrative: Narrative | null) =>
  narrative === null ? null : narrativeToText(narrative).replace(/ /g, ' ').replace(/ /g, ' ');

const AUGUST: Period = { kind: 'month', year: 2026, month: 8 };
const JULY: Period = { kind: 'month', year: 2026, month: 7 };
const NOW = new Date(2026, 7, 15, 12, 0, 0);

const NO_SCHEDULED = { expenses: 0, income: 0, count: 0, throughMonth: null };

/**
 * `remainingBooked` defaults to `remaining`, which is what a period with nothing in the calendar
 * looks like — the ordinary case. A fixture that wants the two apart says both out loud.
 */
function balance(overrides: Partial<MemberBalance> & { name: string }): MemberBalance {
  const { name, ...rest } = overrides;
  const merged: MemberBalance = {
    member: { id: `m-${name.toLowerCase()}`, name },
    salary: 0,
    share: null,
    commonShare: null,
    personalSpending: 0,
    remaining: null,
    remainingBooked: null,
    ...rest,
  };
  return rest.remainingBooked === undefined ? { ...merged, remainingBooked: merged.remaining } : merged;
}

const GIUSEPPE = balance({
  name: 'Giuseppe',
  salary: 2400,
  share: 0.6,
  commonShare: 600,
  personalSpending: 300,
  remaining: 1500,
});

const MARCELLA = balance({
  name: 'Marcella',
  salary: 1600,
  share: 0.4,
  commonShare: 400,
  personalSpending: 100,
  remaining: 1100,
});

const COMPUTED_BASIS: SplitBasis = {
  kind: 'computed',
  totalSalary: 4000,
  unattributedSalary: 0,
  members: [
    { member: GIUSEPPE.member, salary: 2400, share: 0.6 },
    { member: MARCELLA.member, salary: 1600, share: 0.4 },
  ],
};

function summary(overrides: Partial<ExpenseSplitSummary> = {}): ExpenseSplitSummary {
  return {
    basis: COMPUTED_BASIS,
    common: { total: 1000, rowCount: 12, scheduled: NO_SCHEDULED },
    members: [GIUSEPPE, MARCELLA],
    unassigned: { total: 0, rowCount: 0 },
    commonExpenses: [],
    ...overrides,
  };
}

describe('describeSplitBasis', () => {
  it('names the salary each share comes from', () => {
    expect(plain(describeSplitBasis(COMPUTED_BASIS))).toBe(
      'Le quote vengono dagli stipendi del periodo: Giuseppe 2400 € (60%) e Marcella 1600 € (40%).'
    );
  });

  // A percentage computed on part of the month's salaries must not be printed like one computed
  // on all of them: the spending side has always declared its orphans, the income side did not.
  it('declares the labor income the shares could not use', () => {
    expect(plain(describeSplitBasis({ ...COMPUTED_BASIS, unattributedSalary: 1100 }))).toBe(
      'Le quote vengono dagli stipendi del periodo: Giuseppe 2400 € (60%) e Marcella 1600 € (40%). ' +
        'Altri 1100 € di reddito da lavoro non sono intestati a nessuno e non entrano nelle quote.'
    );
  });
});

describe('describeMissingBasis', () => {
  it('names the person whose salary is missing, in the singular', () => {
    expect(
      plain(describeMissingBasis({ kind: 'unavailable', reason: 'missing-salary', missingNames: ['Marcella'], unattributedSalary: 0 }))
    ).toBe('In questo periodo non risulta lo stipendio di Marcella: finché manca, le quote non si calcolano.');
  });

  it('agrees in number with more than one', () => {
    expect(
      plain(
        describeMissingBasis({
          kind: 'unavailable',
          reason: 'missing-salary',
          missingNames: ['Giuseppe', 'Marcella'], unattributedSalary: 0 })
      )
    ).toBe('In questo periodo non risultano stipendi di Giuseppe e Marcella: finché mancano, le quote non si calcolano.');
  });

  // Labor income nobody is named on cannot earn a share. Declaring it is what stops a split
  // computed on part of the month's salaries from being printed like one computed on all of them.
  it('declares labor income that is attributed to nobody', () => {
    expect(
      plain(
        describeMissingBasis({ kind: 'unavailable', reason: 'missing-salary', missingNames: ['Marcella'], unattributedSalary: 1100 })
      )
    ).toContain('Altri 1100 € di reddito da lavoro non sono intestati a nessuno e non entrano nelle quote.');
  });
});

describe('describeBasisRemedy', () => {
  // The explanation belongs to the verdict; the instruction belongs to the tile that owns the
  // absence. Each branch must name the exact screen — the one a household actually hits
  // (`missing-salary`) named none until 2026-09-21.
  it('points at the screen that fixes each missing input', () => {
    expect(
      plain(describeBasisRemedy({ kind: 'unavailable', reason: 'not-enough-members', missingNames: [], unattributedSalary: 0 }))
    ).toContain('Famiglia');
    expect(
      plain(describeBasisRemedy({ kind: 'unavailable', reason: 'no-labor-categories', missingNames: [], unattributedSalary: 0 }))
    ).toContain('Cashflow');
    expect(
      plain(describeBasisRemedy({ kind: 'unavailable', reason: 'missing-salary', missingNames: ['Marcella'], unattributedSalary: 0 }))
    ).toBe('Registra lo stipendio di Marcella in Tracciamento e intestaglielo.');
  });

  it('agrees in number with more than one missing salary', () => {
    expect(
      plain(
        describeBasisRemedy({
          kind: 'unavailable',
          reason: 'missing-salary',
          missingNames: ['Giuseppe', 'Marcella'],
          unattributedSalary: 0,
        })
      )
    ).toBe('Registra gli stipendi di Giuseppe e Marcella in Tracciamento e intestali a chi li ha ricevuti.');
  });

  // The Quota tile must not reprint the verdict's own sentence: on a month with no shares the two
  // were the same 18 words, 180px apart (DESIGN.md → The One-Tile-One-Question Rule).
  it('is what the tile reads, and it is not the verdict sentence', () => {
    const basis: Extract<SplitBasis, { kind: 'unavailable' }> = {
      kind: 'unavailable',
      reason: 'missing-salary',
      missingNames: ['Marcella'],
      unattributedSalary: 0,
    };
    expect(plain(describeSplitBasis(basis))).toBe(plain(describeBasisRemedy(basis)));
    expect(plain(describeSplitBasis(basis))).not.toBe(plain(describeMissingBasis(basis)));
  });
});

describe('buildSplitVerdict', () => {
  it('states the pool, each share and what is left, in the present for a running month', () => {
    const verdict = buildSplitVerdict({ summary: summary(), period: AUGUST, now: NOW });

    expect(verdict.headline).toBe('Ad agosto resta qualcosa a tutti.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'Ad agosto le spese in comune sono 1000 €: 600 € a Giuseppe (60%) e 400 € a Marcella (40%). ' +
        'A Giuseppe restano 1500 € dei 2400 € di stipendio; a Marcella restano 1100 € dei 1600 €.'
    );
  });

  it('conjugates in the past for a closed month', () => {
    const verdict = buildSplitVerdict({ summary: summary(), period: JULY, now: NOW });

    expect(verdict.headline).toBe('A luglio è restato qualcosa a tutti.');
    expect(plain(verdict.sentence)).toContain('le spese in comune sono state 1000 €');
  });

  // The tone is the page's only claim about whether the month went well.
  it('turns negative and names who is short', () => {
    const short = balance({ ...MARCELLA, name: 'Marcella', remaining: -220, remainingBooked: -220 });
    const verdict = buildSplitVerdict({
      summary: summary({ members: [GIUSEPPE, short] }),
      period: AUGUST,
      now: NOW,
    });

    expect(verdict.headline).toBe('Ad agosto lo stipendio di Marcella non basta.');
    expect(verdict.tone).toBe('negative');
    expect(plain(verdict.sentence)).toContain('a Marcella mancano 220 €');
  });

  it('says so when nobody makes it', () => {
    const verdict = buildSplitVerdict({
      summary: summary({
        members: [balance({ ...GIUSEPPE, name: 'Giuseppe', remaining: -50, remainingBooked: -50 }), balance({ ...MARCELLA, name: 'Marcella', remaining: -220, remainingBooked: -220 })],
      }),
      period: AUGUST,
      now: NOW,
    });

    expect(verdict.headline).toBe('Ad agosto lo stipendio non basta a nessuno.');
  });

  // A verdict that invented 50/50 here would be putting an agreement in the couple's mouth.
  it('never guesses a share: it states the pool and names the missing input', () => {
    const verdict = buildSplitVerdict({
      summary: summary({
        basis: { kind: 'unavailable', reason: 'missing-salary', missingNames: ['Marcella'], unattributedSalary: 0 },
        members: [balance({ name: 'Giuseppe', personalSpending: 300 }), balance({ name: 'Marcella' })],
      }),
      period: AUGUST,
      now: NOW,
    });

    expect(verdict.headline).toBe('Ad agosto le quote non si possono calcolare.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe(
      'Ad agosto le spese in comune sono 1000 €. In questo periodo non risulta lo stipendio di Marcella: ' +
        'finché manca, le quote non si calcolano.'
    );
    expect(plain(verdict.sentence)).not.toContain('%');
  });

  // The same clause Tracciamento and Analisi close on, for the same reason: the amount is INSIDE
  // the total just printed, not beside it.
  it('closes on the scheduled part of the pool, as a decomposition', () => {
    const verdict = buildSplitVerdict({
      summary: summary({ common: { total: 1000, rowCount: 12, scheduled: { expenses: 300, income: 0, count: 1, throughMonth: null } } }),
      period: AUGUST,
      now: NOW,
    });

    expect(plain(verdict.sentence)).toContain('Nel totale ci sono ancora 300 € di spese già in calendario');
  });

  // An empty period is not a period whose shares failed. The headline used to say «le quote non
  // si possono calcolare» over a sentence saying there was nothing to divide: two explanations of
  // one screen, the first of them sending the reader to look for data to fix.
  it('says there is nothing to divide rather than printing zeros, and the headline agrees', () => {
    const verdict = buildSplitVerdict({
      summary: summary({
        common: { total: 0, rowCount: 0, scheduled: NO_SCHEDULED },
        members: [balance({ name: 'Giuseppe' }), balance({ name: 'Marcella' })],
      }),
      period: AUGUST,
      now: NOW,
    });

    expect(verdict.headline).toBe("Ad agosto non c'è niente da dividere.");
    expect(plain(verdict.sentence)).toBe('Ad agosto non risulta nessuna spesa, né in comune né personale.');
  });

  it('keeps the empty headline even when the basis could not be computed either', () => {
    const verdict = buildSplitVerdict({
      summary: summary({
        basis: { kind: 'unavailable', reason: 'missing-salary', missingNames: ['Marcella'], unattributedSalary: 0 },
        common: { total: 0, rowCount: 0, scheduled: NO_SCHEDULED },
        members: [balance({ name: 'Giuseppe' }), balance({ name: 'Marcella' })],
      }),
      period: AUGUST,
      now: NOW,
    });

    expect(verdict.headline).toBe("Ad agosto non c'è niente da dividere.");
  });

  // THE POINT OF `remainingBooked`. A deficit made entirely of bills that have not been paid is
  // not a deficit: the page said «mancano 83 €» over money still in the account.
  it('judges on what has happened, then says where the calendar takes it', () => {
    const giuseppe = balance({ ...GIUSEPPE, name: 'Giuseppe', remaining: 1173, remainingBooked: 1300 });
    const tarsio = balance({
      name: 'Tarsio',
      salary: 1700,
      share: 0.4,
      commonShare: 803,
      personalSpending: 980,
      remaining: -83,
      remainingBooked: 0,
    });
    const verdict = buildSplitVerdict({
      summary: summary({
        members: [giuseppe, tarsio],
        common: { total: 2030, rowCount: 8, scheduled: { expenses: 210, income: 0, count: 1, throughMonth: null } },
      }),
      period: AUGUST,
      now: NOW,
    });

    // Nobody is short TODAY, so the month is not called short.
    expect(verdict.headline).toBe('Ad agosto resta qualcosa a tutti.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toContain('A Giuseppe restano 1300 € dei 2400 € di stipendio; a Tarsio restano 0 € dei 1700 €.');
    expect(plain(verdict.sentence)).toContain('Con quelle, a fine periodo a Giuseppe restano 1173 € e a Tarsio mancano 83 €.');
  });

  it('adds no calendar clause when nothing is scheduled', () => {
    const verdict = buildSplitVerdict({ summary: summary(), period: AUGUST, now: NOW });
    expect(plain(verdict.sentence)).not.toContain('a fine periodo');
  });
});

describe('describeMemberBalance', () => {
  // The sentence the whole page exists for.
  it('reads the two costs and what is left of the salary', () => {
    expect(plain(describeMemberBalance(GIUSEPPE))).toBe(
      '600 € di spese in comune (il 60%), 300 € di spese personali: dai 2400 € di stipendio restano 1500 €.'
    );
  });

  it('says «mancano» when the salary did not cover it', () => {
    expect(plain(describeMemberBalance(balance({ ...MARCELLA, name: 'Marcella', remaining: -220, remainingBooked: -220 })))).toContain(
      'dai 1600 € di stipendio mancano 220 €.'
    );
  });

  it('keeps the known half and admits the rest is unknown without a basis', () => {
    expect(plain(describeMemberBalance(balance({ name: 'Marcella', personalSpending: 120 })))).toBe(
      'Spese personali 120 €. Senza le quote non si sa quanto resta.'
    );
  });

  it('reads the BOOKED residual, not the period one', () => {
    const tarsio = balance({
      name: 'Tarsio',
      salary: 1700,
      share: 0.4,
      commonShare: 803,
      personalSpending: 980,
      remaining: -83,
      remainingBooked: 0,
    });
    expect(plain(describeMemberBalance(tarsio))).toContain('dai 1700 € di stipendio restano 0 €.');
    expect(plain(describeMemberBalance(tarsio))).not.toContain('mancano');
  });
});

describe('describeMemberCalendar', () => {
  it('says where the rows still in the calendar take the residual', () => {
    expect(
      plain(describeMemberCalendar(balance({ name: 'Tarsio', remaining: -83, remainingBooked: 0 })))
    ).toBe('Con le spese ancora in calendario mancano 83 €.');
  });

  it('is absent when the two residuals coincide', () => {
    expect(describeMemberCalendar(GIUSEPPE)).toBeNull();
  });

  it('is absent without a basis, where there is no residual at all', () => {
    expect(describeMemberCalendar(balance({ name: 'Marcella', personalSpending: 120 }))).toBeNull();
  });
});

describe('describeCommonSpending', () => {
  it('counts the common rows', () => {
    expect(plain(describeCommonSpending(summary()))).toBe('12 voci in comune.');
  });

  it('agrees in number on a single row', () => {
    expect(
      plain(describeCommonSpending(summary({ common: { total: 40, rowCount: 1, scheduled: NO_SCHEDULED } })))
    ).toBe('1 voce in comune.');
  });

  // Those euros are in neither the pool nor anyone's column: the reading is what keeps them from
  // simply going missing.
  it('declares the rows whose owner no longer exists', () => {
    expect(plain(describeCommonSpending(summary({ unassigned: { total: 250, rowCount: 3 } })))).toBe(
      '12 voci in comune; altre 3 per 250 € sono di qualcuno che non è più in Famiglia, e restano fuori dalla divisione.'
    );
  });
});

describe('describeSalaryConsumed', () => {
  it('measures both costs against the salary, article following the printed figure', () => {
    // (600 + 300) / 2400 = 37,5% → prints 38%, which takes «il».
    expect(plain(describeSalaryConsumed(GIUSEPPE))).toBe('Se ne va il 38% dello stipendio.');
  });

  it('is absent without a salary to measure against', () => {
    expect(describeSalaryConsumed(balance({ name: 'Marcella', commonShare: 400 }))).toBeNull();
  });
});

describe('describeSplitAside', () => {
  it('shows the split at a glance', () => {
    expect(plain(describeSplitAside(summary()))).toBe('60% · 40%');
  });

  it('is absent when there is no split to show', () => {
    expect(
      describeSplitAside(summary({ basis: { kind: 'unavailable', reason: 'missing-salary', missingNames: ['x'], unattributedSalary: 0 } }))
    ).toBeNull();
  });
});
