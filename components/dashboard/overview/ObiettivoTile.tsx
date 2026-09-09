import type { DashboardOverviewGoalProgress } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { describeGoal } from '@/lib/utils/overviewNarrative';
import { cn } from '@/lib/utils';
import { OverviewTile } from './OverviewTile';

/** How many goals fit the tile at desktop height without scrolling. */
const MAX_GOALS = 3;

interface ObiettivoTileProps {
  /** In featured order (priority, then progress) — the tile shows the first MAX_GOALS. */
  goals: DashboardOverviewGoalProgress[];
  className?: string;
}

function GoalRow({ goal, hero }: { goal: DashboardOverviewGoalProgress; hero: boolean }) {
  const progress = Math.min(100, Math.max(0, goal.progressPercentage));

  return (
    <div className={cn('flex flex-col', hero ? 'gap-2.5' : 'gap-2')}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('min-w-0 truncate text-foreground', hero ? 'text-[13px] font-semibold' : 'text-[13px]')}>
          {goal.goalName}
        </span>
        <span
          className={cn(
            'shrink-0 font-mono font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground',
            hero ? 'text-[36px]' : 'text-[18px]',
          )}
        >
          {Math.round(goal.progressPercentage)}%
        </span>
      </div>
      <div
        className="h-[3px] overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-label={`Avanzamento ${goal.goalName}`}
      >
        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: goal.goalColor }} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        <span className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(goal.currentValue, true)}</span>
        {' di '}
        <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(goal.targetAmount, true)}</span>
        {goal.targetAmount > goal.currentValue && (
          <>
            {' · mancano '}
            <span className="font-mono tabular-nums">
              {cachedFormatCurrencyEUR(goal.targetAmount - goal.currentValue, true)}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/**
 * "A che punto sono gli obiettivi?" — the featured goal large, the next ones under it as
 * compact rows, so the tile's desktop height is spent on goals rather than on air.
 */
export function ObiettivoTile({ goals, className }: ObiettivoTileProps) {
  const shown = goals.slice(0, MAX_GOALS);
  const [featured, ...others] = shown;
  const single = shown.length === 1;

  return (
    <OverviewTile
      eyebrow={single ? 'Obiettivo' : 'Obiettivi'}
      aside={
        single ? (
          <span className="truncate">{featured.goalName}</span>
        ) : (
          <span>
            {shown.length} di {goals.length} in corso
          </span>
        )
      }
      reading={single ? describeGoal(featured.currentValue, featured.targetAmount) : undefined}
      ariaLabel={single ? `Obiettivo ${featured.goalName}` : 'Obiettivi'}
      className={className}
    >
      <div className="mt-4 flex flex-col divide-y divide-border">
        <div className="pb-3.5 first:pt-0">
          <GoalRow goal={featured} hero={true} />
        </div>
        {others.map((goal) => (
          <div key={goal.goalId} className="py-3.5 last:pb-0">
            <GoalRow goal={goal} hero={false} />
          </div>
        ))}
      </div>
    </OverviewTile>
  );
}
