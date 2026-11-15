import { describe, it, expect } from 'vitest';
import {
  MAX_SPLIT_STRIP_MEMBERS,
  SPLIT_MEMBER_HERO_BLOCK,
  SPLIT_REST_ID,
  SPLIT_SECTION_IDS,
  allocateByShare,
  residualTone,
  resolveSplitBasis,
  selectSplitStrip,
  splitMemberSectionId,
  summarizeExpenseSplit,
  type ExpenseSplitSummary,
  type MemberBalance,
  type MemberShare,
} from '@/lib/utils/expenseSplitSummary';
import { formatBookedResidual } from '@/lib/utils/expenseSplitNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import { formatStripFigure, liftedBlocks, validateStrip, type StripFigure } from '@/lib/utils/verdictStrip';
import type { Expense, ExpenseType } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';

const PAOLO: FamilyMember = { id: 'm-paolo', name: 'Paolo' };
const ELENA: FamilyMember = { id: 'm-elena', name: 'Elena' };
const MEMBERS = [PAOLO, ELENA];

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

/** An income row attributed to `member` — a salary by default (`cat-stipendio`), any category on request. */
const incomeOf = (member: FamilyMember, amount: number, overrides: Partial<Expense> = {}) =>
  makeRow('income', amount, { personalMemberId: member.id, ...overrides });

describe('resolveSplitBasis', () => {
  it('derives each share from the income attributed to that person', () => {
    const basis = resolveSplitBasis([incomeOf(PAOLO, 2400), incomeOf(ELENA, 1600)], MEMBERS);

    expect(basis.kind).toBe('computed');
    if (basis.kind !== 'computed') return;
    expect(basis.totalIncome).toBe(4000);
    expect(basis.members.map((entry) => entry.share)).toEqual([0.6, 0.4]);
  });

  it('sums several income rows for the same person', () => {
    const basis = resolveSplitBasis(
      [incomeOf(PAOLO, 1200), incomeOf(PAOLO, 1200), incomeOf(ELENA, 1600)],
      MEMBERS
    );

    if (basis.kind !== 'computed') throw new Error('expected a computed basis');
    expect(basis.members[0].income).toBe(2400);
  });

  // Owner's decision, 2026-09-27: the household divides on what each brought in, whatever the
  // category. Until then only the labor categories counted, and a refund attributed to somebody
  // was in neither the pool nor the residual.
  it('counts attributed income of any category, not the labor categories alone', () => {
    const refund = incomeOf(ELENA, 400, { categoryId: 'cat-rimborsi', categoryName: 'Rimborsi' });
    const basis = resolveSplitBasis([incomeOf(PAOLO, 2400), incomeOf(ELENA, 1200), refund], MEMBERS);

    if (basis.kind !== 'computed') throw new Error('expected a computed basis');
    expect(basis.members[1].income).toBe(1600);
    expect(basis.members.map((entry) => entry.share)).toEqual([0.6, 0.4]);
  });

  // The bug this prevents is the loud one: without the guard, the person who HAS recorded an
  // income silently carries 100% of the household's spending.
  it('refuses to compute when one person has no income yet, and names them', () => {
    const basis = resolveSplitBasis([incomeOf(PAOLO, 2400)], MEMBERS);

    expect(basis).toEqual({
      kind: 'unavailable',
      reason: 'missing-income',
      missingNames: ['Elena'],
      unattributedIncome: 0,
    });
  });

  // The income side used to swallow a row left «in comune» behind a mute `continue`, so a split
  // computed on part of the month's income was indistinguishable from one computed on all of it.
  // A row whose owner has left is declared elsewhere (with the spending orphans), once.
  it('declares income left in comune as unattributed, and never as somebody else s share', () => {
    const basis = resolveSplitBasis(
      [
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('income', 1100),
        makeRow('income', 500, { personalMemberId: 'm-deleted' }),
      ],
      MEMBERS
    );

    expect(basis.kind).toBe('computed');
    if (basis.kind !== 'computed') return;
    expect(basis.unattributedIncome).toBe(1100);
    // The shares are still the two real incomes' — the orphan money buys nobody a percentage.
    expect(basis.totalIncome).toBe(4000);
    expect(basis.members.map((entry) => entry.share)).toEqual([0.6, 0.4]);
  });

  it('refuses with fewer than two people', () => {
    expect(resolveSplitBasis([], [PAOLO])).toMatchObject({ kind: 'unavailable', reason: 'not-enough-members' });
  });
});

