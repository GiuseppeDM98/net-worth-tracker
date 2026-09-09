'use client';

/**
 * RADDOPPI — «quante volte è raddoppiato, e quando arriva il prossimo?»: the mode toggle
 * (Geometrico | Traguardi) as the aside, two KPIs (the page's one pace and the projected date),
 * the completed milestones as flat rows and the one in progress with a 3px track, then the
 * footer that says what the pace is and that the estimate is linear.
 *
 * The milestones come from `prepareDoublingTimeData` (chartService, unchanged); the projection
 * from `projectNextDoubling` (storicoSummary.ts) on the SAME pace the verdict uses; the words
 * from `describeDoublings`. The confetti of the old timeline survives: a completed milestone is
 * celebrated once, and `celebrationUtils` remembers it.
 */

import { useEffect } from 'react';
import type { DoublingMilestone, DoublingMode, DoublingTimeSummary } from '@/types/assets';
import type { Narrative } from '@/lib/utils/narrative';
import type { DoublingProjection, GrowthPace } from '@/lib/utils/storicoSummary';
import { formatDurationLong, formatDurationShort, formatPeriodMonthShort } from '@/lib/utils/storicoNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { hasCelebrated, markCelebrated, shouldReduceMotion } from '@/lib/utils/celebrationUtils';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AsideToggle } from '@/components/ui/aside-toggle';

const MODE_OPTIONS: ReadonlyArray<{ value: DoublingMode; label: string }> = [
  { value: 'geometric', label: 'Geometrico' },
  { value: 'threshold', label: 'Traguardi' },
];

interface RaddoppiTileProps {
  reading: Narrative;
  summary: DoublingTimeSummary;
  mode: DoublingMode;
  onModeChange: (mode: DoublingMode) => void;
  projection: DoublingProjection | null;
  pace: GrowthPace;
  /** The latest snapshot's value — the row's centre figure; never rebuilt from the 99-capped progress. */
  latestValue: number;
  className?: string;
}

/** «1° raddoppio» in geometric mode, the amount in threshold mode. */
function milestoneLabel(milestone: DoublingMilestone): string {
  if (milestone.milestoneType === 'threshold' && milestone.thresholdValue) return cachedFormatCurrencyEUR(milestone.thresholdValue, true);
  return `${milestone.milestoneNumber}° raddoppio`;
}

function Kpi({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="min-w-0">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className="mt-1.5 font-mono text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums text-foreground">{value}</p>
      <p className="mt-1.5 text-[11px] leading-[1.4] text-muted-foreground">{caption}</p>
    </div>
  );
}

function MilestoneRow({ milestone }: { milestone: DoublingMilestone }) {
  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-foreground">{milestoneLabel(milestone)}</span>
        <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">{formatDurationShort(milestone.durationMonths)}</span>
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatPeriodMonthShort(milestone.startDate)} → {formatPeriodMonthShort(milestone.endDate)} · {cachedFormatCurrencyEUR(milestone.startValue, true)} →{' '}
        {cachedFormatCurrencyEUR(milestone.endValue, true)}
      </span>
    </div>
  );
}

/** The milestone in progress: its label, how long it has been running, and the 3px track. */
function InProgressRow({ milestone, latestValue }: { milestone: DoublingMilestone; latestValue: number }) {
  const progress = Math.min(100, Math.max(0, Math.round(milestone.progressPercentage ?? 0)));
  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-foreground">
          {milestoneLabel(milestone)} <span className="text-muted-foreground">· in corso</span>
        </span>
        <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">{progress}%</span>
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        da {formatPeriodMonthShort(milestone.startDate)} · {formatDurationShort(milestone.durationMonths)} finora
      </span>
      <div
        className="mt-1 h-[3px] overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Avanzamento verso ${cachedFormatCurrencyEUR(milestone.endValue, true)}`}
      >
        <div className="h-full rounded-full bg-foreground" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>{cachedFormatCurrencyEUR(milestone.startValue, true)}</span>
        <span className="text-foreground">{cachedFormatCurrencyEUR(latestValue, true)}</span>
        <span>{cachedFormatCurrencyEUR(milestone.endValue, true)}</span>
      </div>
    </div>
  );
}

