'use client';

import { Trophy } from 'lucide-react';
import type { DashboardOverviewPayload } from '@/types/dashboardOverview';
import type { AssistantMonthContextBundle } from '@/types/assistant';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { getAssistantPeriodLabel } from '@/lib/utils/assistantPeriodLabel';
import { describeNetWorthToday, describePeriodNetWorth, type AssistantToday } from '@/lib/utils/assistantNarrative';
import { MONTH_NAMES } from '@/lib/constants/months';
import { Tile } from '@/components/ui/tile';
import { VariationChip } from '@/components/dashboard/overview/PatrimonioTile';

/** The section-hero step of the ramp (36px): the tile's one dominant figure. */
const HERO_CLASS = 'mt-2.5 block font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground';

type PatrimonioContestoTileProps =
  | { mode: 'period'; bundle: AssistantMonthContextBundle; today: AssistantToday }
  | { mode: 'today'; overview: DashboardOverviewPayload | null | undefined };

/** The caption of the period's variation chip: what the delta is measured against. */
function periodChipCaption(selector: AssistantMonthContextBundle['selector'], isPartial: boolean): string {
  if (selector.month > 0) return `su ${MONTH_NAMES[selector.month === 1 ? 11 : selector.month - 2].toLowerCase()}`;
  if (selector.month === 0) return isPartial ? 'da inizio anno' : "sull'anno";
  if (selector.month === -1) return 'da inizio anno';
  return `dal ${selector.year}`;
}

/**
 * The companion's first tile — the net worth the assistant reasons on. With a period attached
 * it is the period's closing snapshot with its change (the bundle's numbers, the same the
 * prompt receives); with no period it is today's figure from the Panoramica's payload, with
 * the same two chips the Panoramica shows. The reading names what the hero figure does not:
 * the start of the journey, or the basis of today's value.
 */
export function PatrimonioContestoTile(props: PatrimonioContestoTileProps) {
  if (props.mode === 'today') {
    const { overview } = props;
    const totalValue = overview?.metrics.totalValue ?? null;
    return (
      <Tile eyebrow="Patrimonio oggi" aside="a prezzi correnti" reading={describeNetWorthToday(totalValue, overview?.flags.assetCount ?? 0)}>
        {overview === undefined ? (
          <Skeleton className="mt-2.5 h-9 w-40" />
        ) : overview === null ? (
          <p className="mt-3 text-[13px] text-muted-foreground">I dati della Panoramica non sono disponibili.</p>
        ) : (
          <>
            <span className={HERO_CLASS}>{cachedFormatCurrencyEUR(overview.metrics.totalValue, true)}</span>
            {(overview.variations.monthly || overview.variations.yearly || overview.ath?.isNewATH) && (
              <div className="mt-4 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2">
                {overview.variations.monthly && (
                  <VariationChip value={overview.variations.monthly.value} percentage={overview.variations.monthly.percentage} caption="questo mese" />
                )}
                {overview.variations.yearly && (
                  <VariationChip value={overview.variations.yearly.value} percentage={overview.variations.yearly.percentage} caption="da inizio anno" />
                )}
                {overview.ath?.isNewATH && (
                  <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-positive/10 px-[11px] py-[6px] text-[12px] font-semibold leading-none text-positive">
                    <Trophy className="h-[13px] w-[13px]" aria-hidden="true" />
                    Massimo storico
                  </span>
                )}
              </div>
            )}
            <p className="mt-3.5 border-t border-border pt-3.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {overview.flags.currentMonthSnapshotExists ? 'Rilevazione del mese presente' : 'Nessuna rilevazione questo mese'} · al lordo delle tasse stimate
            </p>
          </>
        )}
      </Tile>
    );
  }

  const { bundle, today } = props;
  const { selector, netWorth, cashflow, dataQuality } = bundle;
  const aside = `${getAssistantPeriodLabel(selector)}${dataQuality.isPartialMonth ? ' · in corso' : ''}`;

  return (
    <Tile eyebrow="Patrimonio nel periodo" aside={aside} reading={describePeriodNetWorth(bundle, today)}>
      {netWorth.end !== null ? (
        <>
          <span className={HERO_CLASS}>{cachedFormatCurrencyEUR(netWorth.end, true)}</span>
          {netWorth.delta !== null && netWorth.deltaPct !== null && (
            <div className="mt-4 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2">
              <VariationChip value={netWorth.delta} percentage={netWorth.deltaPct} caption={periodChipCaption(selector, dataQuality.isPartialMonth)} />
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessuna rilevazione del patrimonio per questo periodo.</p>
      )}

      {/* What the numbers rest on: the rows that fed the cashflow, and every limit the
          builder declared — a limit either does not exist or announces itself. */}
      <div className="mt-3.5 flex flex-col gap-1 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        {dataQuality.hasCashflowData && (
          <p className="font-mono tabular-nums">
            {cashflow.transactionCount} {cashflow.transactionCount === 1 ? 'movimento' : 'movimenti'} · {cashflow.expenseTransactionCount}{' '}
            {cashflow.expenseTransactionCount === 1 ? 'spesa' : 'spese'}
          </p>
        )}
        {dataQuality.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </Tile>
  );
}
