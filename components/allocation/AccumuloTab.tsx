'use client';

/**
 * AccumuloTab — Allocazione's second tab, «sto portando il portafoglio dove voglio, e cosa compro
 * questo mese?». It owns what its tiles share: the open plan and
 * the month it is in (`useOpenAccumuloPlan`), the ledger matching, the class trajectory, and the
 * verdict built from them (`buildAccumuloVerdict`) — so the verdict and the tiles can never name
 * different counts. The grid:
 *
 * Loaded on demand (2026-11-12): the page imports it through `lazyComponent`, with this tab's own
 * loading state as the fallback (`AccumuloTabSkeleton`), so none of the plan's engine, editor or
 * words is in Allocazione's initial JavaScript.
 *
 *   plan open:   Questo mese (7) | Classi del piano (5)     — a draft or a finished plan has no
 *                                                              trajectory: Questo mese takes the row
 *   no plan:     Accumulo (12)                              — the empty state
 *   always:      Portafoglio modello (7) | Criteri (5)      — the model portfolio's own tile
 *   closed plans: Piani conclusi (12)
 * Below `desktop:` ONE sequence, the DOM's: the verdict's title → the first sentence → the strip (Rata ·
 * Investito · the class farthest from its band) → «Il perché» (the band's re-entry) → Questo mese open →
 * «Il resto della pagina» → Portafoglio modello, Classi del piano, Criteri del modello, Piani conclusi as
 * closed rows (`useMobileSections`, memory `mobile-sections:allocation:accumulo`). No `order-*`. At 1440 the
 * left column is placed on the grid (Questo mese on row 1, the model under it) and the right one is a
 * box across both rows, so the desktop is the two stacks of before.
 *
 * The objectives' modal is opened from the Obiettivi tile and by `?obiettivi=1` (the link
 * Impostazioni, the optimizer panels and the model portfolio carry); the query is dropped once read.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Asset, AssetAllocationSettings, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { InvestmentGoal } from '@/types/goals';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/constants/idealAllocation';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { isPlanSourceAccount, onlyTargetedClasses, projectClassTrajectory, resolvePlanReserve } from '@/lib/utils/accumulationPlanUtils';
import { matchPlanExecutions } from '@/lib/utils/accumulationPlanMatching';
import {
  ACCUMULO_SECTION_IDS,
  isPlanDone,
  resolveAccumuloSections,
  resolveAccumuloVerdictInput,
  selectAccumuloStrip,
  selectClosedPlans,
  summarizeDraftTotal,
} from '@/lib/utils/accumuloSummary';
import { ACCUMULO_CLOSED_ASIDES, ACCUMULO_MODEL_MISSING_ASIDE, describeAccumuloClosedAnswers, describeAccumuloVerdict, describeBandReentry } from '@/lib/utils/accumulationNarrative';
import { selectClassStripRows } from '@/lib/utils/accumulationPlanUtils';
import { buildModelBasis, comparePlanToModel, isModelStale } from '@/lib/utils/modelPortfolio';
import { buildIdealAllocationInput, listIdealObjectives } from '@/lib/utils/settingsNarrative';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { useMobileSections } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  INDEX_GROUP_CLASS,
  PLAIN_GRID_CLASS,
  leadCellClass,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { useOpenAccumuloPlan } from '@/lib/hooks/useOpenAccumuloPlan';
import { useModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { MODEL_STALE_ASIDE } from '@/lib/utils/weightOptimizerNarrative';
import { useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { resolveSurfaceState, describeReadFailure } from '@/lib/utils/statesNarrative';
import { describeAccumulationReadFailure, ACCUMULO_TILE_EYEBROW } from '@/lib/utils/accumulationNarrative';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { RowAnswers } from '@/components/ui/row-answers';
import { AccumuloTabSkeleton } from '@/components/allocation/AccumuloTabSkeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { QuestoMeseTile } from '@/components/allocation/tiles/QuestoMeseTile';
import { ClassiDelPianoTile } from '@/components/allocation/tiles/ClassiDelPianoTile';
import { AccumuloVuotoTile, COMPOSITION_ANCHOR_ID } from '@/components/allocation/tiles/AccumuloVuotoTile';
import { PortafoglioModelloTile } from '@/components/allocation/tiles/PortafoglioModelloTile';
import { PianiConclusiTile } from '@/components/allocation/tiles/PianiConclusiTile';
import { ObiettiviTile } from '@/components/allocation/tiles/ObiettiviTile';
import { ObiettiviDialog } from '@/components/allocation/ObiettiviDialog';
import { DEPS } from '@/components/allocation/tiles/accumuloShared';

interface AccumuloTabProps {
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget | null;
  band: RebalanceBand;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  /** The page re-reads assets and settings. */
  onAssetsChanged: () => void;
  /** The Consulente's «rivedi entro» date: a plan ending after it carries a note (2026-11-12); null without one. */
  reviewByIso: string | null;
  /**
   * The settings and the goals the model rests on (`buildModelBasis`, built here: the page's first chunk does not
   * carry the model's module): its saves stamp the basis, its tile says when it moved.
   */
  settings: AssetAllocationSettings | null | undefined;
  goals: readonly InvestmentGoal[] | undefined;
}

