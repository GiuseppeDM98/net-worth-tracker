'use client';

/**
 * AccumuloVuotoTile — the Accumulo tab with no open plan: what the
 * feature does and does not do, in the reader's own numbers. The verdict above already says the
 * cash in the accounts; this tile adds the preview (a month's rata and where the classes would go
 * from the model portfolio — today's weights when there is none — the default reserve and no inflow) and the two lists a first-time reader
 * needs before pressing «Crea piano». «Crea piano» opens the editor on the plan dialog as before;
 * the second action, «Apri il portafoglio modello», jumps to the model portfolio's tile.
 */
import { useMemo, useState } from 'react';
import { useAnnualCashflow } from '@/lib/hooks/useAnnualCashflow';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { buildAccumuloPreview } from '@/lib/utils/accumuloSummary';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { Button } from '@/components/ui/button';
import { AccumulationPlanDialog } from '@/components/allocation/AccumulationPlanDialog';
import { TargetTick } from '@/components/allocation/TargetTick';
import { DEPS, TILE_ACTION_CLASS } from '@/components/allocation/tiles/accumuloShared';
import {
  ACCUMULO_ACTION_CREATE_PLAN,
  ACCUMULO_ACTION_OPEN_MODEL,
  ACCUMULO_EMPTY_DOESNT,
  ACCUMULO_EMPTY_DOESNT_TITLE,
  ACCUMULO_EMPTY_DOES,
  ACCUMULO_EMPTY_DOES_TITLE,
  ACCUMULO_EMPTY_ASIDE,
  ACCUMULO_TILE_EYEBROW,
  describeAccumuloIntro,
  describeAccumuloPreviewLead,
  suggestMonthlyInflow,
} from '@/lib/utils/accumulationNarrative';

/** The anchor `AccumuloTab` puts on the model portfolio's cell. */
export const COMPOSITION_ANCHOR_ID = 'portafoglio-modello';

interface AccumuloVuotoTileProps {
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget | null;
  band: RebalanceBand;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  /** The saved model portfolio, when there is one: the preview starts from its weights (RV4). */
  model: ModelPortfolio | null;
  today: Date;
  onAssetsChanged: () => void;
  /** Where «Apri il portafoglio modello» goes when the model is a closed row (below `desktop:`); absent = scroll to the anchor. */
  onGoToComposition?: () => void;
}

export function AccumuloVuotoTile({ ownerId, allAssets, targets, band, targetLeverageRatio, idealAllocation, model, today, onAssetsChanged, onGoToComposition }: AccumuloVuotoTileProps) {
  const isDemo = useDemoMode();
  const [dialogOpen, setDialogOpen] = useState(false);

  // RV4 / RP7: the entry the editor would suggest, so the preview matches what «Crea piano» proposes.
  const cashflowQuery = useAnnualCashflow(ownerId);
  const suggestedInflow = suggestMonthlyInflow(cashflowQuery.data?.annualSavings ?? 0);

  const preview = useMemo(
    () =>
      targets
        ? buildAccumuloPreview({ allAssets, targets, band, compare: compareAllocations, deps: DEPS, today, model: model?.weights, monthlyInflowEur: suggestedInflow })
        : null,
    [allAssets, targets, band, today, model, suggestedInflow],
  );

  const goToComposition = () => {
    // Below `desktop:` the model portfolio is a row that may be closed: the tab opens it and scrolls itself.
    if (onGoToComposition) return onGoToComposition();
    document.getElementById(COMPOSITION_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Tile eyebrow={ACCUMULO_TILE_EYEBROW} aside={ACCUMULO_EMPTY_ASIDE} reading={describeAccumuloIntro(preview)}>
        {preview && preview.classes.length > 0 && (
          <div className="mt-3 rounded-lg bg-muted p-4">
            <NarrativeText className="text-[13px] leading-[1.5] text-foreground" figureClassName="font-normal" segments={describeAccumuloPreviewLead(preview)} />
            <ul className="mt-3 space-y-3">
              {preview.classes.map((row) => (
                <li key={row.assetClass}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[13px] text-foreground">{ASSET_CLASS_LABELS[row.assetClass] ?? row.assetClass}</span>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums">
                      <span className="text-foreground">{formatPercentageIt(row.currentPct, 1)}</span>
                      <span className="font-semibold text-foreground"> → {formatPercentageIt(row.finalPct, 1)}</span>
                      <span className="ml-1.5 text-muted-foreground">target {formatPercentageIt(row.targetPct, 1)}</span>
                    </span>
                  </div>
                  <TargetTick
                    className="mt-1"
                    color={`var(--allocation-row-bar, var(${getAssetClassCssVar(row.assetClass)}))`}
                    currentPercentage={row.currentPct}
                    targetPercentage={row.targetPct}
                    projectedPercentage={row.finalPct}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-border pt-3.5 tablet:grid-cols-2">
          <div>
            <p className={TILE_SUB_EYEBROW_CLASS}>{ACCUMULO_EMPTY_DOES_TITLE}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-[1.5] text-foreground marker:text-muted-foreground">
              {ACCUMULO_EMPTY_DOES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className={TILE_SUB_EYEBROW_CLASS}>{ACCUMULO_EMPTY_DOESNT_TITLE}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-[1.5] text-foreground marker:text-muted-foreground">
              {ACCUMULO_EMPTY_DOESNT.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
          <Button className={TILE_ACTION_CLASS} disabled={isDemo || !targets} onClick={() => setDialogOpen(true)}>
            {ACCUMULO_ACTION_CREATE_PLAN}
          </Button>
          <Button variant="outline" className={TILE_ACTION_CLASS} onClick={goToComposition}>
            {ACCUMULO_ACTION_OPEN_MODEL}
          </Button>
        </div>
      </Tile>
      {dialogOpen && targets && (
        <AccumulationPlanDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          ownerId={ownerId}
          plan={null}
          allAssets={allAssets}
          targets={targets}
          band={band}
          targetLeverageRatio={targetLeverageRatio}
          idealAllocation={idealAllocation}
          model={model}
          onAssetsChanged={onAssetsChanged}
          onSaved={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