describe('allocateByShare', () => {
  const member = (id: string, share: number): MemberShare => ({
    member: { id, name: id.toUpperCase() },
    income: share * 1000,
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
  const input = (expenses: Expense[]) => ({ expenses, members: MEMBERS, now: NOW });

  it('treats a row with no owner as common and pools it', () => {
    const summary = summarizeExpenseSplit(input([makeRow('fixed', 800), makeRow('variable', 200)]));

    expect(summary.common.total).toBe(1000);
    expect(summary.common.rowCount).toBe(2);
  });

  it('keeps each person their own spending, out of the pool', () => {
    const summary = summarizeExpenseSplit(
      input([
        makeRow('variable', 1000),
        makeRow('variable', 300, { personalMemberId: PAOLO.id }),
        makeRow('variable', 120, { personalMemberId: ELENA.id }),
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
      input([makeRow('variable', 500), makeRow('transfer', 900, { personalMemberId: PAOLO.id })])
    );

    expect(summary.common.total).toBe(500);
    expect(summary.members[0].personalSpending).toBe(0);
  });

  it('computes the residual as income minus the common share minus own spending', () => {
    const summary = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 1000),
        makeRow('variable', 300, { personalMemberId: PAOLO.id }),
      ])
    );

    const [paolo, elena] = summary.members;
    expect(paolo.share).toBe(0.6);
    expect(paolo.commonShare).toBe(600);
    expect(paolo.remaining).toBe(2400 - 600 - 300);
    expect(elena.commonShare).toBe(400);
    expect(elena.remaining).toBe(1200);
  });

  it('leaves every split-dependent figure null when the basis is unavailable', () => {
    const summary = summarizeExpenseSplit(
      input([incomeOf(PAOLO, 2400), makeRow('fixed', 1000), makeRow('variable', 300, { personalMemberId: ELENA.id })])
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
    expect(summary.unassigned).toEqual({ total: 250, rowCount: 1, income: 0, incomeRowCount: 0 });
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
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 700, { date: new Date(2026, 7, 10, 12, 0, 0) }),
        makeRow('fixed', 300, { date: new Date(2026, 7, 28, 12, 0, 0) }),
      ])
    );

    const [paolo, elena] = summary.members;
    // 60% / 40% of 1000 booked+scheduled, and of the 700 already paid.
    expect(paolo.commonShare).toBe(600);
    expect(paolo.remaining).toBe(1800);
    expect(paolo.remainingBooked).toBe(1980);
    expect(elena.remaining).toBe(1200);
    expect(elena.remainingBooked).toBe(1320);
  });

  it('counts a person s OWN scheduled row out of their booked residual too', () => {
    const summary = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('variable', 200, { personalMemberId: PAOLO.id, date: new Date(2026, 7, 28, 12, 0, 0) }),
      ])
    );

    const [paolo] = summary.members;
    expect(paolo.personalSpending).toBe(200);
    expect(paolo.remaining).toBe(2200);
    expect(paolo.remainingBooked).toBe(2400);
  });

  // An income not yet received props a residual up exactly as an unpaid bill deflates one.
  it('leaves an income still to come out of the booked residual', () => {
    const summary = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2400, { date: new Date(2026, 7, 28, 12, 0, 0) }),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 1000, { date: new Date(2026, 7, 10, 12, 0, 0) }),
      ])
    );

    const [paolo] = summary.members;
    expect(paolo.income).toBe(2400);
    expect(paolo.remaining).toBe(1800);
    // Nothing of that income has arrived: 0 − 600 of the pool already paid.
    expect(paolo.remainingBooked).toBe(-600);
  });

  // The booked shares are allocated through `allocateByShare` for the same reason the pool is:
  // subtracting one allocation from another would leave the parts short of the whole by a cent.
  it('closes the booked shares on the booked pool, to the cent', () => {
    const THREE = [PAOLO, ELENA, { id: 'm-luca', name: 'Luca' }];
    const summary = summarizeExpenseSplit({
      expenses: [
        incomeOf(PAOLO, 1000),
        incomeOf(ELENA, 1000),
        makeRow('income', 1000, { personalMemberId: 'm-luca' }),
        makeRow('fixed', 100.01, { date: new Date(2026, 7, 10, 12, 0, 0) }),
        makeRow('fixed', 50, { date: new Date(2026, 7, 28, 12, 0, 0) }),
      ],
      members: THREE,
      now: NOW,
    });

    const bookedShares = summary.members.map((member) => member.income - member.remainingBooked! - 0);
    const bookedPool = Math.round(bookedShares.reduce((total, value) => total + value, 0) * 100) / 100;
    expect(bookedPool).toBe(100.01);
  });
});