export function AccumuloTab({ ownerId, allAssets, targets, band, targetLeverageRatio, idealAllocation, onAssetsChanged, reviewByIso, settings, goals }: AccumuloTabProps) {
  // What the model portfolio rests on, without a price in it (2026-11-12).
  const modelBasis = useMemo(() => buildModelBasis(settings, goals), [settings, goals]);
  const { plansQuery, plan, today, currentIndex } = useOpenAccumuloPlan(ownerId);
  const modelQuery = useModelPortfolio(ownerId);
  const model = modelQuery.data ?? null;
  // A model saved on another basis: its row reads «superato», at every width.
  const modelStale = useMemo(() => (model ? isModelStale(model, modelBasis, allAssets) : false), [model, modelBasis, allAssets]);
  const transactionsQuery = useAssetTransactions(ownerId, undefined, { enabled: !!plan && plan.status === 'active' });
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wantsObjectives = searchParams.get('obiettivi') === '1';
  useEffect(() => {
    if (!wantsObjectives) return;
    // Deferred: the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      setObjectivesOpen(true);
      router.replace(`${pathname}?tab=accumulo`, { scroll: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [wantsObjectives, pathname, router]);

  const matchResult = useMemo(
    () =>
      plan
        ? matchPlanExecutions(plan, transactionsQuery.data ?? [], today, transactionsQuery.isLoading)
        : { matches: [], lineStates: {} },
    // `today` is day-stable (useOpenAccumuloPlan): the matching needs a fresh day, never a fresh millisecond.
    [plan, today, transactionsQuery.data, transactionsQuery.isLoading],
  );

  const isActive = plan?.status === 'active';
  const done = !!plan && isActive && isPlanDone(plan, currentIndex);
  const showTrajectory = isActive && !done && !!targets;
  const trajectory = useMemo(
    () =>
      plan && showTrajectory && targets
        ? onlyTargetedClasses(projectClassTrajectory({ plan, allAssets, installments: plan.installments, targets, band, compare: compareAllocations, currentIndex }))
        : [],
    [plan, showTrajectory, allAssets, targets, band, currentIndex],
  );
  const clampedIndex = plan ? Math.min(Math.max(currentIndex, 0), plan.months) : 0;
  const reentry = useMemo(() => describeBandReentry(trajectory, clampedIndex, band), [trajectory, clampedIndex, band]);

  const sourceCashEur = useMemo(
    () => allAssets.filter(isPlanSourceAccount).reduce((sum, asset) => sum + calculateAssetValue(asset), 0),
    [allAssets],
  );
  // The allocation's cash quota: not spendable, the verdict names what is beyond it (owner, 2026-11-17).
  const { reserveEur, otherCashEur } = useMemo(
    () => (!plan ? resolvePlanReserve(allAssets, targets, compareAllocations, DEPS) : { reserveEur: 0, otherCashEur: 0 }),
    [plan, targets, allAssets],
  );
  const draftSummary = useMemo(() => (plan?.status === 'draft' ? summarizeDraftTotal(plan, allAssets, DEPS) : null), [plan, allAssets]);
  const draftTotalEur = draftSummary?.totalEur ?? 0;
  const draftRefillMonths = draftSummary?.refillMonths ?? 0;

  const verdictInput = useMemo(
    () =>
      resolveAccumuloVerdictInput({ plan, currentIndex, sourceCashEur, reserveEur, otherCashEur, hasModel: !!model, lineStates: matchResult.lineStates, draftTotalEur, draftRefillMonths, reentry, today }),
    [plan, currentIndex, sourceCashEur, reserveEur, otherCashEur, model, matchResult.lineStates, draftTotalEur, draftRefillMonths, reentry, today],
  );
  const verdict = useMemo(() => describeAccumuloVerdict(verdictInput), [verdictInput]);

  // ─── The phone composition (2026-10-18) ──────────────────────────────────────
  const closedPlans = useMemo(() => selectClosedPlans(plansQuery.data), [plansQuery.data]);
  const hasClasses = !!plan && showTrajectory;
  // Always the cells of the DOM, in its order; THE tile (Questo mese, or the empty state) is not among them.
  const sectionSpecs = useMemo(
    () => resolveAccumuloSections({ hasClasses, hasClosedPlans: closedPlans.length > 0, modelFailed: modelQuery.isError }),
    [hasClasses, closedPlans.length, modelQuery.isError],
  );
  // No row (no plan, or a plan with no trajectory yet): no index and no stage, the grid of before — in
  // landscape the tile across the page, never beside an empty «Il resto» (2026-11-17).
  const composed = sectionSpecs.length > 0;
  const sections = useMobileSections({ route: 'allocation', tab: 'accumulo', sections: sectionSpecs });
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: sectionSpecs.map((section) => section.id) });
  const strip = useMemo(() => selectAccumuloStrip({ verdictInput, trajectory, currentIndex: clampedIndex }), [verdictInput, trajectory, clampedIndex]);
  const restCollapse = sections.collapse(VERDICT_REST_SECTION);
  const stripEyebrows = { ...sections.eyebrows, [ACCUMULO_SECTION_IDS.mese]: 'questo mese', [VERDICT_REST_SECTION]: 'il perché' };
  const rowAnswers = useMemo(
    () =>
      describeAccumuloClosedAnswers({
        modelDifferenceCount: plan && isActive && !done && model ? comparePlanToModel(plan.positions, model).count : null,
        modelStale,
        classRows: trajectory.length > 0 ? selectClassStripRows(trajectory, clampedIndex) : [],
        planStartMonth: plan?.startMonth ?? null,
        criteriaCount: idealAllocation?.enabled ? listIdealObjectives(buildIdealAllocationInput(idealAllocation, targetLeverageRatio)).length : 0,
        lastClosedMonth: closedPlans[0] ? (closedPlans[0].installments[closedPlans[0].installments.length - 1]?.month ?? closedPlans[0].startMonth) : null,
      }),
    [plan, isActive, done, model, modelStale, trajectory, clampedIndex, idealAllocation, targetLeverageRatio, closedPlans],
  );

  /**
   * What a strip cell opens: «Rata» THE tile (it never closes: the page scrolls to it), «Investito» the
   * Classi del piano row through the controller, the class cell the verdict's «Il perché».
   */
  const handleStripOpen = (section: string) => {
    if (section === VERDICT_REST_SECTION) {
      restCollapse?.onOpenChange(true);
      return;
    }
    if (section === ACCUMULO_SECTION_IDS.mese) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const lead = document.getElementById(ACCUMULO_SECTION_IDS.mese);
      lead?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      lead?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      return;
    }
    sections.reveal(section);
  };

  const surfaceState = resolveSurfaceState({ loading: plansQuery.isLoading || modelQuery.isLoading || (!!plan && !targets), failed: plansQuery.isError });

  // The same element the page draws while this tab's chunk is on its way: nothing moves when it lands.
  if (surfaceState === 'loading') return <AccumuloTabSkeleton />;

  if (surfaceState === 'failed') {
    return (
      <div className="mt-4">
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={() => void plansQuery.refetch()}
          notice={describeReadFailure({ subject: ACCUMULO_TILE_EYEBROW, consequence: describeAccumulationReadFailure(), canRetry: true })}
        />
      </div>
    );
  }

  const objectivesSaved = idealAllocation ?? DEFAULT_IDEAL_ALLOCATION;
  // Where a row sits on the 1440 grid: with a plan Questo mese opens row 1 and the model row 2 (the
  // right box across both); without one the empty state takes row 1 and both boxes row 2.
  const modelRow = 'desktop:row-start-2';

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left (verdict and
          THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
      <RowAnswers value={rowAnswers}>
        <div className={STAGE_WRAPPER_CLASS}>
          <div ref={composed ? stageRef : undefined} className={composed ? STAGE_CLASS : 'space-y-4'}>
            <div data-stage="verdict" className={cn('pt-1', composed && VERDICT_CELL_CLASS)}>
              <PageVerdict
                verdict={verdict}
                ariaLabel="Verdetto sul piano di accumulo"
                strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={stripEyebrows} />}
                restCollapse={restCollapse}
              />
            </div>

            <div className={composed ? COMPACT_GRID_WRAPPER_CLASS : undefined}>
              {/* At 1440 the left column is placed on the grid, not wrapped, and the right one is a box across
                  the rows, so «Il resto» and the rows are ONE index on a tablet in landscape: with a plan
                  Questo mese on row 1, the model under it on row 2, both at their natural height; the `1fr`
                  second row takes the right box's extra height, so the shorter column leaves the void under
                  it, as the two stacks did. */}
              <div className={cn(composed ? COMPACT_GRID_CLASS : PLAIN_GRID_CLASS, plan && 'desktop:grid-rows-[auto_1fr]')}>
                {!plan && (
                  <div data-stage="lead" className={cn(TILE_CELL_CLASS, leadCellClass(composed), 'desktop:col-span-12 desktop:row-start-1')}>
                    <AccumuloVuotoTile
                      ownerId={ownerId}
                      allAssets={allAssets}
                      targets={targets}
                      band={band}
                      targetLeverageRatio={targetLeverageRatio}
                      idealAllocation={idealAllocation}
                      model={model}
                      today={today}
                      onAssetsChanged={onAssetsChanged}
                      reviewByIso={reviewByIso}
                      modelBasis={modelBasis}
                      onGoToComposition={sections.compact ? () => sections.reveal(ACCUMULO_SECTION_IDS.modello) : undefined}
                    />
                  </div>
                )}

                {plan && targets && (
                  <div
                    id={ACCUMULO_SECTION_IDS.mese}
                    data-stage="lead"
                    className={cn(TILE_CELL_CLASS, leadCellClass(composed), 'scroll-mt-24 desktop:col-span-7 desktop:row-start-1 desktop:self-start')}
                  >
                    <QuestoMeseTile
                      ownerId={ownerId}
                      plan={plan}
                      allAssets={allAssets}
                      targets={targets}
                      band={band}
                      targetLeverageRatio={targetLeverageRatio}
                      idealAllocation={idealAllocation}
                      currentIndex={currentIndex}
                      matchResult={matchResult}
                      model={model}
                      onAssetsChanged={onAssetsChanged}
                      reviewByIso={reviewByIso}
                      modelBasis={modelBasis}
                    />
                  </div>
                )}

                <div className={composed ? INDEX_CLASS : 'contents'}>
                  {composed && <PageRest sections={sections} className={REST_CELL_CLASS} />}

                  <div id={COMPOSITION_ANCHOR_ID} className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ACCUMULO_SECTION_IDS.modello), 'scroll-mt-4 desktop:col-span-7 desktop:col-start-1 desktop:self-start', modelRow)}>
                    <PortafoglioModelloTile
                      ownerId={ownerId}
                      allAssets={allAssets}
                      targets={targets}
                      band={band}
                      targetLeverageRatio={targetLeverageRatio}
                      idealAllocation={idealAllocation}
                      model={model}
                      plan={plan}
                      reviewByIso={reviewByIso}
                      modelBasis={modelBasis}
                      readFailed={modelQuery.isError}
                      onAssetsChanged={onAssetsChanged}
                      collapse={sections.collapse(ACCUMULO_SECTION_IDS.modello)}
                      asideWhenClosed={
                        !model ? ACCUMULO_MODEL_MISSING_ASIDE : modelStale ? MODEL_STALE_ASIDE : ACCUMULO_CLOSED_ASIDES[ACCUMULO_SECTION_IDS.modello]
                      }
                    />
                  </div>

                  <div
                    className={cn(
                      'contents desktop:col-span-5 desktop:col-start-8 desktop:row-span-2 desktop:flex desktop:min-w-0 desktop:flex-col desktop:gap-3',
                      plan ? 'desktop:row-start-1' : modelRow,
                      INDEX_GROUP_CLASS,
                    )}
                  >
                    {plan && showTrajectory && (
                      <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ACCUMULO_SECTION_IDS.classi))}>
                        <ClassiDelPianoTile
                          plan={plan}
                          trajectory={trajectory}
                          currentIndex={currentIndex}
                          band={band}
                          collapse={sections.collapse(ACCUMULO_SECTION_IDS.classi)}
                          asideWhenClosed={ACCUMULO_CLOSED_ASIDES[ACCUMULO_SECTION_IDS.classi]}
                        />
                      </div>
                    )}

                    <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ACCUMULO_SECTION_IDS.criteri))}>
                      <ObiettiviTile
                        idealAllocation={idealAllocation}
                        targetLeverageRatio={targetLeverageRatio}
                        snapshot={model?.optimizerSnapshot}
                        editRef={editRef}
                        disabled={!targets}
                        plan={isActive && !done ? plan : null}
                        ownerId={ownerId}
                        allAssets={allAssets}
                        targets={targets}
                        onEdit={() => setObjectivesOpen(true)}
                        collapse={sections.collapse(ACCUMULO_SECTION_IDS.criteri)}
                        asideWhenClosed={ACCUMULO_CLOSED_ASIDES[ACCUMULO_SECTION_IDS.criteri]}
                      />
                    </div>
                  </div>

                  {closedPlans.length > 0 && (
                    <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ACCUMULO_SECTION_IDS.conclusi), 'desktop:col-span-12 desktop:row-start-3')}>
                      <PianiConclusiTile
                        ownerId={ownerId}
                        plans={closedPlans}
                        allPlans={plansQuery.data ?? []}
                        targets={targets}
                        collapse={sections.collapse(ACCUMULO_SECTION_IDS.conclusi)}
                        asideWhenClosed={ACCUMULO_CLOSED_ASIDES[ACCUMULO_SECTION_IDS.conclusi]}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </RowAnswers>

      {objectivesOpen && targets && (
        <ObiettiviDialog
          open={objectivesOpen}
          onClose={() => setObjectivesOpen(false)}
          ownerId={ownerId}
          allAssets={allAssets}
          targets={targets}
          targetLeverageRatio={targetLeverageRatio}
          saved={objectivesSaved}
          model={model}
          plan={isActive && !done ? plan : null}
          onSaved={onAssetsChanged}
          returnFocusTo={editRef}
        />
      )}
    </div>
  );
}
