import { DoublingTimeSummary } from '@/types/assets';
import { MetricCard } from '@/components/performance/MetricCard';
import { formatCurrency } from '@/lib/services/chartService';

interface DoublingTimeSummaryCardsProps {
  summary: DoublingTimeSummary;
}

/**
 * Display summary metrics for doubling time analysis.
 *
 * Shows three key metrics in a responsive grid:
 * 1. Fastest Doubling - shortest time to double net worth
 * 2. Average Doubling Time - mean duration across all doublings
 * 3. Total Milestones - count of completed doublings
 *
 * Uses MetricCard component with format='months' to display durations.
 * Grid layout: 1-col (mobile) → 2-col (tablet) → 3-col (desktop)
 *
 * @param summary - Doubling time summary with milestones and statistics
 */
export function DoublingTimeSummaryCards({ summary }: DoublingTimeSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 desktop:grid-cols-3 gap-4">
      {/* Card 1: Fastest Doubling */}
      <MetricCard
        title="Raddoppio Più Rapido"
        value={summary.fastestDoubling?.durationMonths ?? null}
        format="months"
        subtitle={
          summary.fastestDoubling
            ? `${summary.fastestDoubling.periodLabel} (${formatCurrency(
                summary.fastestDoubling.startValue
              )} → ${formatCurrency(summary.fastestDoubling.endValue)})`
            : undefined
        }
        tooltip="Il periodo più breve in cui il patrimonio è raddoppiato. Indica il momento di crescita più veloce, spesso dovuto a bull market o contributi consistenti."
      />

      {/* Card 2: Average Doubling Time */}
      <MetricCard
        title="Tempo Medio di Raddoppio"
        value={summary.averageMonths ?? null}
        format="months"
        subtitle={
          summary.totalDoublings > 0
            ? `Basato su ${summary.totalDoublings} ${
                summary.totalDoublings === 1 ? 'raddoppio' : 'raddoppi'
              }`
            : undefined
        }
        tooltip="Tempo medio necessario per raddoppiare il patrimonio nel corso della storia del portafoglio. Un valore in diminuzione indica accelerazione della crescita."
      />

      {/* Card 3: Total Doublings Count */}
      <MetricCard
        title="Milestone Completate"
        value={summary.totalDoublings}
        format="number"
        subtitle={
          summary.currentDoublingInProgress
            ? `Prossima: ${summary.currentDoublingInProgress.progressPercentage?.toFixed(
                0
              )}% completata`
            : summary.totalDoublings > 0
            ? 'Ottimo lavoro!'
            : undefined
        }
        tooltip="Numero totale di traguardi raggiunti. Più milestone significano una storia di crescita consistente nel tempo."
      />
    </div>
  );
}
