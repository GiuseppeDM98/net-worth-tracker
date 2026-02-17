import { DoublingTimeSummary, DoublingMode } from '@/types/assets';
import { MetricCard } from '@/components/performance/MetricCard';
import { formatCurrency } from '@/lib/services/chartService';

interface DoublingTimeSummaryCardsProps {
  summary: DoublingTimeSummary;
  doublingMode: DoublingMode;
}

/**
 * Display summary metrics for doubling time analysis.
 *
 * Shows three key metrics in a responsive grid:
 * 1. Fastest milestone - shortest time to reach a milestone
 * 2. Average milestone time - mean duration across all milestones
 * 3. Total milestones - count of completed milestones
 *
 * Titles, tooltips, and subtitles adapt based on doublingMode:
 * - 'geometric': language about "raddoppio" (doubling)
 * - 'threshold': language about "traguardo" (fixed milestone)
 *
 * @param summary - Doubling time summary with milestones and statistics
 * @param doublingMode - Current mode: 'geometric' (2x, 4x...) or 'threshold' (€100k, €200k...)
 */
export function DoublingTimeSummaryCards({ summary, doublingMode }: DoublingTimeSummaryCardsProps) {
  const isThreshold = doublingMode === 'threshold';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 desktop:grid-cols-3 gap-4">
      {/* Card 1: Fastest milestone */}
      <MetricCard
        title={isThreshold ? 'Traguardo Più Rapido' : 'Raddoppio Più Rapido'}
        value={summary.fastestDoubling?.durationMonths ?? null}
        format="months"
        subtitle={
          summary.fastestDoubling
            ? `${summary.fastestDoubling.periodLabel} (${formatCurrency(
                summary.fastestDoubling.startValue
              )} → ${formatCurrency(summary.fastestDoubling.endValue)})`
            : undefined
        }
        tooltip={
          isThreshold
            ? 'Il periodo più breve per raggiungere un traguardo fisso (es. €100k, €200k). Indica la fase di accumulo più veloce nel tuo percorso.'
            : 'Il periodo più breve in cui il patrimonio è raddoppiato. Indica il momento di crescita più veloce, spesso dovuto a bull market o contributi consistenti.'
        }
      />

      {/* Card 2: Average milestone time */}
      <MetricCard
        title={isThreshold ? 'Tempo Medio per Traguardo' : 'Tempo Medio di Raddoppio'}
        value={summary.averageMonths ?? null}
        format="months"
        subtitle={
          summary.totalDoublings > 0
            ? `Basato su ${summary.totalDoublings} ${
                summary.totalDoublings === 1
                  ? (isThreshold ? 'traguardo' : 'raddoppio')
                  : (isThreshold ? 'traguardi' : 'raddoppi')
              }`
            : undefined
        }
        tooltip={
          isThreshold
            ? 'Tempo medio necessario per raggiungere ciascun traguardo fisso. Un valore in diminuzione indica che il patrimonio cresce sempre più velocemente.'
            : 'Tempo medio necessario per raddoppiare il patrimonio nel corso della storia del portafoglio. Un valore in diminuzione indica accelerazione della crescita.'
        }
      />

      {/* Card 3: Total milestones count */}
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
        tooltip={
          isThreshold
            ? 'Numero totale di soglie fisse superate. Ogni traguardo segna un livello di patrimonio raggiunto (es. €100k, €200k, €500k).'
            : 'Numero totale di traguardi raggiunti. Più milestone significano una storia di crescita consistente nel tempo.'
        }
      />
    </div>
  );
}
