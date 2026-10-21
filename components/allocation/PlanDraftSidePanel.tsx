'use client';

/**
 * PlanDraftSidePanel — what the weights typed in the Target step do. Sits beside the table: the monthly installment and what L is made of, whether
 * the weights add up to 100%, the classes at the end of the plan, the leverage and the month-by-month
 * class chart. The parent hands it a preview computed 300 ms after the last keystroke.
 */
import { useState } from 'react';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import type { buildDraftPreview } from '@/lib/utils/accumulationPlanUtils';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { cachedFormatCurrencyEUR, formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { ClassDriftChart } from '@/components/allocation/ClassDriftChart';
import { TargetTick } from '@/components/allocation/TargetTick';
import { describeBandReentry, describeInstallmentAverage, monthLabelLong } from '@/lib/utils/accumulationNarrative';

type DraftPreview = ReturnType<typeof buildDraftPreview>;

interface PlanDraftSidePanelProps {
  preview: DraftPreview | null;
  months: number;
  band: RebalanceBand;
  weightsSum: number;
  targetLeverageRatio: number;
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-[12px] ${strong ? 'border-t border-border pt-1.5 font-medium text-foreground' : ''}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function PlanDraftSidePanel({ preview, months, band, weightsSum, targetLeverageRatio }: PlanDraftSidePanelProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const weightsOk = Math.abs(weightsSum - 100) <= 0.01;
  if (!preview) {
    return (
      <aside aria-label="Effetto dei pesi" className="self-start rounded-xl bg-muted p-3.5">
        <p className="text-[12px] text-muted-foreground">Aggiungi gli strumenti e i pesi: qui vedi cosa fa il piano.</p>
      </aside>
    );
  }

  const { liquidity, outcome, trajectory } = preview;
  const installments = preview.schedule.installments;
  const firstInstallment = installments[0];
  const firstEur = (firstInstallment?.lines ?? []).reduce((sum, line) => sum + line.plannedAmountEur, 0);
  const averageEur =
    installments.reduce((sum, installment) => sum + installment.lines.reduce((acc, line) => acc + line.plannedAmountEur, 0), 0) /
    Math.max(installments.length, 1);
  const finalPoint = trajectory[trajectory.length - 1];
  const classRows = Object.entries(finalPoint?.byClass ?? {}).filter(
    ([, data]) => data && (Math.abs(data.currentPct) >= 0.05 || Math.abs(data.targetPct) >= 0.05),
  );
  const selectedIndex = Math.min(picked ?? 0, months);
  const reentry = describeBandReentry(trajectory, 0, band, { draft: true });

  return (
    <aside aria-label="Effetto dei pesi" className="flex flex-col gap-2 self-start rounded-xl bg-muted p-3.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>
        {firstInstallment ? `Rata di ${monthLabelLong(firstInstallment.month, false)}` : 'Rata mensile'}
      </p>
      <p className="font-mono text-[22px] font-semibold tabular-nums text-foreground">{cachedFormatCurrencyEUR(firstInstallment ? firstEur : liquidity.L / Math.max(months, 1))}</p>
      {firstInstallment && (
        <p className="text-[12px] text-muted-foreground">
          {describeInstallmentAverage({ averageEur, firstEur, firstMonth: firstInstallment.month })}
        </p>
      )}
      <Line label="dai conti, tolta la riserva" value={cachedFormatCurrencyEUR(liquidity.availableNowEur)} />
      {liquidity.disposalProceedsEur > 0 && <Line label="vendite al mese 1" value={cachedFormatCurrencyEUR(liquidity.disposalProceedsEur)} />}
      {liquidity.inflowTotalEur > 0 && (
        <Line
          label={`${cachedFormatCurrencyEUR(liquidity.inflowTotalEur / Math.max(months, 1))} al mese per ${months} mesi`}
          value={cachedFormatCurrencyEUR(liquidity.inflowTotalEur)}
        />
      )}
      <Line label="Totale da investire" value={cachedFormatCurrencyEUR(liquidity.L)} strong />
      <p className={`text-[12px] ${weightsOk ? 'text-positive' : 'text-destructive'}`} role="status">
        {weightsOk ? `Pesi a ${formatPercentageIt(weightsSum, 1)}: puoi andare avanti.` : `Pesi a ${formatPercentageIt(weightsSum, 1)}: devono fare 100%.`}
      </p>

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
