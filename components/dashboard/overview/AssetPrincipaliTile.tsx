import Link from 'next/link';
import type { DashboardOverviewTopAsset } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { OverviewTile } from './OverviewTile';

const MAX_ROWS = 5;

interface AssetPrincipaliTileProps {
  topAssets: DashboardOverviewTopAsset[];
  assetCount: number;
  className?: string;
}

/**
 * "Cosa pesa di più?" — the largest positions with weight and return, a doorway to Patrimonio.
 * `returnPercent` is null for positions without a cost basis (cash, imports): rendered as "–",
 * never as 0, which would claim a measured flat return.
 */
export function AssetPrincipaliTile({ topAssets, assetCount, className }: AssetPrincipaliTileProps) {
  const rows = topAssets.slice(0, MAX_ROWS);

  return (
    <OverviewTile
      eyebrow="Asset principali"
      aside={
        <span>
          {rows.length} di {assetCount} · valore · peso · rendimento
        </span>
      }
      className={className}
    >
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Aggiungi asset per iniziare.</p>
      ) : (
        <div className="mt-2 flex flex-col divide-y divide-border">
          {rows.map((asset) => (
            <div key={asset.id} className="flex items-center gap-3 py-[9px]">
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{asset.name}</span>
              <span className="w-[84px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(asset.totalValue, true)}
              </span>
              <span className="w-[48px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatPercentage(asset.portfolioPercent, 1)}
              </span>
              <span
                className={cn(
                  'w-[56px] shrink-0 text-right font-mono text-[12px] tabular-nums',
                  getMetricValueColor(asset.returnPercent, 'percentage'),
                )}
              >
                {asset.returnPercent === null
                  ? '–'
                  : `${asset.returnPercent >= 0 ? '+' : '−'}${formatPercentage(Math.abs(asset.returnPercent), 1)}`}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        {assetCount > rows.length ? `Tutti e ${assetCount} in ` : 'Dettaglio in '}
        <Link href="/dashboard/assets" className="text-foreground underline-offset-2 hover:underline">
          Patrimonio
        </Link>
        .
      </p>
    </OverviewTile>
  );
}
