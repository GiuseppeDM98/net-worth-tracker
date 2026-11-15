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
 * WHAT IT READS: the rows of Tracciamento's window for ITS period (`trackingWindow`,
 * lib/utils/expenseWindows.ts) — the same key as Tracciamento's when the two tabs show the same
 * period, so the second one to open reads nothing. The tab mounts late and has its own axis, so
 * the read is its own; a new period is a new read, during which the picker stays and the tiles wait.
 *
 * ONE TILE PER PERSON, on purpose. Previdenza puts one block per contributor inside a single
 * tile; here each person is a tile, because the reader is looking for THEIR own figure and a
 * tile is the unit the eye lands on. It also makes the grid scale to a third person without a
 * layout of its own.
 *
 * BELOW DESKTOP (DESIGN.md → The First-Screen Rule; composed since 2026-10-12):
 * ONE sequence, the desktop DOM — title → [periodo] in the verdict's axis slot → the
 * sentence up to the shares → the strip, one cell per person on their booked residual (the
 * person's hero, lifted; none past four people or without a basis) → the calendar's scope line
 * (The Scheduled-Is-Not-Spent Rule, at every width, 2026-10-10) → «Il perché» → In comune, open →
 * «Il resto della pagina» → Quota and one row per person, closed. The «−» of a deficit is U+2212 in the strip
 * and in the hero alike (`formatBookedResidual`).
 */

'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { LIFTED_FIGURE_CLASS, Tile, TILE_CELL_CLASS, TILE_ROW_CELL_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { SPLIT_SKELETON_CELLS } from '@/lib/constants/cashflowTabSkeletons';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { PageVerdict, type PendingVerdict } from '@/components/ui/page-verdict';
import { NarrativeText } from '@/components/ui/narrative-text';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';
import { SplitQuotaBody } from '@/components/cashflow/tiles/SplitQuotaBody';
import { PeriodPicker } from '@/components/ui/period-picker';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  INDEX_GROUP_CLASS,
  LEAD_CELL_CLASS,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { liftedBlocks } from '@/lib/utils/verdictStrip';
import { currentMonthPeriod, type Period } from '@/lib/utils/period';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useExpensesInRange } from '@/lib/hooks/useExpenses';
import { trackingWindow } from '@/lib/utils/expenseWindows';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { filterExpensesByPeriod, rankCategories } from '@/lib/utils/tracciamentoSummary';
import {
  SPLIT_MEMBER_HERO_BLOCK,
  SPLIT_REST_ID,
  SPLIT_SECTION_IDS,
  residualTone,
  selectSplitStrip,
  splitMemberSectionId,
  summarizeExpenseSplit,
} from '@/lib/utils/expenseSplitSummary';
import {
  SPLIT_CLOSED_ASIDES,
  buildSplitVerdict,
  describeCommonSpending,
  describeMemberBalance,
  describeIncomeConsumed,
  describeMemberCalendar,
  describeSplitAside,
  describeSplitBasis,
  describeSplitClosedAnswers,
  describeSplitScope,
  formatBookedResidual,
} from '@/lib/utils/expenseSplitNarrative';
import { RowAnswers } from '@/components/ui/row-answers';
import type { Expense } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';

interface ExpenseSplitTabProps {
  familyMembers: FamilyMember[];
  /** The years the picker offers, from the account's oldest and newest row (`listExpenseYears`). */
  availableYears: number[];
  /** The tab is the one on screen: `PageRest` remounts on activation so its `role="alert"` speaks for it. */
  active: boolean;
}

/** The row every account has: Quota, before the people. */
const QUOTA_SECTION: SectionSpec = { id: SPLIT_SECTION_IDS.quota, eyebrow: 'Quota' };

const EMPTY_EXPENSES: Expense[] = [];

/**
 * One line of the pool's arithmetic under the hero: «Entrate in comune −1000 €», «Da dividere
 * 1500 €». The same row Centri di Costo's Ciclo tile draws, so the two read as one primitive.
 */
function PoolRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[9px]">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="m-0 font-mono text-[13px] tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function ExpenseSplitTab({ familyMembers, availableYears, active }: ExpenseSplitTabProps) {
  const { ownerId } = useActiveAccount();
  const [period, setPeriod] = useState<Period>(() => currentMonthPeriod());
  // ONE `now` per mount, like every other tab: a page whose clock moves under it would move its
  // own figures between two renders.
  const [now] = useState(() => new Date());

  const expensesWindow = useMemo(() => trackingWindow(period), [period]);
  const { data: windowExpenses = EMPTY_EXPENSES, isLoading: loading, isError: loadFailed } = useExpensesInRange(ownerId, expensesWindow);

  const expenses = useMemo(() => filterExpensesByPeriod(windowExpenses, period), [windowExpenses, period]);

  const summary = useMemo(
    () => summarizeExpenseSplit({ expenses, members: familyMembers, now }),
    [expenses, familyMembers, now]
  );

  const verdict = useMemo(() => buildSplitVerdict({ summary, period, now }), [summary, period, now]);
  // What the closed rows answer in the landscape index, from the summary the tiles already hold.
  const rowAnswers = useMemo(() => describeSplitClosedAnswers(summary), [summary]);

  // The rows of the phone composition and the verdict's «Il perché» (The Closed-Row Rule, since
  // 2026-10-12): Quota, then one row per person, keyed on the member id so a rename keeps the
  // row's memory. Memoized on the members: the controller asks for a stable list.
  const splitSections = useMemo<readonly SectionSpec[]>(
    () => [QUOTA_SECTION, ...familyMembers.map((member) => ({ id: splitMemberSectionId(member.id), eyebrow: member.name }))],
    [familyMembers],
  );
  const sections = useMobileSections({ route: 'cashflow', tab: 'split', sections: splitSections, restId: SPLIT_REST_ID });
  // At 768 the same rows on two columns; on a tablet in landscape the index beside the verdict and
  // THE tile (lib/utils/tabletComposition.ts). Quota, then one row per person the summary renders —
  // each person a cell of the PAGE grid below `desktop:` (their box is `contents`, a column of the
  // index in landscape).
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({
    sections,
    order: [SPLIT_SECTION_IDS.quota, ...summary.members.map((balance) => splitMemberSectionId(balance.member.id))],
  });

  // The strip: each person's booked residual, their hero lifted; the scope line
  // the calendar's clause, out of the sentence at every width (The Scheduled-Is-Not-Spent Rule).
  const strip = selectSplitStrip(summary);
  const scope = describeSplitScope(summary, period, now);

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

  // A wait is a skeleton, a failed read a notice — and in both the picker stays: the read is the
  // read of ONE period, and the way out of it is another period (Tracciamento's rule). Below
  // `desktop:` the picker is the verdict's `axis` slot in every state (`PageVerdict.pending`,
  // doc/guide/stati.md): the same element, so the one that asked for the new period keeps its focus.
  const surface = resolveSurfaceState({ loading: loading, failed: loadFailed });
  const pending: PendingVerdict | undefined =
    surface === 'failed'
      ? {
          kind: 'failed',
          notice: (
            <ErrorNotice
              notice={describeReadFailure({
                consequence: 'I movimenti non sono stati letti: senza di essi non si sa cosa è stato speso in comune.',
                untouched: 'I movimenti registrati non sono stati toccati.',
              })}
            />
          ),
        }
      : surface === 'loading'
        ? { kind: 'loading' }
        : undefined;
  const axis = <PeriodPicker value={period} onChange={setPeriod} availableYears={availableYears} className="max-w-[190px] shrink-0" />;

  // The same row in both returns below: the picker is the same element while its period is read.
  const periodRows = (
    // ── Verdict, with the period axis beside it on desktop (a second instance, DESIGN.md → Page Verdict) ──
    <div data-stage="verdict" className={cn('flex items-start justify-between gap-6 pt-1', VERDICT_CELL_CLASS)}>
      <div className="min-w-0 flex-1">
        <PageVerdict
          verdict={verdict}
          ariaLabel="Verdetto sulla divisione"
          axis={axis}
          pending={pending}
          strip={pending ? undefined : <VerdictStrip figures={strip} onOpen={sections.reveal} eyebrows={sections.eyebrows} />}
          scope={pending || !scope ? undefined : <NarrativeText segments={scope} className="text-[13px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />}
          restCollapse={sections.collapse(SPLIT_REST_ID)}
        />
      </div>
      <div className="hidden desktop:block">
        <PeriodPicker value={period} onChange={setPeriod} availableYears={availableYears} className="shrink-0" />
      </div>
    </div>
  );

  if (surface !== 'ready') {
    return (
      <div className="space-y-4">
        {periodRows}
        {surface === 'loading' && <TileGridSkeleton verdict={false} cells={SPLIT_SKELETON_CELLS} />}
      </div>
    );
  }

  // THE PEOPLE SHARE ONE GRID CELL, and that is what makes the row close.
  //
  // They used to be two `desktop:col-span-6` cells of the page grid, beside an «In comune» that
  // spans 5 over two rows: 5 + 6 = 11 of 12, so the second person did not fit, wrapped to a row
  // of their own, and left 578×181 px of void beside them — measured at 1440 on 2026-09-21. The
  // one comparison this page exists to make was a diagonal saccade across an empty corner.
  // Inside a single 7-column cell the row is 5 + 7 = 12 exactly and the people stand side by
  // side, at equal height, whatever their number.
  const memberColumns =
    summary.members.length >= 3 ? 'desktop:grid-cols-3' : 'desktop:grid-cols-2';

  return (
    <div className="space-y-4">
      {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
          (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
      <div className={STAGE_WRAPPER_CLASS}>
      <div ref={stageRef} className={STAGE_CLASS}>
      {periodRows}

      {/* ── Tile grid: ONE sequence, the DOM order is the reading order at every width (decision
          11) — THE tile, «Il resto della pagina», then the rows (inside the index) ──────── */}
      <div className={COMPACT_GRID_WRAPPER_CLASS}>
      <div className={COMPACT_GRID_CLASS}>
        {/* In comune — the pool, and what it is made of */}
        <div data-stage="lead" className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-5 desktop:row-span-2')}>
          <Tile id={SPLIT_SECTION_IDS.comune} eyebrow="In comune" reading={describeCommonSpending(summary)}>
            {/* Nothing recorded is not a measured zero (DESIGN.md → The Absence-Has-Three-Names
                Rule): with no shared row at all the tile carries NO figure, because a 40px `0 €`
                asserts a measurement nobody took. A pool that really adds up to zero has rows,
                and keeps its hero. */}
            {summary.common.rowCount === 0 ? (
              <EmptyState
                className="mt-3"
                message="Nessuna spesa in comune in questo periodo: ogni voce registrata è intestata a una persona."
              />
            ) : (
              <p className="mt-3 font-mono text-[32px] leading-none tracking-tight desktop:text-[40px]">
                {cachedFormatCurrencyEUR(summary.common.total, true)}
              </p>
            )}
            {/* What the income left «in comune» took off the pool, and what the shares actually
                divide (owner's decision, 2026-09-27): the hero stays the spending, the arithmetic
                sits under it. Absent when no income was left in comune — then the hero IS the
                pool. The «−» is U+2212, the sign the KPI trio prints (DESIGN.md → The Comma Rule). */}
            {summary.common.rowCount > 0 && summary.common.income > 0 && (
              <dl className="mt-3 flex flex-col divide-y divide-border" aria-label="Entrate in comune e quota da dividere">
                <PoolRow label="Entrate in comune" value={`−${cachedFormatCurrencyEUR(summary.common.income, true)}`} />
                <PoolRow label="Da dividere" value={cachedFormatCurrencyEUR(summary.common.toSplit, true)} />
                {summary.common.surplus > 0 && (
                  <PoolRow label="Avanzano" value={cachedFormatCurrencyEUR(summary.common.surplus, true)} />
                )}
              </dl>
            )}
            {commonRows.length > 0 && (
              <div className="mt-5">
                {/* The scope belongs on screen, not only in the list's accessible name: the same
                    category prints a different figure and a different rank on Tracciamento, which
                    ranks every row of the period and not just the shared ones. */}
                <p className={TILE_SUB_EYEBROW_CLASS}>Per categoria · solo in comune</p>
                <div className="mt-2">
                  <RankedRows
                    rows={commonRows}
                    color="var(--chart-1)"
                    remainders={
                      commonRanking.remainder
                        ? [{ label: 'Altre', amount: commonRanking.remainder.amount, percentage: commonRanking.remainder.percentage }]
                        : null
                    }
                    ariaLabel="Spese in comune per categoria"
                  />
                </div>
              </div>
            )}
          </Tile>
        </div>

        <RowAnswers value={rowAnswers}>
        <div className={INDEX_CLASS}>
        <PageRest key={active ? 'attiva' : 'inattiva'} sections={sections} className={REST_CELL_CLASS} />

        {/* Quota — the split, and the income it comes from */}
        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(SPLIT_SECTION_IDS.quota), 'desktop:col-span-7')}>
          <Tile
            eyebrow="Quota"
            aside={splitAside ? <NarrativeText segments={splitAside} /> : undefined}
            reading={describeSplitBasis(summary.basis)}
            collapse={sections.collapse(SPLIT_SECTION_IDS.quota)}
            asideWhenClosed={SPLIT_CLOSED_ASIDES.quota}
          >
            <SplitQuotaBody basis={summary.basis} />
          </Tile>
        </div>

        {/* One tile per person — the sentence this page exists for — inside ONE grid cell at 1440, so
            the people stand beside each other and the 12 columns close (see `memberColumns`). Below
            `desktop:` the box is `contents`: each person is a row of the page grid like any other;
            on a tablet in landscape a column of the index, with the index's hairlines
            (INDEX_GROUP_CLASS). */}
        <div className={cn('contents desktop:col-span-7 desktop:grid desktop:gap-3', memberColumns, INDEX_GROUP_CLASS)}>
          {summary.members.map((balance) => {
            const consumed = describeIncomeConsumed(balance);
            const calendar = describeMemberCalendar(balance);
            const sectionId = splitMemberSectionId(balance.member.id);
            // The hero is the strip's cell for this person: hidden when lifted (The Lifted-Figure Rule)
            // wherever the strip is drawn — below `desktop:`, the tablet included since
            // 2026-10-16 (`LIFTED_FIGURE_CLASS`).
            const heroLifted = liftedBlocks(strip, sectionId).includes(SPLIT_MEMBER_HERO_BLOCK);
            return (
              <div key={balance.member.id} className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(sectionId))}>
                <Tile
                  eyebrow={balance.member.name}
                  ariaLabel={`Quanto resta a ${balance.member.name}`}
                  reading={describeMemberBalance(balance)}
                  collapse={sections.collapse(sectionId)}
                  asideWhenClosed={SPLIT_CLOSED_ASIDES.member}
                >
                  <p
                    className={cn(
                      'mt-3 font-mono text-[32px] leading-none tracking-tight',
                      // The sign tokens mean money gained and lost, and a residual is exactly
                      // that — but only of money that has MOVED, so the colour follows the
                      // booked figure, as the strip's cell does (`residualTone`: none on a
                      // residual that prints as zero, since 2026-10-12). With no basis there
                      // is no residual to colour, and no figure to print.
                      balance.remainingBooked === null
                        ? 'text-muted-foreground'
                        : residualTone(balance.remainingBooked) === 'negative'
                          ? 'text-destructive'
                          : residualTone(balance.remainingBooked) === 'positive'
                            ? 'text-positive'
                            : 'text-foreground',
                      heroLifted && LIFTED_FIGURE_CLASS,
                    )}
                  >
                    {balance.remainingBooked === null ? (
                      // The reading above already says why there is no figure; announcing the
                      // dash as «Trattino» adds a word and no fact.
                      <span aria-hidden="true">—</span>
                    ) : (
                      // The «−» is U+2212, the strip's and the KPI trio's (The Comma Rule).
                      formatBookedResidual(balance.remainingBooked)
                    )}
                  </p>
                  {(calendar || consumed) && (
                    <div className="mt-auto pt-4 space-y-1">
                      {calendar && (
                        <NarrativeText
                          segments={calendar}
                          className="text-[11px] leading-[1.4] text-muted-foreground"
                          figureClassName="font-medium"
                        />
                      )}
                      {consumed && (
                        <NarrativeText
                          segments={consumed}
                          className="text-[11px] leading-[1.4] text-muted-foreground"
                          figureClassName="font-medium"
                        />
                      )}
                    </div>
                  )}
                </Tile>
              </div>
            );
          })}
        </div>
        </div>
        </RowAnswers>
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}
