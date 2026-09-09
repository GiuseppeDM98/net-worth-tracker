import type { DashboardOverviewPayload } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { describeLiquidity } from '@/lib/utils/overviewNarrative';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { OverviewTile, TILE_EYEBROW_CLASS } from './OverviewTile';

interface SintesiTileProps {
  metrics: DashboardOverviewPayload['metrics'];
  hasCostBasisTracking: boolean;
  className?: string;
}

/**
 * "Quanto è liquidabile?" — the three-way split of the gross total, then the net figure after
 * estimated taxes when cost-basis tracking makes it knowable.
 */
export function SintesiTile({ metrics, hasCostBasisTracking, className }: SintesiTileProps) {
  const total = metrics.totalValue;
  const rows = [
    { label: 'Liquidità', value: metrics.cashNetWorth },
    { label: 'Liquidabili', value: metrics.liquidInvestmentsNetWorth },
    { label: 'Illiquidi', value: metrics.illiquidNetWorth },
  ];

  return (
    <OverviewTile
      eyebrow="Sintesi patrimoniale"
      reading={describeLiquidity(metrics.cashNetWorth, metrics.liquidInvestmentsNetWorth, total)}
      className={className}
    >
      {total > 0 ? (
        <div className="mt-2.5 flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-[9px]">
              <span className="text-[13px] text-muted-foreground">{row.label}</span>
              <span className="flex items-baseline gap-2.5 whitespace-nowrap">
                <span className="font-mono text-[14px] tabular-nums text-foreground">
                  {cachedFormatCurrencyEUR(row.value)}
                </span>
                <span className="w-[44px] text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatPercentage((row.value / total) * 100, 1)}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Il riepilogo per classe apparirà dopo il primo asset.
        </p>
      )}

      {hasCostBasisTracking && (
        <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3.5">
          <p className={TILE_EYEBROW_CLASS}>Patrimonio netto</p>
          <p className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
            {cachedFormatCurrencyEUR(metrics.netTotal)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            dopo{' '}
            <span className="font-mono tabular-nums text-warning-foreground">
              {cachedFormatCurrencyEUR(metrics.estimatedTaxes, true)}
            </span>{' '}
            di tasse stimate su{' '}
            <span className={cn('font-mono tabular-nums', signTextClass(metrics.unrealizedGains))}>
              {metrics.unrealizedGains >= 0 ? '+' : '−'}
              {cachedFormatCurrencyEUR(Math.abs(metrics.unrealizedGains), true)}
            </span>
          </p>
        </div>
      )}
    </OverviewTile>
  );
}
