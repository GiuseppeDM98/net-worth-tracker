/**
 * The numbers of Cashflow › Divisione: how a household's shared spending is split between the
 * people who live in it, and what is left of each person's income once their share is paid.
 *
 * THE MODEL, in one paragraph. Every expense row is either the household's («in comune», the
 * default, which is what an absent `personalMemberId` means) or one person's. The common
 * spending is a pool, and the income left «in comune» pays it FIRST (owner's decision,
 * 2026-09-27): what is split by the shares is `common spending − common income`, floored at zero,
 * and whatever the common income earns beyond the spending is declared as a surplus, never
 * distributed. Each person carries a share of that net pool proportional to the income
 * attributed to them in the period, and what remains to them is `their income − share of the
 * pool − their own spending`. That last figure is the point of the page: it is the money that
 * can go to a personal investment account at the end of the month.
 *
 * WHICH INCOME IS WHOSE. Every income row not attributed to a person is the household's and
 * reduces the pool — a refund on a shared bill, a gift to the couple, and a salary somebody
 * forgot to attribute alike (that last one buys nobody a share, and the basis declares it: two
 * facts about one row, both stated). Every income row attributed to a person is theirs and earns
 * them a share, WHATEVER its category (owner's decision, 2026-09-27: until then only the labor
 * categories counted, and a refund attributed to somebody was in neither the pool nor the
 * residual). An income row whose owner has since left Famiglia is neither: the user said it was
 * somebody's, so it reduces nothing, and it is declared with the spending orphans.
 *
 * THE SHARES ARE THE PERIOD'S, and that is a deliberate choice with a cost. Reading them off the
 * income actually received in the window is the most faithful answer to «how did THIS month
 * go», and it is also the most volatile: a bonus or a thirteenth month moves the percentage, and
 * a salary not yet recorded would move it to 100/0. So the shares are never guessed. When one of
 * the people has no income in the period, `resolveSplitBasis` returns `unavailable` naming who is
 * missing, and every figure that depends on the split disappears with it rather than being
 * invented — the same rule that makes an unknowable baseline `null` instead of `0` elsewhere in
 * this codebase.
 *
 * WHAT IS DELIBERATELY NOT HERE. There is no reconciliation of who paid what: the question this
 * page answers is «how much is left to each of us», not «who owes whom». The paying account
 * (`linkedCashAssetId`) is therefore never read, and a couple whose common expenses leave a joint
 * account needs no extra bookkeeping to use any of this.
 *
 * Words live in `expenseSplitNarrative.ts`; nothing here formats anything.
 */

import type { Expense } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';
import { isScheduledRow, summarizeScheduled, type ScheduledSlice } from '@/lib/utils/tracciamentoSummary';
import { formatEuroMinus, isPrintedZero } from '@/lib/utils/formatters';
import type { StripFigure } from '@/lib/utils/verdictStrip';
import { RING_CATEGORY_COLORS, isRingWhole, type RingSegment } from '@/lib/utils/ringChart';

// ─── The phone composition: the ids and the strip (since 2026-10-12) ──────────

/** THE tile and the Quota row of Divisione below `desktop:`; the people's rows are `splitMemberSectionId`. */
export const SPLIT_SECTION_IDS = { comune: 'spl-comune', quota: 'spl-quota' } as const;

/** The verdict's «Il perché» of this tab, a row of its controller. */
export const SPLIT_REST_ID = 'spl-perche';

/** One row per person: the member id keeps it stable across renames, the prefix unique among the tabs. */
export const splitMemberSectionId = (memberId: string): string => `spl-persona-${memberId}`;

/** The block of a person's tile the strip lifts: the 32px residual (their reading and captions stay). */
export const SPLIT_MEMBER_HERO_BLOCK = 'hero';

/** Past this many people the strip would not fit a row of 44px cells: none at all. */
export const MAX_SPLIT_STRIP_MEMBERS = 4;

/**
 * The tone of a person's booked residual — the tile's colour and the strip cell's: gain or loss
 * of money that has MOVED, and NONE on a residual that prints as zero (the printed-zero rule,
 * AGENTS.md § Layout and Color Tokens: «0 €» for −0,3 is neither, as the cell already printed it;
 * until 2026-10-12 the tile coloured it green at exactly 0 and red just below, while the cell was
 * untoned). `null` without a basis.
 */
