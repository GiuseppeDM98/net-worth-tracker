/**
 * CASHFLOW › DIVISIONE — «quanto è costato in comune, e quanto resta a ciascuno?»
 *
 * The optional tab (`settings.expenseSplitEnabled`) for a household that shares its spending: a
 * verdict over a tile grid, on the SAME period axis as Tracciamento, because a division is a
 * fact of a month the way a month's savings are.
 *
 * The shape follows the page pattern of every redesigned surface here: the tab orchestrates and
 * computes nothing. Every number comes from `expenseSplitSummary.ts` and every sentence from
 * `expenseSplitNarrative.ts`, so a figure that cannot be pointed at inside an
 * `ExpenseSplitSummary` does not belong on this screen — and the monthly email, which reads the
 * same two modules, can never disagree with what is printed here.
 *
 * ONE TILE PER PERSON, on purpose. Previdenza puts one block per contributor inside a single
 * tile; here each person is a tile, because the reader is looking for THEIR own figure and a
 * tile is the unit the eye lands on. It also makes the grid scale to a third person without a
 * layout of its own.
 */

'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Tile, TILE_CELL_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { PageVerdict } from '@/components/ui/page-verdict';
import { NarrativeText } from '@/components/ui/narrative-text';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';
import { PeriodPicker } from '@/components/ui/period-picker';
import { currentMonthPeriod, type Period } from '@/lib/utils/period';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { filterExpensesByPeriod, rankCategories } from '@/lib/utils/tracciamentoSummary';
import { summarizeExpenseSplit } from '@/lib/utils/expenseSplitSummary';
import {
  buildSplitVerdict,
  describeCommonSpending,
  describeMemberBalance,
  describeSalaryConsumed,
  describeSplitAside,
  describeSplitBasis,
} from '@/lib/utils/expenseSplitNarrative';
import type { Expense } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';

// The desktop geometry of the grid below, so the skeleton has its proportions and nothing
// jumps when the data lands.
const SKELETON_CELLS = [
  { span: 5, rows: 2, lines: 6 },
  { span: 7, lines: 4 },
  { span: 7, lines: 4 },
];

interface ExpenseSplitTabProps {
  allExpenses: Expense[];
  familyMembers: FamilyMember[];
  laborIncomeCategoryIds: string[];
  loading: boolean;
}