export function RaddoppiTile({ reading, summary, mode, onModeChange, projection, pace, latestValue, className }: RaddoppiTileProps) {
  const completed = summary.milestones.filter((m) => m.isComplete);
  const current = summary.currentDoublingInProgress;

  // Celebrate each newly completed milestone once; canvas-confetti stays out of the main bundle.
  // The delay lets the tile settle before the burst; the key is marked before the animation runs.
  useEffect(() => {
    if (shouldReduceMotion() || completed.length === 0) return;
    const uncelebrated = completed.filter((m) => !hasCelebrated(`milestone_${m.milestoneType}_${m.milestoneNumber}`));
    if (uncelebrated.length === 0) return;
    const timer = setTimeout(async () => {
      const confetti = (await import('canvas-confetti')).default;
      for (const milestone of uncelebrated) {
        markCelebrated(`milestone_${milestone.milestoneType}_${milestone.milestoneNumber}`);
        // canvas-confetti draws on a canvas, where a CSS variable cannot be read: literal colours.
        confetti({ colors: ['#10B981', '#F59E0B', '#ffffff', '#6EE7B7'], particleCount: 60, spread: 70, origin: { y: 0.6 }, gravity: 1.2, scalar: 0.8 });
      }
    }, 800);
    return () => clearTimeout(timer);
    // The milestone list is derived from `summary`; re-running on it is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const nextLabel = mode === 'threshold' ? 'Prossimo traguardo' : 'Prossimo raddoppio';

  return (
    <Tile
      eyebrow="Raddoppi"
      aside={<AsideToggle options={MODE_OPTIONS} value={mode} onChange={onModeChange} ariaLabel="Lettura dei raddoppi" />}
      reading={reading}
      className={className}
      ariaLabel="Raddoppi del patrimonio"
    >
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Kpi
          label="Ritmo ultimi 12 mesi"
          value={pace.trailingMonthly === null ? '—' : `${pace.trailingMonthly < 0 ? '−' : ''}${cachedFormatCurrencyEUR(Math.abs(pace.trailingMonthly), true)}`}
          caption={pace.trailingMonthly === null ? 'serve lo snapshot di dodici mesi fa' : 'al mese, versamenti inclusi'}
        />
        <Kpi
          label={nextLabel}
          value={projection ? formatPeriodMonthShort(projection.eta) : '—'}
          caption={
            projection
              ? `tra ${formatDurationLong(projection.monthsToTarget)}, al ritmo attuale`
              : !current
                ? completed.length > 0 && mode === 'threshold'
                  ? "sotto l'ultimo traguardo superato"
                  : 'nessun traguardo in corso'
                : pace.trailingMonthly === null
                  ? 'ritmo non misurabile'
                  : 'al ritmo attuale non si avvicina'
          }
        />
      </div>

      {(completed.length > 0 || current) && (
        <div className="mt-4 flex flex-col divide-y divide-border border-t border-border">
          {completed.map((milestone) => (
            <MilestoneRow key={`${milestone.milestoneType}-${milestone.milestoneNumber}`} milestone={milestone} />
          ))}
          {current && <InProgressRow milestone={current} latestValue={latestValue} />}
        </div>
      )}

      <p className={cn('mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground', completed.length === 0 && !current && 'pt-4')}>
        {mode === 'threshold'
          ? 'I traguardi sono 100.000, 200.000 e 500.000 €, poi 1 e 2 milioni; quelli già superati dal primo snapshot non contano. '
          : 'Ogni raddoppio parte dal valore raggiunto dal precedente. '}
        Il ritmo è l&apos;aumento medio mensile degli ultimi 12 mesi, versamenti inclusi; la data è una proiezione lineare, non una previsione.
      </p>
    </Tile>
  );
}