export function residualTone(remainingBooked: number | null): 'positive' | 'negative' | null {
  if (remainingBooked === null || isPrintedZero(formatEuroMinus(remainingBooked))) return null;
  return remainingBooked < 0 ? 'negative' : 'positive';
}

/**
 * One cell per person under the title on a phone: their residual of money that has MOVED
 * (`remainingBooked`, the figure the tile prints and colours, never the period's `remaining`),
 * in the trio's face — `currency` with the «−» U+2212 on a deficit, the tone of the sign, a
 * printed zero unsigned — opening their row and lifting the 32px figure from it. Each prints
 * EXACTLY what the tile prints (`__tests__/expenseSplitSummary.test.ts` holds the identity).
 *
 * `[]` when nobody has a measured residual (the basis is unavailable: the verdict already says
 * why, `describeMissingBasis`) or with more than four people; a `null` cell «senza base» appears
 * only beside at least one measured residual, which the model never produces today (a basis is
 * one for the whole period) — kept so a future per-person basis has its words.
 */
export function selectSplitStrip(summary: ExpenseSplitSummary): StripFigure[] {
  const members = summary.members;
  if (members.length > MAX_SPLIT_STRIP_MEMBERS) return [];
  if (!members.some((member) => member.remainingBooked !== null)) return [];
  return members.map((member): StripFigure => {
    const booked = member.remainingBooked;
    const section = splitMemberSectionId(member.member.id);
    const tone = residualTone(booked);
    return {
      label: member.member.name,
      value: booked,
      format: 'currency',
      ...(booked === null ? { reason: 'senza base' } : tone ? { tone } : {}),
      opens: section,
      lifts: { section, block: SPLIT_MEMBER_HERO_BLOCK },
    };
  });
}

/**
 * A row whose `personalMemberId` names nobody the settings still know — the member was deleted
 * after the row was written. It is NOT folded back into the common pool: the user said it was
 * one person's, and charging everyone for it would be a worse answer than admitting the row has
 * lost its owner. It gets a bucket of its own, so the parts still add up to the whole and the
 * reader has something to click on. Same contract as NO_SUBCATEGORY_LABEL.
 */
export const SPLIT_UNASSIGNED_LABEL = 'Senza intestatario';

/** Spending types, in this app's convention: a transfer is net-zero and never spending. */
const SPENDING_TYPES = new Set(['fixed', 'variable', 'debt']);

export interface SplitMember {
  id: string;
  name: string;
}

/** One person's income in the period, and the share of the common pool it earns them. */
export interface MemberShare {
  member: SplitMember;
  /** Every income row attributed to this person inside the period, positive, whatever its category. */
  income: number;
  /** 0..1, summing to 1 across the members. */
  share: number;
}

/** Why the split could not be computed. Each value names an input the user can go and fix. */
export type SplitUnavailableReason =
  /** Fewer than two people configured under Impostazioni → Famiglia. */
  | 'not-enough-members'
  /** At least one person has no income attributed in this period — see `missingNames`. */
  | 'missing-income';

export type SplitBasis =
  | { kind: 'computed'; members: MemberShare[]; totalIncome: number; unattributedIncome: number }
  | {
      kind: 'unavailable';
      reason: SplitUnavailableReason;
      missingNames: string[];
      unattributedIncome: number;
    };

/** The household's shared spending over the period, and the shared income that pays it first. */
export interface CommonSpending {
  /** Spending left «in comune»: positive magnitude, the `calculateTotalExpenses` convention. */
  total: number;
  /** Spending rows only; the income rows are `incomeRowCount`. */
  rowCount: number;
  /** Income left «in comune», positive — every income type, a salary nobody attributed included. */
  income: number;
  incomeRowCount: number;
  /** What the shares actually divide: `max(0, total − income)`. */
  toSplit: number;
  /** What the common income earned beyond the common spending: `max(0, income − total)`. Declared, never distributed. */
  surplus: number;
  /** The part of `total` AND of `income` dated after today — inside them, never beside them. */
  scheduled: ScheduledSlice;
}

