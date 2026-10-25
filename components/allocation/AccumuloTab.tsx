'use client';

/**
 * AccumuloTab — Allocazione's second tab, «sto portando il portafoglio dove voglio, e cosa compro
 * questo mese?». It owns what its tiles share: the open plan and
 * the month it is in (`useOpenAccumuloPlan`), the ledger matching, the class trajectory, and the
 * verdict built from them (`buildAccumuloVerdict`) — so the verdict and the tiles can never name
 * different counts. The grid:
 *
 *   plan open:   Questo mese (7) | Classi del piano (5)     — a draft or a finished plan has no
 *                                                              trajectory: Questo mese takes the row
 *   no plan:     Accumulo (12)                              — the empty state, RV4
 *   always:      Portafoglio modello (7) | Criteri (5)      — the model portfolio's own tile (A2)
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
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/utils/weightOptimizer';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { projectClassTrajectory } from '@/lib/utils/accumulationPlanUtils';
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
import { comparePlanToModel } from '@/lib/utils/modelPortfolio';
import { buildIdealAllocationInput, listIdealObjectives } from '@/lib/utils/settingsNarrative';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { useMobileSections } from '@/lib/hooks/useMobileSections';
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
import { useOpenAccumuloPlan } from '@/lib/hooks/useOpenAccumuloPlan';
import { useModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { resolveSurfaceState, describeReadFailure } from '@/lib/utils/statesNarrative';
import { describeAccumulationReadFailure, ACCUMULO_TILE_EYEBROW } from '@/lib/utils/accumulationNarrative';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { RowAnswers } from '@/components/ui/row-answers';
import { Skeleton } from '@/components/ui/skeleton';
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
}

export function AccumuloTab({ ownerId, allAssets, targets, band, targetLeverageRatio, idealAllocation, onAssetsChanged }: AccumuloTabProps) {
  const { plansQuery, plan, today, currentIndex } = useOpenAccumuloPlan(ownerId);
  const modelQuery = useModelPortfolio(ownerId);
  const model = modelQuery.data ?? null;
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
    // `today` is day-stable (useOpenAccumuloPlan): matching needs day-level freshness.
    [plan, today, transactionsQuery.data, transactionsQuery.isLoading],
  );

  const isActive = plan?.status === 'active';
  const done = !!plan && isActive && isPlanDone(plan, currentIndex);
  const showTrajectory = isActive && !done && !!targets;
  const trajectory = useMemo(
    () =>
      plan && showTrajectory && targets
        ? projectClassTrajectory({ plan, allAssets, installments: plan.installments, targets, band, compare: compareAllocations, currentIndex })
        : [],
    [plan, showTrajectory, allAssets, targets, band, currentIndex],
  );
  const clampedIndex = plan ? Math.min(Math.max(currentIndex, 0), plan.months) : 0;
  const reentry = useMemo(() => describeBandReentry(trajectory, clampedIndex, band), [trajectory, clampedIndex, band]);

  const sourceCashEur = useMemo(
    () => allAssets.filter((asset) => asset.assetClass === 'cash' && asset.type === 'cash').reduce((sum, asset) => sum + calculateAssetValue(asset), 0),
    [allAssets],
  );
  const draftTotalEur = useMemo(() => (plan?.status === 'draft' ? summarizeDraftTotal(plan, allAssets, DEPS) : 0), [plan, allAssets]);

  const verdictInput = useMemo(
    () =>
      resolveAccumuloVerdictInput({ plan, currentIndex, sourceCashEur, hasModel: !!model, lineStates: matchResult.lineStates, draftTotalEur, reentry }),
    [plan, currentIndex, sourceCashEur, model, matchResult.lineStates, draftTotalEur, reentry],
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
        classRows: trajectory.length > 0 ? selectClassStripRows(trajectory, clampedIndex) : [],
        planStartMonth: plan?.startMonth ?? null,
        criteriaCount: idealAllocation?.enabled ? listIdealObjectives(buildIdealAllocationInput(idealAllocation, targetLeverageRatio)).length : 0,
        lastClosedMonth: closedPlans[0] ? (closedPlans[0].installments[closedPlans[0].installments.length - 1]?.month ?? closedPlans[0].startMonth) : null,
      }),
    [plan, isActive, done, model, trajectory, clampedIndex, idealAllocation, targetLeverageRatio, closedPlans],
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

  if (surfaceState === 'loading') {
    return (
      <div className="mt-4 space-y-3">
        <Skeleton className="h-10 w-2/3 max-w-[560px]" />
        <Skeleton className="h-4 w-1/2 max-w-[420px]" />
        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-12">
          <Skeleton className="h-64 desktop:col-span-7" />
          <Skeleton className="h-64 desktop:col-span-5" />
        </div>
      </div>
    );
  }

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
          <div ref={stageRef} className={STAGE_CLASS}>
            <div data-stage="verdict" className={cn('pt-1', VERDICT_CELL_CLASS)}>
              <PageVerdict
                verdict={verdict}
                ariaLabel="Verdetto sul piano di accumulo"
                strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={stripEyebrows} />}
                restCollapse={restCollapse}
              />
            </div>

            <div className={COMPACT_GRID_WRAPPER_CLASS}>
              {/* At 1440 the left column is placed on the grid, not wrapped, and the right one is a box across
                  the rows, so «Il resto» and the rows are ONE index on a tablet in landscape: with a plan
                  Questo mese on row 1, the model under it on row 2, both at their natural height; the `1fr`
                  second row takes the right box's extra height, so the shorter column leaves the void under
                  it, as the two stacks did. */}
              <div className={cn(COMPACT_GRID_CLASS, plan && 'desktop:grid-rows-[auto_1fr]')}>
                {!plan && (
                  <div data-stage="lead" className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-12 desktop:row-start-1')}>
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
                      onGoToComposition={sections.compact ? () => sections.reveal(ACCUMULO_SECTION_IDS.modello) : undefined}
                    />
                  </div>
                )}

                {plan && targets && (
                  <div
                    id={ACCUMULO_SECTION_IDS.mese}
                    data-stage="lead"
                    className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'scroll-mt-24 desktop:col-span-7 desktop:row-start-1 desktop:self-start')}
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
                    />
                  </div>
                )}

                <div className={INDEX_CLASS}>
                  <PageRest sections={sections} className={REST_CELL_CLASS} />

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
                      readFailed={modelQuery.isError}
                      onAssetsChanged={onAssetsChanged}
                      collapse={sections.collapse(ACCUMULO_SECTION_IDS.modello)}
                      asideWhenClosed={model ? ACCUMULO_CLOSED_ASIDES[ACCUMULO_SECTION_IDS.modello] : ACCUMULO_MODEL_MISSING_ASIDE}
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
