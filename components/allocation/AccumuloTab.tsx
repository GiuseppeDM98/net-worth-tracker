'use client';

/**
 * AccumuloTab — Allocazione's second tab, «sto portando il portafoglio dove voglio, e cosa compro
 * questo mese?». It owns what its tiles share: the open plan and the month it is in
 * (`useOpenAccumuloPlan`), the ledger matching, the class trajectory, and the verdict built from them
 * (`buildAccumuloVerdict`) — so the verdict and the tiles can never name different counts.
 *
 *   plan open:   Questo mese (7) | Classi del piano (5)     — a draft or a finished plan has no
 *                                                              trajectory: Questo mese takes the row
 *   no plan:     Accumulo (12)                              — the empty state
 *   closed plans: Piani conclusi (12)
 * Below `desktop:` ONE sequence, the DOM's (DESIGN.md → The First-Screen Rule): the verdict's title →
 * the first sentence → the strip (Rata · Investito · the class farthest from its band) → «Il perché»
 * (the band's re-entry) → Questo mese open → «Il resto della pagina» → Classi del piano and Piani
 * conclusi as closed rows (`useMobileSections`, memory `mobile-sections:allocation:accumulo`). No
 * `order-*`.
 */
import { useMemo } from 'react';
import type { Asset, AssetAllocationTarget } from '@/types/assets';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
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
import { ACCUMULO_CLOSED_ASIDES, describeAccumuloClosedAnswers, describeAccumuloVerdict, describeBandReentry } from '@/lib/utils/accumulationNarrative';
import { selectClassStripRows } from '@/lib/utils/accumulationPlanUtils';
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
import { AccumuloVuotoTile } from '@/components/allocation/tiles/AccumuloVuotoTile';
import { PianiConclusiTile } from '@/components/allocation/tiles/PianiConclusiTile';
import { DEPS } from '@/components/allocation/tiles/accumuloShared';

interface AccumuloTabProps {
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget | null;
  band: RebalanceBand;
  targetLeverageRatio: number;
  /** The page re-reads assets and settings. */
  onAssetsChanged: () => void;
}

export function AccumuloTab({ ownerId, allAssets, targets, band, targetLeverageRatio, onAssetsChanged }: AccumuloTabProps) {
  const { plansQuery, plan, today, currentIndex } = useOpenAccumuloPlan(ownerId);
  const transactionsQuery = useAssetTransactions(ownerId, undefined, { enabled: !!plan && plan.status === 'active' });

  const matchResult = useMemo(
    () =>
      plan
        ? matchPlanExecutions(plan, transactionsQuery.data ?? [], today, transactionsQuery.isLoading)
        : { matches: [], lineStates: {} },
    // `today` is day-stable (useOpenAccumuloPlan): matching needs day-level freshness (doc/pac-ate.md §5.9).
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
      resolveAccumuloVerdictInput({ plan, currentIndex, sourceCashEur, lineStates: matchResult.lineStates, draftTotalEur, reentry }),
    [plan, currentIndex, sourceCashEur, matchResult.lineStates, draftTotalEur, reentry],
  );
  const verdict = useMemo(() => describeAccumuloVerdict(verdictInput), [verdictInput]);

  // ─── The phone composition (2026-10-18) ──────────────────────────────────────
  const closedPlans = useMemo(() => selectClosedPlans(plansQuery.data), [plansQuery.data]);
  const hasClasses = !!plan && showTrajectory;
  // Always the cells of the DOM, in its order; THE tile (Questo mese, or the empty state) is not among them.
  const sectionSpecs = useMemo(
    () => resolveAccumuloSections({ hasClasses, hasClosedPlans: closedPlans.length > 0 }),
    [hasClasses, closedPlans.length],
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
        classRows: trajectory.length > 0 ? selectClassStripRows(trajectory, clampedIndex) : [],
        planStartMonth: plan?.startMonth ?? null,
        lastClosedMonth: closedPlans[0] ? (closedPlans[0].installments[closedPlans[0].installments.length - 1]?.month ?? closedPlans[0].startMonth) : null,
      }),
    [plan, trajectory, clampedIndex, closedPlans],
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

  const surfaceState = resolveSurfaceState({ loading: plansQuery.isLoading || (!!plan && !targets), failed: plansQuery.isError });

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
              {/* At 1440 Questo mese sits on the grid's left (7) and Classi del piano on its right (5), on row 1;
                  «Il resto» and the rows are ONE index on a tablet in landscape. */}
              <div className={COMPACT_GRID_CLASS}>
                {!plan && (
                  <div data-stage="lead" className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-12 desktop:row-start-1')}>
                    <AccumuloVuotoTile
                      ownerId={ownerId}
                      allAssets={allAssets}
                      targets={targets}
                      band={band}
                      targetLeverageRatio={targetLeverageRatio}
                      today={today}
                      onAssetsChanged={onAssetsChanged}
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
                      currentIndex={currentIndex}
                      matchResult={matchResult}
                      onAssetsChanged={onAssetsChanged}
                    />
                  </div>
                )}

                <div className={INDEX_CLASS}>
                  <PageRest sections={sections} className={REST_CELL_CLASS} />

                  {plan && showTrajectory && (
                    <div
                      className={cn(
                        'contents desktop:col-span-5 desktop:col-start-8 desktop:row-start-1 desktop:flex desktop:min-w-0 desktop:flex-col desktop:gap-3 desktop:self-start',
                        INDEX_GROUP_CLASS,
                      )}
                    >
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
                    </div>
                  )}

                  {closedPlans.length > 0 && (
                    <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ACCUMULO_SECTION_IDS.conclusi), 'desktop:col-span-12 desktop:row-start-2')}>
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

    </div>
  );
}