/**
 * Income left «in comune» pays the common spending FIRST, and only what is left is split by the
 * salary shares (owner's decision, 2026-09-27). Before this, an income row nobody was named on
 * was in neither the pool nor anybody's residual: a 300 € refund on a shared bill vanished, and
 * the couple split the gross.
 */
describe('summarizeExpenseSplit — income left «in comune»', () => {
  const input = (expenses: Expense[]) => ({ expenses, members: MEMBERS, now: NOW });
  const commonIncome = (amount: number, overrides: Partial<Expense> = {}) =>
    makeRow('income', amount, { categoryId: 'cat-rimborsi', categoryName: 'Rimborsi', ...overrides });

  it('subtracts the common income from the pool before splitting it', () => {
    const summary = summarizeExpenseSplit(
      input([incomeOf(PAOLO, 2400), incomeOf(ELENA, 1600), makeRow('fixed', 1000), commonIncome(300)])
    );

    expect(summary.common).toMatchObject({ total: 1000, rowCount: 1, income: 300, incomeRowCount: 1, toSplit: 700, surplus: 0 });
    const [paolo, elena] = summary.members;
    // 60/40 of 700, not of 1000 — and the shares themselves do not move.
    expect(paolo.share).toBe(0.6);
    expect(paolo.commonShare).toBe(420);
    expect(elena.commonShare).toBe(280);
    expect(paolo.remaining).toBe(2400 - 420);
    expect(paolo.remainingBooked).toBe(2400 - 420);
  });

  // «Tutte le entrate non intestate a qualcuno» — a salary left in comune included. It still buys
  // nobody a share, and the basis still declares it: two facts about one row, both stated.
  it('counts a salary left in comune as common income too, and still declares it in the basis', () => {
    const summary = summarizeExpenseSplit(
      input([incomeOf(PAOLO, 2400), incomeOf(ELENA, 1600), makeRow('income', 1000), makeRow('fixed', 1500)])
    );

    expect(summary.common.income).toBe(1000);
    expect(summary.common.toSplit).toBe(500);
    expect(summary.basis.kind === 'computed' && summary.basis.unattributedIncome).toBe(1000);
    expect(summary.basis.kind === 'computed' && summary.basis.totalIncome).toBe(4000);
    expect(summary.members[0].commonShare).toBe(300);
  });

  // The owner's call: what the common income earns beyond the common spending is declared, never
  // handed out by the shares.
  it('declares a surplus instead of distributing it', () => {
    const summary = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 1000),
        commonIncome(1300),
        makeRow('variable', 300, { personalMemberId: PAOLO.id }),
      ])
    );

    expect(summary.common).toMatchObject({ total: 1000, income: 1300, toSplit: 0, surplus: 300 });
    const [paolo, elena] = summary.members;
    expect(paolo.commonShare).toBe(0);
    expect(elena.commonShare).toBe(0);
    expect(paolo.remaining).toBe(2400 - 300);
    expect(elena.remaining).toBe(1600);
  });

  // The booked pool is net of the income already RECEIVED, by the same calendar-day rule as the
  // rest: a refund dated next week has not paid anything yet.
  it('nets the booked pool on the income already received, not on the income still to come', () => {
    const summary = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 1000, { date: new Date(2026, 7, 10, 12, 0, 0) }),
        makeRow('fixed', 1500, { date: new Date(2026, 7, 28, 12, 0, 0) }),
        commonIncome(1000, { date: new Date(2026, 7, 10, 12, 0, 0) }),
      ])
    );

    const [paolo, elena] = summary.members;
    // Period: (2500 − 1000) × 60% = 900. Booked: max(0, 1000 − 1000) = 0.
    expect(paolo.commonShare).toBe(900);
    expect(paolo.remaining).toBe(1500);
    expect(paolo.remainingBooked).toBe(2400);
    expect(elena.remaining).toBe(1000);
    expect(elena.remainingBooked).toBe(1600);

    const scheduledIncome = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 1000, { date: new Date(2026, 7, 10, 12, 0, 0) }),
        commonIncome(400, { date: new Date(2026, 7, 28, 12, 0, 0) }),
      ])
    );
    // Period: (1000 − 400) × 60% = 360. Booked: the 400 has not arrived, so 1000 × 60% = 600.
    expect(scheduledIncome.members[0].remaining).toBe(2400 - 360);
    expect(scheduledIncome.members[0].remainingBooked).toBe(2400 - 600);
    // And the scheduled slice names the income still to come, so the verdict can say so.
    expect(scheduledIncome.common.scheduled.income).toBe(400);
  });

  // «Dipende se verrà dichiarato entrata di qualcuno o in comune» — and attributed to a person it
  // is theirs in full: in the base of their share and in their residual, whatever the category
  // (owner's decision, 2026-09-27). Not in the pool.
  it('counts a person s non-labor income in their share and their residual, not in the pool', () => {
    const summary = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2000),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 1000),
        commonIncome(400, { personalMemberId: PAOLO.id }),
        commonIncome(80, { personalMemberId: ELENA.id, date: new Date(2026, 7, 28, 12, 0, 0) }),
      ])
    );

    const [paolo, elena] = summary.members;
    expect(summary.common.income).toBe(0);
    // 2400 / (2400 + 1680): the refund moved Paolo's share up from 2000 / 3600.
    expect(paolo.income).toBe(2400);
    expect(paolo.share).toBeCloseTo(2400 / 4080, 10);
    expect(paolo.remaining).toBeCloseTo(2400 - paolo.commonShare!, 2);
    expect(paolo.remainingBooked).toBe(paolo.remaining);
    // Elena's 80 € is dated after today: in her period residual, not in her booked one.
    expect(elena.income).toBe(1680);
    expect(elena.remaining).toBeCloseTo(1680 - elena.commonShare!, 2);
    expect(elena.remainingBooked).toBeCloseTo(1600 - elena.commonShare!, 2);
  });

  // The user said the row was somebody's, so it is not the household's: it reduces nothing,
  // earns nobody a share, and is parked where the spending orphans are, declared once.
  it('parks income whose owner no longer exists, neither common nor anyone s', () => {
    const summary = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 1000),
        commonIncome(200, { personalMemberId: 'm-deleted' }),
      ])
    );

    expect(summary.common.income).toBe(0);
    expect(summary.common.toSplit).toBe(1000);
    expect(summary.unassigned).toEqual({ total: 0, rowCount: 0, income: 200, incomeRowCount: 1 });
    expect(summary.basis).toMatchObject({ kind: 'computed', totalIncome: 4000, unattributedIncome: 0 });
  });
});

