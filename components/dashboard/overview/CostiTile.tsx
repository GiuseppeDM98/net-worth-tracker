import type { DashboardOverviewCostDriver, DashboardOverviewPayload } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { describeCosts } from '@/lib/utils/overviewNarrative';
import { cn } from '@/lib/utils';
import { OverviewTile, TILE_SUB_EYEBROW_CLASS } from './OverviewTile';

const MAX_DRIVERS = 3;

interface CostiTileProps {
  metrics: DashboardOverviewPayload['metrics'];
  flags: DashboardOverviewPayload['flags'];
  /** Held instruments by annual TER cost, largest first. */
  costDrivers: DashboardOverviewCostDriver[];
  className?: string;
}

/**
 * "Quanto mi costa, e per cosa?" — weighted TER and the estimated annual cost (TER + stamp
 * duty) side by side, then the instruments the TER cost actually comes from.
 */
export function CostiTile({ metrics, flags, costDrivers, className }: CostiTileProps) {
  const annualTotal = (metrics.annualPortfolioCost ?? 0) + (metrics.annualStampDuty ?? 0);
  const bothPresent = flags.hasTERTracking && flags.hasStampDuty;
  const drivers = costDrivers.slice(0, MAX_DRIVERS);

  return (
    <OverviewTile
      eyebrow="Costi"
      aside="stima annua"
      reading={describeCosts(annualTotal, metrics.totalValue)}
      className={className}
    >
      <div
        className={cn(
          'mt-4 grid gap-4',
          flags.hasTERTracking ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {flags.hasTERTracking && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className={TILE_SUB_EYEBROW_CLASS}>TER medio</p>
            <p className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
              {formatPercentage(metrics.portfolioTER)}
            </p>
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Costo annuo</p>
          <p className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-warning-foreground">
            {cachedFormatCurrencyEUR(annualTotal, true)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {bothPresent ? (
          <>
            TER <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(metrics.annualPortfolioCost, true)}</span>
            {' · '}bollo <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(metrics.annualStampDuty, true)}</span>
          </>
        ) : flags.hasTERTracking ? (
          'costi di gestione stimati'
        ) : (
          'imposta di bollo stimata'
        )}
      </p>

      {drivers.length > 0 && (
        <div className="mt-auto flex flex-col border-t border-border pt-3.5">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-0.5')}>Pesano di più</p>
          <div className="flex flex-col divide-y divide-border">
            {drivers.map((driver) => (
              <div key={driver.id} className="flex items-center justify-between gap-3 py-[8px]">
                <span className="min-w-0 truncate text-[13px] text-foreground">{driver.name}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatPercentage(driver.totalExpenseRatio)}
                  </span>
                  <span className="w-[52px] text-right font-mono text-[13px] tabular-nums text-foreground">
                    {cachedFormatCurrencyEUR(driver.annualCost, true)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </OverviewTile>
  );
}
