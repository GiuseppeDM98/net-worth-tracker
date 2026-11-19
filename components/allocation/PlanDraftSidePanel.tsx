'use client';

/**
 * PlanDraftSidePanel — what the weights typed in the Target step do. Sits beside the table: the
 * monthly installment and what L is made of, whether the weights add up to 100%, the classes at the
 * end of the plan, the leverage and the month-by-month class chart, and — when the plan would end
 * after the Consulente's «rivedi entro» date — one note saying so (2026-11-12). A sale after the first month
 * reads as its own line and as the month it raises the instalment (2026-11-19). The parent hands it a
 * preview computed 300 ms after the last keystroke. Its sentences live in `accumulationNarrative.ts`.
 */
import { useState } from 'react';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { onlyTargetedClasses, type buildDraftPreview } from '@/lib/utils/accumulationPlanUtils';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { cachedFormatCurrencyEUR, formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { ClassDriftChart } from '@/components/allocation/ClassDriftChart';
import { TargetTick } from '@/components/allocation/TargetTick';
import {
  PLAN_PREVIEW_EMPTY,
  describeBandReentry,
  describeInstallmentAverage,
  describePlanPastReview,
  describeRefillNote,
  describeSaleStep,
  describeWeightsSum,
  monthLabelLong,
} from '@/lib/utils/accumulationNarrative';
import { NarrativeText } from '@/components/ui/narrative-text';
import { planEndsAfterReview } from '@/lib/utils/accumuloMonth';
import { summarizeBuyingInstalments } from '@/lib/utils/accumuloSummary';
import type { MonthKey } from '@/types/accumulationPlan';

type DraftPreview = ReturnType<typeof buildDraftPreview>;

interface PlanDraftSidePanelProps {
  preview: DraftPreview | null;
  months: number;
  /** The draft's first month: with `months`, where the plan ends. */
  startMonth: MonthKey;
  /** The Consulente's «rivedi entro» date, null without one. */
  reviewByIso: string | null;
  band: RebalanceBand;
  weightsSum: number;
  targetLeverageRatio: number;
  /** `listSaleSteps` on the preview's schedule: one sentence per month a later sale raises the instalment. */
  saleSteps?: Array<{ month: MonthKey; instalmentEur: number; names: string[] }>;
  /** `listRefillSaleMonths`: the sales the reserve note names beside the inflows. */
  refillSaleMonths?: MonthKey[];
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-[12px] ${strong ? 'border-t border-border pt-1.5 font-medium text-foreground' : ''}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function PlanDraftSidePanel({ preview, months, startMonth, reviewByIso, band, weightsSum, targetLeverageRatio, saleSteps = [], refillSaleMonths = [] }: PlanDraftSidePanelProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const weightsOk = Math.abs(weightsSum - 100) <= 0.01;
  const pastReview = reviewByIso && planEndsAfterReview({ startMonth, months }, reviewByIso) ? (
    <p className="text-[12px] text-warning-foreground">{describePlanPastReview(reviewByIso)}</p>
  ) : null;
  if (!preview) {
    return (
      <aside aria-label="Effetto dei pesi" className="flex flex-col gap-2 self-start rounded-xl bg-muted p-3.5">
        <p className="text-[12px] text-muted-foreground">{PLAN_PREVIEW_EMPTY}</p>
        {pastReview}
      </aside>
    );
  }

  const { liquidity, outcome } = preview;
  const trajectory = onlyTargetedClasses(preview.trajectory);
  const installments = preview.schedule.installments;
  // The first months may only refill the reserve (2026-11-17): the rate shown is the first that buys.
  const buying = summarizeBuyingInstalments(installments, liquidity.refillMonths);
  const refillNote = describeRefillNote({
    refillMonths: liquidity.refillMonths,
    months,
    shortfallEur: liquidity.shortfallEur,
    firstMonth: installments[liquidity.refillMonths]?.month,
    saleMonths: refillSaleMonths,
  });
  const finalPoint = trajectory[trajectory.length - 1];
  const classRows = Object.entries(finalPoint?.byClass ?? {}).filter(
    ([, data]) => data && (Math.abs(data.currentPct) >= 0.05 || Math.abs(data.targetPct) >= 0.05),
  );
  const selectedIndex = Math.min(picked ?? 0, months);
  const reentry = describeBandReentry(trajectory, 0, band, { draft: true });

  return (
    <aside aria-label="Effetto dei pesi" className="flex flex-col gap-2 self-start rounded-xl bg-muted p-3.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>
        {buying ? `Rata di ${monthLabelLong(buying.firstMonth, false)}` : 'Rata mensile'}
      </p>
      <p className="font-mono text-[22px] font-semibold tabular-nums text-foreground">{cachedFormatCurrencyEUR(buying ? buying.firstEur : liquidity.L / Math.max(months - liquidity.refillMonths, 1))}</p>
      {buying && (
        <p className="text-[12px] text-muted-foreground">
          {describeInstallmentAverage({ averageEur: buying.averageEur, firstEur: buying.firstEur, firstMonth: buying.firstMonth })}
        </p>
      )}
      {saleSteps.map((saleStep) => (
        <p key={saleStep.month} className="text-[12px] text-muted-foreground">{describeSaleStep(saleStep)}</p>
      ))}
      <Line label="dai conti, tolta la riserva" value={cachedFormatCurrencyEUR(liquidity.availableNowEur)} />
      {liquidity.dueProceedsEur > 0 && <Line label="vendite al mese 1" value={cachedFormatCurrencyEUR(liquidity.dueProceedsEur)} />}
      {liquidity.disposalProceedsEur - liquidity.dueProceedsEur > 0.005 && (
        <Line label="vendite nei mesi successivi" value={cachedFormatCurrencyEUR(liquidity.disposalProceedsEur - liquidity.dueProceedsEur)} />
      )}
      {liquidity.inflowTotalEur > 0 && (
        <Line
          label={`${cachedFormatCurrencyEUR(liquidity.inflowTotalEur / Math.max(months, 1))} al mese per ${months} mesi`}
          value={cachedFormatCurrencyEUR(liquidity.inflowTotalEur)}
        />
      )}
      {liquidity.shortfallEur > 0.005 && (
        <Line label="per ricostituire la riserva" value={'− ' + cachedFormatCurrencyEUR(Math.min(liquidity.shortfallEur, liquidity.disposalProceedsEur + liquidity.inflowTotalEur))} />
      )}
      <Line label="Totale da investire" value={cachedFormatCurrencyEUR(liquidity.L)} strong />
      {refillNote && <NarrativeText className="text-[12px] text-muted-foreground" segments={refillNote} />}
      <p className={`text-[12px] ${weightsOk ? 'text-positive' : 'text-destructive'}`} role="status">
        {describeWeightsSum(weightsSum)}
      </p>
      {pastReview}

      {classRows.length > 0 && (
        <>
          <p className={`${TILE_SUB_EYEBROW_CLASS} mt-2`}>Classi a fine piano</p>
          <ul className="space-y-2">
            {classRows.map(([assetClass, data]) => (
              <li key={assetClass}>
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="text-foreground">{ASSET_CLASS_LABELS[assetClass] ?? assetClass}</span>
                  <span className="font-mono tabular-nums">
                    <span className="font-semibold text-foreground">{formatPercentageIt(data!.currentPct, 1)}</span>
                    <span className="ml-1.5 text-muted-foreground">{formatPercentageIt(data!.targetPct, 1)}</span>
                  </span>
                </div>
                <TargetTick
                  className="mt-1"
                  color={`var(${getAssetClassCssVar(assetClass)})`}
                  currentPercentage={data!.currentPct}
                  targetPercentage={data!.targetPct}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {outcome.leverageRatio > 1.01 || targetLeverageRatio > 1.01 ? (
        <p className="text-[11px] text-muted-foreground">
          Leva a fine piano {formatNumberIt(outcome.leverageRatio, 2)}× · target {formatNumberIt(targetLeverageRatio, 2)}×
        </p>
      ) : null}

      {trajectory.length > 1 && (
        <>
          <p className={`${TILE_SUB_EYEBROW_CLASS} mt-2`}>Mese per mese</p>
          <ClassDriftChart points={trajectory} band={band} height={140} selectedIndex={selectedIndex} onSelect={setPicked} />
          {reentry && <p className="text-[12px] text-muted-foreground">{reentry}</p>}
        </>
      )}
    </aside>
  );
}