/** What one person owes and what is left to them. */
export interface MemberBalance {
  member: SplitMember;
  /** Their income in the period, positive — the base of their share. */
  income: number;
  /** 0..1, or null when the basis is unavailable. */
  share: number | null;
  /** Their slice of the common pool, positive; null when the basis is unavailable. */
  commonShare: number | null;
  /** Their own spending, positive. Known whatever the basis does. */
  personalSpending: number;
  /**
   * What is left once EVERY row of the period is counted, the ones still in the calendar
   * included: income − commonShare − personalSpending. Null when the basis is unavailable — a
   * residual computed without a share would be the whole pool charged to nobody.
   *
   * This is where the period ENDS, not where it stands. The figure a surface prints is
   * `remainingBooked`.
   */
  remaining: number | null;
  /**
   * The same residual counting only what has already HAPPENED by `now` — the figure the page
   * prints and colours, and the one the verdict says «mancano» about.
   *
   * The two differ by the money the period still has ahead of it: this person's share of the
   * common rows dated after today, their own rows dated after today, and any income of theirs
   * not yet received. Before this existed the page charged an unpaid bill to a person as if it
   * had left their account — the whole of a deficit could be money still in the bank — which is
   * the same claim `resolveSplitBasis` refuses to make about a share (2026-09-21, Impeccable
   * critique). Tracciamento's verdict draws the line in the same place (`settleTotals`), and
   * Centri di Costo separates the fact (`exceeded`) from the calendar (`atRisk`) for the same
   * reason.
   */
  remainingBooked: number | null;
}

export interface ExpenseSplitSummary {
  basis: SplitBasis;
  common: CommonSpending;
  /** One entry per configured member, in the order the settings list them. */
  members: MemberBalance[];
  /**
   * Rows whose owner no longer exists, spending (`total`) and income (`income`) apart, both
   * positive. In neither the pool nor anyone's column: declared so the parts still add up.
   */
  unassigned: { total: number; rowCount: number; income: number; incomeRowCount: number };
  /** The common SPENDING rows, for the tile that ranks them by category. */
  commonExpenses: Expense[];
}

export interface ExpenseSplitInput {
  /** Already narrowed to the period the page is showing. */
  expenses: Expense[];
  members: FamilyMember[];
  now: Date;
}

/** A member id that still resolves to somebody, or null. Blank strings count as absent. */
function resolveOwnerId(expense: Expense, knownIds: Set<string>): string | null {
  const raw = expense.personalMemberId;
  if (!raw) return null;
  return knownIds.has(raw) ? raw : SPLIT_UNASSIGNED_LABEL;
}

function isSpending(expense: Expense): boolean {
  return SPENDING_TYPES.has(expense.type);
}

/**
 * The share each person carries of the common pool, or the reason there is none.
 *
 * Shares come from EVERY income attributed to a person, whatever its category (owner's decision,
 * 2026-09-27; until then only `laborIncomeCategoryIds` counted and the sentences said
 * «stipendio» — they now say «entrate»). The household divides on what each brought in.
 *
 * `unattributedIncome` rides on BOTH outcomes because it is a fact about the window, not about
 * the split: income nobody is named on — a row left «in comune» — cannot earn anybody a share
 * (it pays the pool instead, see `summarizeExpenseSplit`), and used to vanish here behind a mute
 * `continue`. The spending side has always declared its orphans out loud; the income side, the
 * one that DECIDES the percentages, declared nothing, so a 60/40 computed on 80% of the month's
 * income was printed with full confidence (2026-09-21, Impeccable critique). A row whose owner
 * has since left Famiglia is NOT here: it is declared with the spending orphans, once.
 *
 * @param incomeRows Income-type rows already narrowed to the period.
 */