/**
 * The phone's strip (since 2026-10-12): one cell per person on the residual of money that has
 * MOVED. The identity is the tile's (`formatBookedResidual`: the compact euro, the «−» U+2212 on a
 * deficit, at 1440 too — doc/guide/cashflow-divisione.md). Seen red on 2026-10-12 with the cell
 * reading `remaining` (the period's residual: Nibbio's «−100 €» for his «+500 €» of today), and with
 * the identity compared against `Intl`'s own hyphen-minus on the negative case.
 */
describe('selectSplitStrip', () => {
  const plain = (text: string) => text.replace(/[  ]/g, ' ');
  const cellText = (figure: StripFigure) => plain(narrativeToText([formatStripFigure(figure)!]));
  const person = (name: string, remainingBooked: number | null, remaining = remainingBooked): MemberBalance => ({
    member: { id: `m-${name.toLowerCase()}`, name },
    income: 2000,
    share: 0.5,
    commonShare: 500,
    personalSpending: 100,
    remaining,
    remainingBooked,
  });
  const summaryOf = (members: MemberBalance[]): ExpenseSplitSummary => ({
    basis: { kind: 'computed', totalIncome: 4000, unattributedIncome: 0, members: members.map((m) => ({ member: m.member, income: m.income, share: m.share ?? 0 })) },
    common: { total: 1000, rowCount: 3, income: 0, incomeRowCount: 0, toSplit: 1000, surplus: 0, scheduled: { count: 0, expenses: 0, income: 0, throughMonth: null } },
    members,
    unassigned: { total: 0, rowCount: 0, income: 0, incomeRowCount: 0 },
    commonExpenses: [],
  });

  it('reads one cell per person, opening and lifting the person\'s own row, and passes the strip rules', () => {
    const strip = selectSplitStrip(summaryOf([person('Ghiandaia', 2200), person('Nibbio', 500)]));
    expect(strip.map((f) => f.label)).toEqual(['Ghiandaia', 'Nibbio']);
    expect(strip.map((f) => f.opens)).toEqual([splitMemberSectionId('m-ghiandaia'), splitMemberSectionId('m-nibbio')]);
    expect(validateStrip(strip, [...Object.values(SPLIT_SECTION_IDS), SPLIT_REST_ID, ...strip.map((f) => f.opens)])).toEqual([]);
    expect(liftedBlocks(strip, splitMemberSectionId('m-nibbio'))).toEqual([SPLIT_MEMBER_HERO_BLOCK]);
    expect(liftedBlocks(strip, splitMemberSectionId('m-ghiandaia'))).toEqual([SPLIT_MEMBER_HERO_BLOCK]);
  });

  it('prints what the tile prints, the deficit with the U+2212 and in the loss tone, the zero unsigned', () => {
    const strip = selectSplitStrip(summaryOf([person('Ghiandaia', 2200), person('Nibbio', -83), person('Lemure', 0)]));
    expect(cellText(strip[0])).toBe(plain(formatBookedResidual(2200)));
    expect(formatStripFigure(strip[0])!.sign).toBe('positive');
    expect(cellText(strip[1])).toBe(plain(formatBookedResidual(-83)));
    expect(cellText(strip[1])).toMatch(/^−83/);
    expect(formatStripFigure(strip[1])!.sign).toBe('negative');
    expect(cellText(strip[2])).toBe(plain(formatBookedResidual(0)));
    expect(formatStripFigure(strip[2])!.sign).toBeUndefined();
  });

  it('prints a residual that rounds to zero as the unsigned, untoned zero — in the cell and in the tile alike', () => {
    // Seen red on 2026-10-12, in the spec's retirement: the tile printed «−0 €» in the loss colour
    // for −0,3 while the cell printed «0 €» (a printed zero takes no sign anywhere: AGENTS.md
    // § Layout and Color Tokens), and the cell still carried the loss tone the strip then dropped.
    const strip = selectSplitStrip(summaryOf([person('Ghiandaia', 2200), person('Pulcino', -0.3)]));
    expect(cellText(strip[1])).toBe('0 €');
    expect(cellText(strip[1])).toBe(plain(formatBookedResidual(-0.3)));
    expect(formatStripFigure(strip[1])!.sign).toBeUndefined();
    expect(strip[1].tone).toBeUndefined();
    // The tile reads the same tone: none at a printed zero, the sign's otherwise, null without a basis.
    expect(residualTone(-0.3)).toBeNull();
    expect(residualTone(0)).toBeNull();
    expect(residualTone(-83)).toBe('negative');
    expect(residualTone(2200)).toBe('positive');
    expect(residualTone(null)).toBeNull();
  });

  it('reads the money that has MOVED: +100 booked against −100 over the period is «+100», positive', () => {
    const strip = selectSplitStrip(summaryOf([person('Ghiandaia', 2200), person('Nibbio', 100, -100)]));
    expect(strip[1]).toMatchObject({ value: 100, tone: 'positive' });
    expect(cellText(strip[1])).toBe(plain(formatBookedResidual(100)));
  });

  it('is empty when nobody has a residual (no basis) and past four people', () => {
    expect(selectSplitStrip(summaryOf([person('Ghiandaia', null), person('Nibbio', null)]))).toEqual([]);
    const five = ['A', 'B', 'C', 'D', 'E'].map((name) => person(name, 100));
    expect(five.length).toBe(MAX_SPLIT_STRIP_MEMBERS + 1);
    expect(selectSplitStrip(summaryOf(five))).toEqual([]);
    expect(selectSplitStrip(summaryOf(five.slice(0, 4)))).toHaveLength(4);
  });

  it('prints «senza base» for a person without a residual only beside a measured one', () => {
    const strip = selectSplitStrip(summaryOf([person('Ghiandaia', 2200), person('Nibbio', null)]));
    expect(strip[1]).toMatchObject({ value: null, reason: 'senza base', opens: splitMemberSectionId('m-nibbio') });
    expect(validateStrip(strip, strip.map((f) => f.opens))).toEqual([]);
  });

  it('comes from the real summary on the split fixture\'s shape: the booked residual, never the period\'s', () => {
    const input = (expenses: Expense[]) => ({ expenses, members: MEMBERS, now: NOW });
    const summary = summarizeExpenseSplit(
      input([
        incomeOf(PAOLO, 2400),
        incomeOf(ELENA, 1600),
        makeRow('fixed', 1000),
        // Still ahead: inside the period's residual, outside the booked one.
        makeRow('fixed', 1500, { date: new Date(2026, 7, 28, 12) }),
        makeRow('variable', 1100, { personalMemberId: ELENA.id }),
      ])
    );
    const strip = selectSplitStrip(summary);
    expect(summary.members[1]).toMatchObject({ remaining: -500, remainingBooked: 100 });
    expect(strip[1]).toMatchObject({ label: 'Elena', value: 100, tone: 'positive' });
  });
});