export function ExpenseSplitTab({
  allExpenses,
  familyMembers,
  laborIncomeCategoryIds,
  loading,
}: ExpenseSplitTabProps) {
  const [period, setPeriod] = useState<Period>(() => currentMonthPeriod());
  // ONE `now` per mount, like every other tab: a page whose clock moves under it would move its
  // own figures between two renders.
  const [now] = useState(() => new Date());

  const availableYears = useMemo(() => {
    if (allExpenses.length === 0) return [];
    const years = allExpenses.map((expense) => new Date(expense.date).getFullYear());
    return Array.from(new Set(years)).sort((a, b) => b - a);
  }, [allExpenses]);

  const expenses = useMemo(() => filterExpensesByPeriod(allExpenses, period), [allExpenses, period]);

  const summary = useMemo(
    () => summarizeExpenseSplit({ expenses, members: familyMembers, laborIncomeCategoryIds, now }),
    [expenses, familyMembers, laborIncomeCategoryIds, now]
  );

  const verdict = useMemo(() => buildSplitVerdict({ summary, period, now }), [summary, period, now]);

  // The common pool broken down by category, through the ranking Tracciamento already uses:
  // one definition of «the period's top categories», never a second one here.
  const commonRanking = useMemo(() => rankCategories(summary.commonExpenses, 'expenses'), [summary.commonExpenses]);
  const splitAside = describeSplitAside(summary);
  const commonRows: RankedRow[] = commonRanking.rows.map((row) => ({
    key: row.categoryKey,
    label: row.category,
    amount: row.amount,
    percentage: row.percentage,
  }));

  if (loading) {
    return (
      <TileGridSkeleton
        cells={SKELETON_CELLS}
        className="pt-1"
        toolbar={<div className="desktop:hidden mx-auto h-9 w-[190px] animate-pulse rounded-md bg-muted" />}
      />
    );
  }

  // A person's tile spans half the row at two people and a third at three; past that the grid
  // wraps rather than shrinking a tile past readability.
  const memberSpan = summary.members.length >= 3 ? 'desktop:col-span-4' : 'desktop:col-span-6';

  return (
    <div className="space-y-4">
      {/* ── Verdict, with the period axis beside it on desktop ─────────────────── */}
      <div className="flex items-start justify-between gap-6 pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sulla divisione" />
        <div className="hidden desktop:block">
          <PeriodPicker value={period} onChange={setPeriod} availableYears={availableYears} className="shrink-0" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 desktop:hidden">
        <PeriodPicker value={period} onChange={setPeriod} availableYears={availableYears} className="max-w-[190px] shrink-0" />
      </div>

      {/* ── Tile grid ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        {/* In comune — the pool, and what it is made of */}
        <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5 desktop:row-span-2')}>
          <Tile eyebrow="In comune" reading={describeCommonSpending(summary)}>
            <p className="mt-3 font-mono text-[32px] leading-none tracking-tight desktop:text-[40px]">
              {cachedFormatCurrencyEUR(summary.common.total, true)}
            </p>
            {commonRows.length > 0 ? (
              <div className="mt-5">
                <p className={TILE_SUB_EYEBROW_CLASS}>Per categoria</p>
                <div className="mt-2">
                  <RankedRows
                    rows={commonRows}
                    color="var(--chart-1)"
                    remainder={
                      commonRanking.remainder
                        ? { label: 'Altre', amount: commonRanking.remainder.amount, percentage: commonRanking.remainder.percentage }
                        : null
                    }
                    ariaLabel="Spese in comune per categoria"
                  />
                </div>
              </div>
            ) : (
              <p className="mt-5 text-[11px] leading-[1.4] text-muted-foreground">
                Nessuna spesa in comune in questo periodo.
              </p>
            )}
          </Tile>
        </div>

        {/* Quota — the split, and the salaries it comes from */}
        <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-7')}>
          <Tile
            eyebrow="Quota"
            aside={splitAside ? <NarrativeText segments={splitAside} /> : undefined}
            reading={describeSplitBasis(summary.basis)}
          >
            {summary.basis.kind === 'computed' && (
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                {summary.basis.members.map((entry) => (
                  <div key={entry.member.id} className="min-w-0">
                    <p className={TILE_SUB_EYEBROW_CLASS}>{entry.member.name}</p>
                    <p className="mt-1 font-mono text-[22px] leading-none tracking-tight">
                      {cachedFormatCurrencyEUR(entry.salary, true)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Tile>
        </div>

        {/* One tile per person: the sentence this page exists for */}
        {summary.members.map((balance) => {
          const consumed = describeSalaryConsumed(balance);
          return (
            <div key={balance.member.id} className={cn(TILE_CELL_CLASS, 'tablet:col-span-1', memberSpan)}>
              <Tile
                eyebrow={balance.member.name}
                ariaLabel={`Quanto resta a ${balance.member.name}`}
                reading={describeMemberBalance(balance)}
              >
                <p
                  className={cn(
                    'mt-3 font-mono text-[32px] leading-none tracking-tight',
                    // The sign tokens mean money gained and lost, and a residual is exactly that.
                    // With no basis there is no residual to colour — and no figure to print.
                    balance.remaining === null
                      ? 'text-muted-foreground'
                      : balance.remaining < 0
                        ? 'text-destructive'
                        : 'text-positive'
                  )}
                >
                  {balance.remaining === null ? '—' : cachedFormatCurrencyEUR(balance.remaining, true)}
                </p>
                {consumed && (
                  <NarrativeText
                    segments={consumed}
                    className="mt-auto pt-4 text-[11px] leading-[1.4] text-muted-foreground"
                    figureClassName="font-medium"
                  />
                )}
              </Tile>
            </div>
          );
        })}
      </div>
    </div>
  );
}
