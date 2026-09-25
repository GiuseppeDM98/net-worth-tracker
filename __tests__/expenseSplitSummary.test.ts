import { describe, it, expect } from 'vitest';
import {
  allocateByShare,
  resolveSplitBasis,
  summarizeExpenseSplit,
  type MemberShare,
} from '@/lib/utils/expenseSplitSummary';
import type { Expense, ExpenseType } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';

const GIUSEPPE: FamilyMember = { id: 'm-giuseppe', name: 'Giuseppe' };
const MARCELLA: FamilyMember = { id: 'm-marcella', name: 'Marcella' };
const MEMBERS = [GIUSEPPE, MARCELLA];
const SALARY_CATEGORIES = ['cat-stipendio'];

// Noon on purpose is NOT enough here: the scheduled split is a calendar-DAY rule, so the
// fixtures below sit whole days either side of `NOW`.
const NOW = new Date(2026, 7, 15, 12, 0, 0);

let sequence = 0;

function makeRow(
  type: ExpenseType,
  amount: number,
  overrides: Partial<Expense> = {}
): Expense {
  sequence += 1;
  return {
    id: `row-${sequence}`,
    userId: 'u1',
    type,
    categoryId: type === 'income' ? 'cat-stipendio' : 'cat-casa',
    categoryName: type === 'income' ? 'Stipendio' : 'Casa',
    // Sign convention: income positive, spending negative.
    amount: type === 'income' ? Math.abs(amount) : -Math.abs(amount),
    currency: 'EUR',
    date: new Date(2026, 7, 10, 12, 0, 0),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const salary = (member: FamilyMember, amount: number, overrides: Partial<Expense> = {}) =>
  makeRow('income', amount, { personalMemberId: member.id, ...overrides });

describe('resolveSplitBasis', () => {
  it('derives each share from the labor income attributed to that person', () => {
    const basis = resolveSplitBasis(
      [salary(GIUSEPPE, 2400), salary(MARCELLA, 1600)],
      MEMBERS,
      SALARY_CATEGORIES
    );

    expect(basis.kind).toBe('computed');
    if (basis.kind !== 'computed') return;
    expect(basis.totalSalary).toBe(4000);
    expect(basis.members.map((entry) => entry.share)).toEqual([0.6, 0.4]);
  });

  it('sums several salary rows for the same person', () => {
    const basis = resolveSplitBasis(
      [salary(GIUSEPPE, 1200), salary(GIUSEPPE, 1200), salary(MARCELLA, 1600)],
      MEMBERS,
      SALARY_CATEGORIES
    );

    if (basis.kind !== 'computed') throw new Error('expected a computed basis');
    expect(basis.members[0].salary).toBe(2400);
  });

  // The share is what the household agreed to divide on, and it agreed on salaries.
  it('ignores attributed income that is not a labor category', () => {
    const refund = salary(MARCELLA, 900, { categoryId: 'cat-rimborsi', categoryName: 'Rimborsi' });
    const basis = resolveSplitBasis(
      [salary(GIUSEPPE, 2400), salary(MARCELLA, 1600), refund],
      MEMBERS,
      SALARY_CATEGORIES
    );

    if (basis.kind !== 'computed') throw new Error('expected a computed basis');
    expect(basis.members[1].salary).toBe(1600);
  });

  it('ignores a salary row nobody is attributed to', () => {
    const basis = resolveSplitBasis(
      [salary(GIUSEPPE, 2400), salary(MARCELLA, 1600), makeRow('income', 5000)],
      MEMBERS,
      SALARY_CATEGORIES
    );

    if (basis.kind !== 'computed') throw new Error('expected a computed basis');
    expect(basis.totalSalary).toBe(4000);
  });

  // The bug this prevents is the loud one: without the guard, the person who HAS recorded a
  // salary silently carries 100% of the household's spending.
  it('refuses to compute when one person has no salary yet, and names them', () => {
    const basis = resolveSplitBasis([salary(GIUSEPPE, 2400)], MEMBERS, SALARY_CATEGORIES);

    expect(basis).toEqual({
      kind: 'unavailable',
      reason: 'missing-salary',
      missingNames: ['Marcella'],
      unattributedSalary: 0,
    });
  });

  // The income side used to swallow these two rows behind a mute `continue`, so a split computed
  // on part of the month's salaries was indistinguishable from one computed on all of them.
  it('counts labor income nobody owns as unattributed, and never as somebody else s share', () => {
    const basis = resolveSplitBasis(
      [
        salary(GIUSEPPE, 2400),
        salary(MARCELLA, 1600),
        // Left «in comune» by mistake, and one belonging to a member since deleted.
        makeRow('income', 1100),
        makeRow('income', 500, { personalMemberId: 'm-deleted' }),
      ],
      MEMBERS,
      SALARY_CATEGORIES
    );

    expect(basis.kind).toBe('computed');
    if (basis.kind !== 'computed') return;
    expect(basis.unattributedSalary).toBe(1600);
    // The shares are still the two real salaries' — the orphan money buys nobody a percentage.
    expect(basis.totalSalary).toBe(4000);
    expect(basis.members.map((entry) => entry.share)).toEqual([0.6, 0.4]);
  });

  it('counts no unattributed salary outside the labor categories', () => {
    const basis = resolveSplitBasis(
      [salary(GIUSEPPE, 2400), salary(MARCELLA, 1600), makeRow('income', 300, { categoryId: 'cat-rimborso' })],
      MEMBERS,
      SALARY_CATEGORIES
    );

    expect(basis.kind === 'computed' && basis.unattributedSalary).toBe(0);
  });

  it('refuses with fewer than two people, and before any labor category is chosen', () => {
    expect(resolveSplitBasis([], [GIUSEPPE], SALARY_CATEGORIES).kind).toBe('unavailable');
    expect(resolveSplitBasis([], [GIUSEPPE], SALARY_CATEGORIES)).toMatchObject({
      reason: 'not-enough-members',
    });
    expect(resolveSplitBasis([salary(GIUSEPPE, 100)], MEMBERS, [])).toMatchObject({
      reason: 'no-labor-categories',
    });
  });
});

describe('allocateByShare', () => {
  const member = (id: string, share: number): MemberShare => ({
    member: { id, name: id.toUpperCase() },
    salary: share * 1000,
    share,
  });

  const sum = (allocated: Map<string, number>) =>
    Math.round([...allocated.values()].reduce((total, value) => total + value, 0) * 100) / 100;

  // These fixtures are NOT arbitrary. With two shares the two roundings always cancel, so a
  // two-person case can never exercise the correction — an earlier version of this test used
  // 2/3 + 1/3 of 100 and stayed green with the whole residual branch disabled. Three shares is
  // where the cent actually goes missing, which is also the case the module claims to support.
  const THIRDS = [member('a', 1 / 3), member('b', 1 / 3), member('c', 1 / 3)];
  const FIFTY_THIRTY_TWENTY = [member('a', 0.5), member('b', 0.3), member('c', 0.2)];

  it('splits an amount whose parts do not sum back on their own', () => {
    expect(sum(allocateByShare(100, THIRDS))).toBe(100);
    expect(sum(allocateByShare(100.03, FIFTY_THIRTY_TWENTY))).toBe(100.03);
  });

  it('charges the rounding residual to the largest share', () => {
    // 100.03 rounds to 50.02 + 30.01 + 20.01 = 100.04, one cent too many.
    const allocated = allocateByShare(100.03, FIFTY_THIRTY_TWENTY);
    expect(allocated.get('a')).toBe(50.01);
    expect(allocated.get('b')).toBe(30.01);
    expect(allocated.get('c')).toBe(20.01);
  });

  it('is exact when the shares divide the amount evenly', () => {
    const allocated = allocateByShare(1000, [member('a', 0.6), member('b', 0.4)]);
    expect(allocated.get('a')).toBe(600);
    expect(allocated.get('b')).toBe(400);
  });
});

describe('summarizeExpenseSplit', () => {
  const input = (expenses: Expense[]) => ({
    expenses,
    members: MEMBERS,
    laborIncomeCategoryIds: SALARY_CATEGORIES,
    now: NOW,
  });

  it('treats a row with no owner as common and pools it', () => {
    const summary = summarizeExpenseSplit(input([makeRow('fixed', 800), makeRow('variable', 200)]));

    expect(summary.common.total).toBe(1000);
    expect(summary.common.rowCount).toBe(2);
  });

  it('keeps each person their own spending, out of the pool', () => {
    const summary = summarizeExpenseSplit(
      input([
        makeRow('variable', 1000),
        makeRow('variable', 300, { personalMemberId: GIUSEPPE.id }),
        makeRow('variable', 120, { personalMemberId: MARCELLA.id }),
      ])
    );

    expect(summary.common.total).toBe(1000);
    expect(summary.members[0].personalSpending).toBe(300);
    expect(summary.members[1].personalSpending).toBe(120);
  });

  // Net-zero money moving between the couple's own accounts is plumbing, not a cost — and it is
  // exactly what a couple feeding a joint account does every month.
  it('skips transfers entirely', () => {
    const summary = summarizeExpenseSplit(
      input([makeRow('variable', 500), makeRow('transfer', 900, { personalMemberId: GIUSEPPE.id })])
    );

    expect(summary.common.total).toBe(500);
    expect(summary.members[0].personalSpending).toBe(0);
  });

  it('computes the residual as salary minus the common share minus own spending', () => {
    const summary = summarizeExpenseSplit(
      input([
        salary(GIUSEPPE, 2400),
        salary(MARCELLA, 1600),
        makeRow('fixed', 1000),
        makeRow('variable', 300, { personalMemberId: GIUSEPPE.id }),
      ])
    );

    const [giuseppe, marcella] = summary.members;
    expect(giuseppe.share).toBe(0.6);
    expect(giuseppe.commonShare).toBe(600);
    expect(giuseppe.remaining).toBe(2400 - 600 - 300);
    expect(marcella.commonShare).toBe(400);
    expect(marcella.remaining).toBe(1200);
  });

  it('leaves every split-dependent figure null when the basis is unavailable', () => {
    const summary = summarizeExpenseSplit(
      input([salary(GIUSEPPE, 2400), makeRow('fixed', 1000), makeRow('variable', 300, { personalMemberId: MARCELLA.id })])
    );

    expect(summary.basis.kind).toBe('unavailable');
    // Own spending is a fact whatever the basis does, so it survives.
    expect(summary.members[1].personalSpending).toBe(300);
    expect(summary.members[1].commonShare).toBeNull();
    expect(summary.members[1].remaining).toBeNull();
    expect(summary.common.total).toBe(1000);
  });

  // Charging everyone for a row its owner marked as personal would be a worse answer than
  // admitting the row lost its owner.
  it('parks a row whose member no longer exists instead of folding it into the pool', () => {
    const summary = summarizeExpenseSplit(
      input([makeRow('fixed', 1000), makeRow('variable', 250, { personalMemberId: 'm-deleted' })])
    );

    expect(summary.common.total).toBe(1000);
    expect(summary.unassigned).toEqual({ total: 250, rowCount: 1 });
  });

  it('carries the part of the pool still ahead, by calendar day', () => {
    const summary = summarizeExpenseSplit(
      input([
        makeRow('fixed', 700, { date: new Date(2026, 7, 10, 12, 0, 0) }),
        makeRow('fixed', 300, { date: new Date(2026, 7, 28, 12, 0, 0) }),
      ])
    );

    expect(summary.common.total).toBe(1000);
    expect(summary.common.scheduled.expenses).toBe(300);
  });

  // THE POINT OF `remainingBooked`. A bill that has not been paid cannot make a person short:
  // before this, the whole of a deficit could be money still sitting in the account.
  it('keeps a residual of money that has MOVED apart from the period s', () => {
    const summary = summarizeExpenseSplit(
      input([
        salary(GIUSEPPE, 2400),
        salary(MARCELLA, 1600),
        makeRow('fixed', 700, { date: new Date(2026, 7, 10, 12, 0, 0) }),
        makeRow('fixed', 300, { date: new Date(2026, 7, 28, 12, 0, 0) }),
      ])
    );

    const [giuseppe, marcella] = summary.members;
    // 60% / 40% of 1000 booked+scheduled, and of the 700 already paid.
    expect(giuseppe.commonShare).toBe(600);
    expect(giuseppe.remaining).toBe(1800);
    expect(giuseppe.remainingBooked).toBe(1980);
    expect(marcella.remaining).toBe(1200);
    expect(marcella.remainingBooked).toBe(1320);
  });

  it('counts a person s OWN scheduled row out of their booked residual too', () => {
    const summary = summarizeExpenseSplit(
      input([
        salary(GIUSEPPE, 2400),
        salary(MARCELLA, 1600),
        makeRow('variable', 200, { personalMemberId: GIUSEPPE.id, date: new Date(2026, 7, 28, 12, 0, 0) }),
      ])
    );

    const [giuseppe] = summary.members;
    expect(giuseppe.personalSpending).toBe(200);
    expect(giuseppe.remaining).toBe(2200);
    expect(giuseppe.remainingBooked).toBe(2400);
  });

  // A salary not yet paid props a residual up exactly as an unpaid bill deflates one.
  it('leaves a salary still to come out of the booked residual', () => {
    const summary = summarizeExpenseSplit(
      input([
        salary(GIUSEPPE, 2400, { date: new Date(2026, 7, 28, 12, 0, 0) }),
        salary(MARCELLA, 1600),
        makeRow('fixed', 1000, { date: new Date(2026, 7, 10, 12, 0, 0) }),
      ])
    );

    const [giuseppe] = summary.members;
    expect(giuseppe.salary).toBe(2400);
    expect(giuseppe.remaining).toBe(1800);
    // Nothing of that salary has arrived: 0 − 600 of the pool already paid.
    expect(giuseppe.remainingBooked).toBe(-600);
  });

  // The booked shares are allocated through `allocateByShare` for the same reason the pool is:
  // subtracting one allocation from another would leave the parts short of the whole by a cent.
  it('closes the booked shares on the booked pool, to the cent', () => {
    const THREE = [GIUSEPPE, MARCELLA, { id: 'm-luca', name: 'Luca' }];
    const summary = summarizeExpenseSplit({
      expenses: [
        salary(GIUSEPPE, 1000),
        salary(MARCELLA, 1000),
        makeRow('income', 1000, { personalMemberId: 'm-luca' }),
        makeRow('fixed', 100.01, { date: new Date(2026, 7, 10, 12, 0, 0) }),
        makeRow('fixed', 50, { date: new Date(2026, 7, 28, 12, 0, 0) }),
      ],
      members: THREE,
      laborIncomeCategoryIds: SALARY_CATEGORIES,
      now: NOW,
    });

    const bookedShares = summary.members.map((member) => member.salary - member.remainingBooked! - 0);
    const bookedPool = Math.round(bookedShares.reduce((total, value) => total + value, 0) * 100) / 100;
    expect(bookedPool).toBe(100.01);
  });
});