export function resolveSplitBasis(incomeRows: Expense[], members: FamilyMember[]): SplitBasis {
  const knownIds = new Set(members.map((member) => member.id));
  const incomeByMember = new Map<string, number>(members.map((member) => [member.id, 0]));
  let unattributedIncome = 0;

  for (const row of incomeRows) {
    if (row.type !== 'income') continue;
    const owner = resolveOwnerId(row, knownIds);
    // Income left «in comune»: named here, counted by the pool.
    if (owner === null) unattributedIncome += row.amount;
    if (owner === null || owner === SPLIT_UNASSIGNED_LABEL) continue;
    incomeByMember.set(owner, (incomeByMember.get(owner) ?? 0) + row.amount);
  }

  if (members.length < 2) {
    return { kind: 'unavailable', reason: 'not-enough-members', missingNames: [], unattributedIncome };
  }

  // A person with nothing recorded cannot be given a share of 0: that would silently hand the
  // whole pool to the other one. The window is declared incomplete instead.
  const missingNames = members
    .filter((member) => (incomeByMember.get(member.id) ?? 0) <= 0)
    .map((member) => member.name);
  if (missingNames.length > 0) {
    return { kind: 'unavailable', reason: 'missing-income', missingNames, unattributedIncome };
  }

  const totalIncome = members.reduce((sum, member) => sum + (incomeByMember.get(member.id) ?? 0), 0);
  const shares: MemberShare[] = members.map((member) => {
    const income = incomeByMember.get(member.id) ?? 0;
    return { member: { id: member.id, name: member.name }, income, share: income / totalIncome };
  });

  return { kind: 'computed', members: shares, totalIncome, unattributedIncome };
}

/**
 * The people's incomes as ring parts, in settings order — the base of their shares; null without a
 * basis. Settings order, not rank, so a person keeps a colour whatever the period (2026-11-12).
 */
export function splitRingSegments(basis: SplitBasis): RingSegment[] | null {
  if (basis.kind !== 'computed') return null;
  const segments = basis.members.map((entry, index) => ({
    key: entry.member.id,
    label: entry.member.name,
    value: entry.income,
    color: RING_CATEGORY_COLORS[index % RING_CATEGORY_COLORS.length],
  }));
  return isRingWhole(segments) ? segments : null;
}

/**
 * Split `total` across the shares so the parts sum back to it EXACTLY.
 *
 * Rounding every part independently leaves a stray cent, and a page that prints the pool next to
 * its own pieces is where that cent is visible. The rule this codebase already uses for a pair
 * that must sum to a constant — round one side and subtract — generalises here as: round every
 * part, then charge the residual to the LARGEST share, where it is proportionally smallest.
 *
 * Note for anyone testing this: with exactly TWO shares the two roundings always cancel, so the
 * correction below is unreachable in the two-person case this feature was built for. It bites
 * from three people up (a flatshare), which is the only shape a fixture can prove it with.
 */
export function allocateByShare(total: number, shares: MemberShare[]): Map<string, number> {
  const allocated = new Map<string, number>();
  if (shares.length === 0) return allocated;

  let running = 0;
  for (const entry of shares) {
    const amount = Math.round(total * entry.share * 100) / 100;
    allocated.set(entry.member.id, amount);
    running += amount;
  }

  const residual = Math.round((total - running) * 100) / 100;
  if (residual !== 0) {
    const largest = shares.reduce((best, entry) => (entry.share > best.share ? entry : best), shares[0]);
    // Re-round after the correction: 50.02 + (−0.01) is 50.010000000000005 in binary floating
    // point, and an amount that is not exactly a cent leaks into anything comparing cents.
    const corrected = Math.round(((allocated.get(largest.member.id) ?? 0) + residual) * 100) / 100;
    allocated.set(largest.member.id, corrected);
  }
  return allocated;
}

/**
 * Everything the Divisione tab and the monthly email read.
 *
 * Classification is by `type` and never by the sign of `amount` — by sign, a refund would count
 * as income and a reversed salary as spending. Transfers are skipped whole: they are net-zero,
 * and the money one person moves to the joint account is plumbing, not a cost.
 */
export function summarizeExpenseSplit({ expenses, members, now }: ExpenseSplitInput): ExpenseSplitSummary {
  const knownIds = new Set(members.map((member) => member.id));

  const commonExpenses: Expense[] = [];
  const commonIncomeRows: Expense[] = [];
  /** `total` is the whole period; `booked` is the part of it dated today or earlier. */
  const personalByMember = new Map<string, { total: number; booked: number; rowCount: number }>(
    members.map((member) => [member.id, { total: 0, booked: 0, rowCount: 0 }])
  );
  const bookedIncomeByMember = new Map<string, number>(members.map((member) => [member.id, 0]));
  const unassigned = { total: 0, rowCount: 0, income: 0, incomeRowCount: 0 };
  const incomeRows: Expense[] = [];

  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    const scheduled = isScheduledRow(expense, now);
    const owner = resolveOwnerId(expense, knownIds);
    if (expense.type === 'income') {
      incomeRows.push(expense);
      if (owner === null) {
        // The household's: it pays the pool first, whatever its category.
        commonIncomeRows.push(expense);
      } else if (owner === SPLIT_UNASSIGNED_LABEL) {
        unassigned.income += expense.amount;
        unassigned.incomeRowCount += 1;
      } else if (!scheduled) {
        // An income still to come props up a residual exactly as an unpaid bill deflates one.
        bookedIncomeByMember.set(owner, (bookedIncomeByMember.get(owner) ?? 0) + expense.amount);
      }
      continue;
    }
    if (!isSpending(expense)) continue;

    const magnitude = Math.abs(expense.amount);
    if (owner === null) {
      commonExpenses.push(expense);
    } else if (owner === SPLIT_UNASSIGNED_LABEL) {
      unassigned.total += magnitude;
      unassigned.rowCount += 1;
    } else {
      const bucket = personalByMember.get(owner)!;
      bucket.total += magnitude;
      if (!scheduled) bucket.booked += magnitude;
      bucket.rowCount += 1;
    }
  }

  const commonTotal = commonExpenses.reduce((sum, expense) => sum + Math.abs(expense.amount), 0);
  const commonIncome = commonIncomeRows.reduce((sum, expense) => sum + expense.amount, 0);
  const scheduled = summarizeScheduled([...commonExpenses, ...commonIncomeRows], now);
  const common: CommonSpending = {
    total: commonTotal,
    rowCount: commonExpenses.length,
    income: commonIncome,
    incomeRowCount: commonIncomeRows.length,
    toSplit: Math.max(0, commonTotal - commonIncome),
    surplus: Math.max(0, commonIncome - commonTotal),
    scheduled,
  };
  // The booked pool is net of the income already RECEIVED, by the same calendar-day rule: a
  // refund dated next week has paid nothing yet.
  const bookedToSplit = Math.max(0, commonTotal - scheduled.expenses - (commonIncome - scheduled.income));

  const basis = resolveSplitBasis(incomeRows, members);
  const shareByMember = new Map<string, MemberShare>(
    basis.kind === 'computed' ? basis.members.map((entry) => [entry.member.id, entry]) : []
  );
  const computedShares = basis.kind === 'computed' ? basis.members : [];
  const allocation = allocateByShare(common.toSplit, computedShares);
  // The booked pool is allocated through the SAME rule, so Σ(booked shares) is the booked pool to
  // the cent — a residual derived by subtracting one allocation from another would not close.
  const bookedAllocation = allocateByShare(bookedToSplit, computedShares);

  const balances: MemberBalance[] = members.map((member) => {
    const personal = personalByMember.get(member.id) ?? { total: 0, booked: 0, rowCount: 0 };
    const entry = shareByMember.get(member.id);
    const commonShare = entry ? (allocation.get(member.id) ?? 0) : null;
    const bookedShare = entry ? (bookedAllocation.get(member.id) ?? 0) : null;
    return {
      member: { id: member.id, name: member.name },
      income: entry?.income ?? 0,
      share: entry?.share ?? null,
      commonShare,
      personalSpending: personal.total,
      remaining: entry && commonShare !== null ? entry.income - commonShare - personal.total : null,
      remainingBooked:
        entry && bookedShare !== null
          ? (bookedIncomeByMember.get(member.id) ?? 0) - bookedShare - personal.booked
          : null,
    };
  });

  return { basis, common, members: balances, unassigned, commonExpenses };
}
